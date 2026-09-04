/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.app.Application
import android.content.Intent
import android.os.BatteryManager
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
    fun `skips resume when the service is already running`() {
        db.saveSetting(SettingsKeys.STOPPED_BY_BATTERY, "true")

        mockkObject(LocationForegroundService.Companion)
        try {
            every { LocationForegroundService.isRunning } returns true

            val result = runWorker()

            assertEquals(ListenableWorker.Result.success(), result)
            assertNull("Already tracking - must not double-start", shadowOf(app).nextStartedService)
            verify(exactly = 0) { LocationServiceModule.sendTrackingStartedEvent(any()) }
        } finally {
            unmockkObject(LocationForegroundService.Companion)
        }
    }

    /**
     * A service the system killed leaves the intent flag true. Gating on that flag made this
     * recovery a permanent no-op for exactly the users it exists to rescue.
     */
    @Test
    fun `resumes when the intent flag is stale-true but the service is dead`() {
        db.saveSetting(SettingsKeys.STOPPED_BY_BATTERY, "true")
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "true")

        val result = runWorker()

        assertEquals(ListenableWorker.Result.success(), result)
        assertNotNull("A dead service must still be resumed", shadowOf(app).nextStartedService)
        verify { LocationServiceModule.sendTrackingStartedEvent(any()) }
    }

    /**
     * WorkManager can run a charging-constrained worker before its tracker has observed the
     * unplug, and resuming there restarts a service that stops on battery again and re-arms this.
     */
    @Test
    fun `does not resume while the battery is still critical and unplugged`() {
        db.saveSetting(SettingsKeys.STOPPED_BY_BATTERY, "true")
        setBattery(level = 4, plugged = 0, status = BatteryManager.BATTERY_STATUS_DISCHARGING)

        val result = runWorker()

        // retry, not success: the recovery must survive to fire on a real charge.
        assertEquals(ListenableWorker.Result.retry(), result)
        assertNull("Still critical - must not restart the service", shadowOf(app).nextStartedService)
        verify(exactly = 0) { LocationServiceModule.sendTrackingStartedEvent(any()) }
    }

    /** The guard reads level and plug state together, so charging at 4% is the recovery, not the loop. */
    @Test
    fun `resumes at a critical level once the charger is connected`() {
        db.saveSetting(SettingsKeys.STOPPED_BY_BATTERY, "true")
        setBattery(level = 4, plugged = BatteryManager.BATTERY_PLUGGED_AC, status = BatteryManager.BATTERY_STATUS_CHARGING)

        val result = runWorker()

        assertEquals(ListenableWorker.Result.success(), result)
        assertNotNull("Charging at 4% is the recovery case", shadowOf(app).nextStartedService)
        verify { LocationServiceModule.sendTrackingStartedEvent(any()) }
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

    @Suppress("DEPRECATION")
    private fun setBattery(level: Int, plugged: Int, status: Int) {
        app.sendStickyBroadcast(
            Intent(Intent.ACTION_BATTERY_CHANGED)
                .putExtra(BatteryManager.EXTRA_LEVEL, level)
                .putExtra(BatteryManager.EXTRA_SCALE, 100)
                .putExtra(BatteryManager.EXTRA_STATUS, status)
                .putExtra(BatteryManager.EXTRA_PLUGGED, plugged)
        )
    }
}
