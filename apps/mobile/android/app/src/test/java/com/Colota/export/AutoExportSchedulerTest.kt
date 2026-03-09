package com.Colota.export

import com.Colota.util.AppLogger
import io.mockk.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Tests for AutoExportScheduler constants and configuration.
 * WorkManager integration is verified at the integration/instrumented test level;
 * these tests validate the scheduler's public contract and constants.
 */
class AutoExportSchedulerTest {

    @Before
    fun setUp() {
        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
    }

    @Test
    fun `work name constant is colota_auto_export`() {
        val field = AutoExportScheduler::class.java.getDeclaredField("WORK_NAME")
        field.isAccessible = true
        assertEquals("colota_auto_export", field.get(null))
    }

    @Test
    fun `check interval is 24 hours`() {
        val field = AutoExportScheduler::class.java.getDeclaredField("CHECK_INTERVAL_HOURS")
        field.isAccessible = true
        assertEquals(24L, field.getLong(null))
    }

    @Test
    fun `scheduler is a singleton object`() {
        // Verify AutoExportScheduler is an object (singleton)
        val instance1 = AutoExportScheduler
        val instance2 = AutoExportScheduler
        assertSame(instance1, instance2)
    }
}
