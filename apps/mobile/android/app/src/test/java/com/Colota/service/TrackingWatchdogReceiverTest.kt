/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.Manifest
import android.app.AlarmManager
import android.app.Application
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import com.Colota.bridge.LocationServiceModule
import com.Colota.data.DatabaseHelper
import com.Colota.data.SettingsKeys
import com.Colota.util.AppLogger
import io.mockk.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

/**
 * The watchdog is the only recovery that works while the app stays closed, which is the window
 * every #444 reporter describes. Its rules: never resurrect what the user stopped, never retry
 * forever without permission, and never go silent when it cannot restart the service itself.
 */
@RunWith(RobolectricTestRunner::class)
class TrackingWatchdogReceiverTest {

    private lateinit var app: Application
    private lateinit var db: DatabaseHelper
    private lateinit var alarmManager: AlarmManager
    private lateinit var notificationManager: NotificationManager

    private fun fire() = TrackingWatchdogReceiver().onReceive(app, Intent())

    @Before
    fun setUp() {
        app = ApplicationProvider.getApplicationContext()
        db = DatabaseHelper.getInstance(app)
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "false")

        alarmManager = app.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        notificationManager = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        TrackingWatchdogScheduler.cancel(app)
        shadowOf(app).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION)

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
    fun `restarts a dead service the user still wants and stays armed`() {
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "true")

        fire()

        val started = shadowOf(app).nextStartedService
        assertNotNull("A dead service must be restarted", started)
        assertEquals(LocationForegroundService::class.java.name, started.component?.className)
        assertEquals(1, shadowOf(alarmManager).scheduledAlarms.size)
    }

    @Test
    fun `leaves a live service alone and stays armed`() {
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "true")

        mockkObject(LocationForegroundService.Companion)
        try {
            every { LocationForegroundService.isRunning } returns true
            every { LocationForegroundService.isStarted } returns true

            fire()

            assertNull("A healthy service must not be restarted", shadowOf(app).nextStartedService)
            assertEquals(1, shadowOf(alarmManager).scheduledAlarms.size)
        } finally {
            unmockkObject(LocationForegroundService.Companion)
        }
    }

    /** An instance Android created and never started has no stream and no sync. */
    @Test
    fun `starts a service that was created but never started`() {
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "true")

        mockkObject(LocationForegroundService.Companion)
        try {
            every { LocationForegroundService.isRunning } returns true
            every { LocationForegroundService.isStarted } returns false

            fire()

            val started = shadowOf(app).nextStartedService
            assertNotNull("An instance that never started records nothing", started)
            assertEquals(LocationForegroundService::class.java.name, started.component?.className)
            verify { AppLogger.w(any(), "Service was created but never started - starting it") }
            assertEquals(1, shadowOf(alarmManager).scheduledAlarms.size)
        } finally {
            unmockkObject(LocationForegroundService.Companion)
        }
    }

    @Test
    fun `disarms itself once the user stops tracking`() {
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "false")

        fire()

        assertNull("A stop must never be undone", shadowOf(app).nextStartedService)
        assertTrue("Nothing left to watch", shadowOf(alarmManager).scheduledAlarms.isEmpty())
    }

    /**
     * An inexact alarm does not earn the background foreground-service start exemption, so this
     * is the ordinary outcome for anyone who has not made the app battery-unrestricted.
     */
    @Test
    fun `a denied restart tells the user instead of failing silently`() {
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "true")

        mockkObject(LocationForegroundService.Companion)
        try {
            every { LocationForegroundService.isRunning } returns false
            every { LocationForegroundService.isStarted } returns false
            every {
                LocationForegroundService.startTracking(any(), any(), any())
            } throws IllegalStateException("FGS start not allowed from background")

            fire()

            val posted = shadowOf(notificationManager).allNotifications
            assertEquals("The user needs a way back", 1, posted.size)
            assertEquals(1, shadowOf(alarmManager).scheduledAlarms.size)
        } finally {
            unmockkObject(LocationForegroundService.Companion)
        }
    }

    /**
     * Tracking is allowed to run with notifications denied, so the tap-to-resume fallback can
     * be unavailable exactly when it is needed. The log must then carry the evidence instead.
     */
    @Test
    fun `a denied restart with notifications off records that the user could not be told`() {
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "true")
        shadowOf(notificationManager).setNotificationsEnabled(false)

        mockkObject(LocationForegroundService.Companion)
        try {
            every { LocationForegroundService.isRunning } returns false
            every { LocationForegroundService.isStarted } returns false
            every {
                LocationForegroundService.startTracking(any(), any(), any())
            } throws IllegalStateException("FGS start not allowed from background")

            fire()

            assertEquals("Nothing can be posted", 0, shadowOf(notificationManager).allNotifications.size)
            verify { AppLogger.w(any(), "Cannot prompt to resume either - notifications are denied") }
            assertEquals("Must keep trying", 1, shadowOf(alarmManager).scheduledAlarms.size)
        } finally {
            unmockkObject(LocationForegroundService.Companion)
        }
    }

    @Test
    fun `stops retrying when location permission is gone`() {
        db.saveSetting(SettingsKeys.TRACKING_ENABLED, "true")
        shadowOf(app).denyPermissions(Manifest.permission.ACCESS_FINE_LOCATION)

        fire()

        assertNull("Restarting without permission would fail every tick", shadowOf(app).nextStartedService)
        assertTrue(shadowOf(alarmManager).scheduledAlarms.isEmpty())
    }

    @Test
    fun `cancelling the watchdog leaves the geofence heartbeat armed`() {
        GeofenceHeartbeatScheduler.schedule(app, 900_000L)
        TrackingWatchdogScheduler.schedule(app)

        TrackingWatchdogScheduler.cancel(app)

        assertEquals(1, shadowOf(alarmManager).scheduledAlarms.size)
    }
}
