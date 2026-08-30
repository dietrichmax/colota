/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.bridge

import android.app.AlarmManager
import android.content.Context
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.testing.WorkManagerTestInitHelper
import com.Colota.backup.BackupBuilder
import com.Colota.backup.BackupError
import com.Colota.backup.BackupException
import com.Colota.backup.BackupOrphanCleanup
import com.Colota.backup.BackupRestorer
import com.Colota.data.DatabaseHelper
import com.Colota.data.SettingsKeys
import com.Colota.export.AutoExportScheduler
import com.Colota.service.LocationForegroundService
import com.Colota.triggers.TrackingControl
import com.Colota.util.AppLogger
import com.Colota.util.SecureStorageHelper
import com.facebook.react.bridge.JavaOnlyArray
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.BridgeReactContext
import io.mockk.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.shadows.ShadowStatFs
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class BackupServiceModuleTest {

    private lateinit var context: Context
    private lateinit var db: DatabaseHelper
    private lateinit var alarmManager: AlarmManager
    private lateinit var secureStorage: SecureStorageHelper
    private lateinit var module: BackupServiceModule

    private val password = "correct horse battery staple".toCharArray()
    private val backupUri: Uri = Uri.parse("content://com.android.externalstorage.documents/document/backup.colota")

    private class Outcome {
        val settled = CountDownLatch(1)
        val rearmed = CountDownLatch(1)
        var resolved = false
        var rejectCode: String? = null
    }

    @Before
    fun setUp() {
        // The test thread is Main under Robolectric, so the real dispatcher deadlocks startForegroundOnMain
        Dispatchers.setMain(UnconfinedTestDispatcher())
        context = ApplicationProvider.getApplicationContext()
        resetDbSingleton()
        db = DatabaseHelper.getInstance(context)
        alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        // A parked executor leaves enqueued work unfinished, so a cancel stays observable
        WorkManagerTestInitHelper.initializeTestWorkManager(context, Configuration.Builder().setExecutor { }.build())

        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs

        // The module's own BackupRestorer would build a real SecureStorageHelper, which needs a Keystore the JVM lacks
        secureStorage = mockk(relaxed = true)
        every { secureStorage.exportPlaintextForBackup() } returns mapOf("auth_type" to "none")
        mockkObject(SecureStorageHelper.Companion)
        every { SecureStorageHelper.getInstance(any()) } returns secureStorage

        mockkObject(AutoExportScheduler)
        mockkConstructor(BackupRestorer::class)
        every { anyConstructed<BackupRestorer>().restore(any(), any()) } answers { callOriginal() }
        mockkObject(TrackingControl)
        every { TrackingControl.start(any(), any()) } just Runs

        // restoreBackup awaits the orphan sweep, which only MainApplication.onCreate starts
        BackupOrphanCleanup.start(context)
        // An unregistered cache dir reports 0 free bytes, aborting the restore before it cancels the alarm
        ShadowStatFs.registerStats(context.cacheDir, 10_000_000, 10_000_000, 10_000_000)

        AutoExportScheduler.cancel(context)
        listOf(
            "autoExportEnabled", "autoExportFormat", "autoExportInterval", "autoExportMode",
            "autoExportTimeOfDay", "autoExportWeeklyDow", "autoExportMonthlyDom",
            "lastAutoExportTimestamp", "autoExportEnabledAt"
        ).forEach { db.saveSetting(it, "") }

        module = BackupServiceModule(BridgeReactContext(context))
    }

    @After
    fun tearDown() {
        unmockkObject(AutoExportScheduler)
        unmockkConstructor(BackupRestorer::class)
        unmockkObject(TrackingControl)
        unmockkObject(SecureStorageHelper.Companion)
        unmockkObject(AppLogger)
        DatabaseHelper.getInstance(context).close()
        resetDbSingleton()
        Dispatchers.resetMain()
    }

    @Test
    fun `a restore arms the auto-export alarm from the restored settings`() {
        enableAutoExport()
        val backup = backupBytes()
        db.saveSetting("autoExportEnabled", "false")
        assertTrue(shadowOf(alarmManager).scheduledAlarms.isEmpty())

        val outcome = restore(backup, password)

        assertTrue("restore should resolve", outcome.resolved)
        assertEquals("the restored DB enables auto-export, so the alarm must exist", 1, shadowOf(alarmManager).scheduledAlarms.size)
    }

    @Test
    fun `a restore that fails after the writers were paused arms the alarm again`() {
        enableAutoExport()
        val backup = backupBytes()
        AutoExportScheduler.scheduleNext(context)
        assertEquals(1, shadowOf(alarmManager).scheduledAlarms.size)

        val outcome = restore(backup, "wrong".toCharArray())

        assertEquals("E_BACKUP_WRONG_PASSWORD", outcome.rejectCode)
        assertEquals("pauseAllDbWriters cancelled the alarm before the password failed", 1, shadowOf(alarmManager).scheduledAlarms.size)
    }

    @Test
    fun `a restore whose backup has auto-export off leaves no alarm`() {
        db.saveSetting("autoExportEnabled", "false")
        val backup = backupBytes()
        enableAutoExport()
        AutoExportScheduler.scheduleNext(context)
        assertEquals(1, shadowOf(alarmManager).scheduledAlarms.size)

        val outcome = restore(backup, password)

        assertTrue("restore should resolve", outcome.resolved)
        assertTrue("the alarm follows the restored DB, not the one replaced", shadowOf(alarmManager).scheduledAlarms.isEmpty())
    }

    @Test
    fun `a failed restore restarts the tracking it stopped`() {
        enableAutoExport()
        val backup = backupBytes()
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "true")

        val outcome = restore(backup, "wrong".toCharArray())

        assertEquals("E_BACKUP_WRONG_PASSWORD", outcome.rejectCode)
        verify(exactly = 1) { TrackingControl.start(any(), "Resumed after a failed restore") }
    }

    @Test
    fun `a failed restore leaves tracking off when it was already off`() {
        enableAutoExport()
        val backup = backupBytes()
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "false")

        val outcome = restore(backup, "wrong".toCharArray())

        assertEquals("E_BACKUP_WRONG_PASSWORD", outcome.rejectCode)
        verify(exactly = 0) { TrackingControl.start(any(), any()) }
    }

    @Test
    fun `a successful restore leaves tracking stopped on purpose`() {
        enableAutoExport()
        val backup = backupBytes()
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "true")

        val outcome = restore(backup, password)

        assertTrue("restore should resolve", outcome.resolved)
        verify(exactly = 0) { TrackingControl.start(any(), any()) }
        assertEquals("false", db.getSetting(SettingsKeys.TRACKING_ENABLED, "true"))
    }

    @Test
    fun `a restore that replaced the database keeps tracking off even when it then fails`() {
        enableAutoExport()
        val backup = backupBytes()
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "true")
        // Secrets fail after the swap, so the live DB is the backup's and the destination-device rule applies
        every { anyConstructed<BackupRestorer>().restore(any(), any()) } throws
            BackupException(BackupError.SECRETS_PARTIAL, "credentials could not be applied")

        val outcome = restore(backup, password)

        assertEquals("E_BACKUP_SECRETS_PARTIAL", outcome.rejectCode)
        verify(exactly = 0) { TrackingControl.start(any(), any()) }
    }

    @Test
    fun `a restore aborted by a writer that would not stop resumes tracking`() {
        enableAutoExport()
        val backup = backupBytes()
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "true")
        // pauseAllDbWriters throws instead of returning, which is why the flag is read before it runs
        mockkObject(LocationForegroundService.Companion)
        try {
            every { LocationForegroundService.isRunning } returns true

            val outcome = restore(backup, password)

            assertEquals("E_BACKUP_PRECONDITION", outcome.rejectCode)
            verify(exactly = 1) { TrackingControl.start(any(), "Resumed after a failed restore") }
        } finally {
            unmockkObject(LocationForegroundService.Companion)
        }
    }

    @Test
    fun `the resume writes the tracking flag itself so a denied start still recovers`() {
        enableAutoExport()
        val backup = backupBytes()
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "true")
        // Left false, the watchdog the denied start arms disarms itself on its first tick
        every { TrackingControl.start(any(), any()) } just Runs

        restore(backup, "wrong".toCharArray())

        assertEquals("true", db.getSetting(SettingsKeys.TRACKING_ENABLED, "false"))
    }

    @Test
    fun `a denied resume leaves the module usable`() {
        enableAutoExport()
        val backup = backupBytes()
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "true")
        every { TrackingControl.start(any(), any()) } throws IllegalStateException("FGS start denied")

        val denied = restore(backup, "wrong".toCharArray())
        assertEquals("E_BACKUP_WRONG_PASSWORD", denied.rejectCode)

        // An escaping resume would strand operationMutex and lock out every later backup and restore
        every { TrackingControl.start(any(), any()) } just Runs
        val next = restore(backup, "wrong".toCharArray())
        assertEquals("E_BACKUP_WRONG_PASSWORD", next.rejectCode)
    }

    // promise.resolve fires before the finally re-arms, so the re-arm needs its own latch
    private fun restore(backup: ByteArray, pw: CharArray): Outcome {
        val outcome = Outcome()
        every { AutoExportScheduler.scheduleNext(any()) } answers {
            callOriginal()
            outcome.rearmed.countDown()
        }
        shadowOf(context.contentResolver).registerInputStream(backupUri, ByteArrayInputStream(backup))
        val promise = mockk<Promise>()
        every { promise.resolve(any()) } answers {
            outcome.resolved = true
            outcome.settled.countDown()
        }
        every { promise.reject(any<String>(), any<String>(), any<Throwable>()) } answers {
            outcome.rejectCode = firstArg()
            outcome.settled.countDown()
        }

        module.restoreBackup(backupUri.toString(), JavaOnlyArray.of(*pw.map { it.code as Any }.toTypedArray()), promise)

        assertTrue("restore did not settle", outcome.settled.await(30, TimeUnit.SECONDS))
        assertTrue("restore finished without re-arming", outcome.rearmed.await(10, TimeUnit.SECONDS))
        awaitIdle()
        return outcome
    }

    // The resume runs after both latches; the mutex is released by the finally's last statement,
    // which makes "the whole finally is done" observable instead of a guessed delay.
    private fun awaitIdle() {
        val field = BackupServiceModule::class.java.getDeclaredField("operationMutex")
        field.isAccessible = true
        val mutex = field.get(module) as Mutex
        val deadline = System.currentTimeMillis() + 10_000
        while (mutex.isLocked && System.currentTimeMillis() < deadline) Thread.sleep(10)
        assertFalse("restore never released the operation mutex", mutex.isLocked)
    }

    private fun enableAutoExport() {
        db.saveSetting("autoExportEnabled", "true")
        db.saveSetting("autoExportInterval", "daily")
        db.saveSetting("autoExportTimeOfDay", "09:00")
    }

    private fun backupBytes(): ByteArray = ByteArrayOutputStream().apply {
        BackupBuilder(context, db, secureStorage).build(this, password)
    }.toByteArray()

    private fun resetDbSingleton() {
        val field = DatabaseHelper::class.java.getDeclaredField("INSTANCE")
        field.isAccessible = true
        field.set(null, null)
    }
}
