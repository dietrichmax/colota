/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.app.AlarmManager
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.Colota.util.AppLogger
import io.mockk.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class StationaryHeartbeatSchedulerTest {

    private lateinit var context: Context
    private lateinit var alarmManager: AlarmManager

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any()) } just Runs

        StationaryHeartbeatScheduler.cancel(context)
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
    }

    @Test
    fun `schedule arms an allow-while-idle alarm`() {
        StationaryHeartbeatScheduler.schedule(context, 600_000L)

        assertEquals("Exactly one heartbeat alarm should be queued", 1, shadowOf(alarmManager).scheduledAlarms.size)
    }

    @Test
    fun `cancel removes the pending heartbeat alarm`() {
        StationaryHeartbeatScheduler.schedule(context, 600_000L)
        assertEquals(1, shadowOf(alarmManager).scheduledAlarms.size)

        StationaryHeartbeatScheduler.cancel(context)

        assertTrue(
            "No heartbeat alarm should remain after cancel",
            shadowOf(alarmManager).scheduledAlarms.isEmpty()
        )
    }
}
