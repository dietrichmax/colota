package com.Colota.export

import android.database.sqlite.SQLiteException
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.testing.TestListenableWorkerBuilder
import com.Colota.data.DatabaseHelper
import com.Colota.util.AppLogger
import io.mockk.*
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A read that fails mid-export must retry and must not advance the incremental watermark. */
@RunWith(RobolectricTestRunner::class)
class AutoExportWorkerReadFailureTest {

    private lateinit var db: DatabaseHelper
    private lateinit var spy: DatabaseHelper

    @Before
    fun setUp() {
        resetSingleton()
        db = DatabaseHelper.getInstance(ApplicationProvider.getApplicationContext())

        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs

        db.saveSetting("autoExportEnabled", "true")
        db.saveSetting("autoExportUri", "content://com.android.externalstorage.documents/tree/primary%3AColota")
        db.saveSetting("autoExportMode", "incremental")
        db.saveSetting("lastAutoExportTimestamp", "1700000000")
        db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1700000500L)

        spy = spyk(db)
        mockkObject(DatabaseHelper.Companion)
        every { DatabaseHelper.getInstance(any()) } returns spy
    }

    @After
    fun tearDown() {
        unmockkObject(DatabaseHelper.Companion)
        unmockkObject(AppLogger)
        db.close()
        resetSingleton()
    }

    private fun resetSingleton() {
        val field = DatabaseHelper::class.java.getDeclaredField("INSTANCE")
        field.isAccessible = true
        field.set(null, null)
    }

    private fun runWorker(): ListenableWorker.Result {
        val worker = TestListenableWorkerBuilder<AutoExportWorker>(ApplicationProvider.getApplicationContext())
            .setTags(listOf(AutoExportScheduler.IMMEDIATE_WORK_TAG))
            .build()
        return runBlocking { worker.doWork() }
    }

    @Test
    fun `a page read that fails after rows were written retries and leaves the watermark alone`() {
        every { spy.getLocationsByDateRange(any(), any(), any(), any()) } answers {
            if (arg<Int>(3) == 0) listOf(mapOf("latitude" to 52.0, "longitude" to 13.0, "timestamp" to 1700000500L))
            else throw SQLiteException("disk I/O error")
        }

        val result = runWorker()

        assertTrue("expected retry, got $result", result is ListenableWorker.Result.Retry)
        val config = AutoExportConfig.from(db)
        assertEquals(1700000000L, config.lastExportTimestamp)
        assertTrue("expected the read arm, got ${config.lastError}", config.lastError!!.startsWith("Read failed:"))
    }

    @Test
    fun `a CursorWindow IllegalStateException retries instead of blaming the directory`() {
        every { spy.getLocationsByDateRange(any(), any(), any(), any()) } throws IllegalStateException("Couldn't read row 0, col 0 from CursorWindow")

        val result = runWorker()

        assertTrue("expected retry, got $result", result is ListenableWorker.Result.Retry)
        val config = AutoExportConfig.from(db)
        assertEquals(1700000000L, config.lastExportTimestamp)
        assertTrue("expected the generic arm, got ${config.lastError}", config.lastError!!.startsWith("Export failed:"))
    }

    @Test
    fun `an unusable export directory fails without retry`() {
        val result = runWorker()

        assertTrue("expected failure, got $result", result is ListenableWorker.Result.Failure)
        val config = AutoExportConfig.from(db)
        assertEquals(1700000000L, config.lastExportTimestamp)
        assertTrue("expected the directory arm, got ${config.lastError}", config.lastError!!.startsWith("Directory access failed:"))
    }
}
