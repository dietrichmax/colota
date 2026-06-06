/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.testing.TestListenableWorkerBuilder
import com.Colota.bridge.LocationServiceModule
import com.Colota.data.DatabaseHelper
import com.Colota.data.SettingsKeys
import com.Colota.util.AppLogger
import io.mockk.*
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class BatteryRecoveryWorkerTest {

    private lateinit var app: Application
    private lateinit var db: DatabaseHelper

    private fun runWorker(): ListenableWorker.Result =
        runBlocking { TestListenableWorkerBuilder<BatteryRecoveryWorker>(app).build().doWork() }

    @Before
    fun setUp() {
        app = ApplicationProvider.getApplicationContext()
        db = DatabaseHelper.getInstance(app)
        db.saveSetting(SettingsKeys.STOPPED_BY_BATTERY, "false")
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "false")

        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs

        mockkObject(LocationServiceModule)
        every { LocationServiceModule.sendTrackingStartedEvent(any()) } returns true
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
        unmockkObject(LocationServiceModule)
    }

    @Test
    fun `resumes the location service when stopped by battery and not tracking`() {
        db.saveSetting(SettingsKeys.STOPPED_BY_BATTERY, "true")
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "false")

        val result = runWorker()

        assertEquals(ListenableWorker.Result.success(), result)
        val started = shadowOf(app).nextStartedService
        assertNotNull("Worker should start the location service", started)
        assertEquals(
            LocationForegroundService::class.java.name,
            started.component?.className
        )
        // The foreground UI only re-attaches its location listener on this event,
        // so a native resume must announce it (see useLocationTracking onTrackingStarted).
        verify { LocationServiceModule.sendTrackingStartedEvent(any()) }
    }

    @Test
    fun `does nothing when the stop was not battery-triggered`() {
        db.saveSetting(SettingsKeys.STOPPED_BY_BATTERY, "false")

        val result = runWorker()

        assertEquals(ListenableWorker.Result.success(), result)
        assertNull("No service should start for a non-battery stop", shadowOf(app).nextStartedService)
        verify(exactly = 0) { LocationServiceModule.sendTrackingStartedEvent(any()) }
    }

    @Test
    fun `skips resume when tracking is already active`() {
        db.saveSetting(SettingsKeys.STOPPED_BY_BATTERY, "true")
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "true")

        val result = runWorker()

        assertEquals(ListenableWorker.Result.success(), result)
        assertNull("Already tracking - must not double-start", shadowOf(app).nextStartedService)
        verify(exactly = 0) { LocationServiceModule.sendTrackingStartedEvent(any()) }
    }

    @Test
    fun `structural FGS-start failure fails instead of retrying forever`() {
        db.saveSetting(SettingsKeys.STOPPED_BY_BATTERY, "true")
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "false")

        mockkObject(LocationForegroundService.Companion)
        try {
            // ForegroundServiceStartNotAllowedException is an IllegalStateException.
            every {
                LocationForegroundService.startTracking(any(), any(), any())
            } throws IllegalStateException("FGS start not allowed from background")

            assertEquals(ListenableWorker.Result.failure(), runWorker())
        } finally {
            unmockkObject(LocationForegroundService.Companion)
        }
    }
}
