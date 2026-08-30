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
import com.Colota.backup.BackupOrphanCleanup
import com.Colota.data.DatabaseHelper
import com.Colota.export.AutoExportScheduler
import com.Colota.util.AppLogger
import com.Colota.util.SecureStorageHelper
import com.facebook.react.bridge.JavaOnlyArray
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.BridgeReactContext
import io.mockk.*
import kotlinx.coroutines.Dispatchers
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
        return outcome
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
