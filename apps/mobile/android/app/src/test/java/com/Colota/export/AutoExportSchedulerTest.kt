/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.export

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.WorkManagerTestInitHelper
import com.Colota.data.DatabaseHelper
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
class AutoExportSchedulerTest {

    private lateinit var context: Context
    private lateinit var db: DatabaseHelper
    private lateinit var alarmManager: AlarmManager

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()

        // A WorkManager whose worker executor never runs, so enqueued work stays unfinished and cancel is observable
        val config = Configuration.Builder()
            .setExecutor { }
            .build()
        WorkManagerTestInitHelper.initializeTestWorkManager(context, config)

        db = DatabaseHelper.getInstance(context)
        alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any()) } just Runs

        AutoExportScheduler.cancel(context)
        listOf(
            "autoExportEnabled", "autoExportFormat", "autoExportInterval", "autoExportMode",
            "autoExportTimeOfDay", "autoExportWeeklyDow", "autoExportMonthlyDom",
            "lastAutoExportTimestamp", "autoExportEnabledAt"
        ).forEach { db.saveSetting(it, "") }
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
    }

    @Test
    fun `scheduleNext does not arm alarm when auto-export is disabled`() {
        db.saveSetting("autoExportEnabled", "false")

        AutoExportScheduler.scheduleNext(context)

        assertTrue(
            "No alarm should be scheduled when disabled",
            shadowOf(alarmManager).scheduledAlarms.isEmpty()
        )
    }

    @Test
    fun `scheduleNext arms alarm when enabled with valid time`() {
        db.saveSetting("autoExportEnabled", "true")
        db.saveSetting("autoExportInterval", "daily")
        db.saveSetting("autoExportTimeOfDay", "09:00")

        AutoExportScheduler.scheduleNext(context)

        val alarms = shadowOf(alarmManager).scheduledAlarms
        assertEquals("Exactly one alarm should be queued", 1, alarms.size)
    }

    @Test
    fun `cancel removes a pending alarm`() {
        db.saveSetting("autoExportEnabled", "true")
        db.saveSetting("autoExportInterval", "daily")
        db.saveSetting("autoExportTimeOfDay", "09:00")
        AutoExportScheduler.scheduleNext(context)
        assertEquals(1, shadowOf(alarmManager).scheduledAlarms.size)

        AutoExportScheduler.cancel(context)

        assertTrue(
            "AlarmManager should have no scheduled alarms after cancel",
            shadowOf(alarmManager).scheduledAlarms.isEmpty()
        )
    }

    @Test
    fun `cancel also stops a queued or running export`() {
        AutoExportScheduler.runNow(context)
        val wm = WorkManager.getInstance(context)
        assertFalse(wm.getWorkInfosByTag(AutoExportWorker::class.java.name).get().single().state.isFinished)

        AutoExportScheduler.cancel(context)

        assertEquals(WorkInfo.State.CANCELLED, wm.getWorkInfosByTag(AutoExportWorker::class.java.name).get().single().state)
    }

    @Test
    fun `the alarm receiver re-arms the alarm before enqueuing so a failed enqueue cannot end the schedule`() {
        mockkObject(AutoExportScheduler)
        every { AutoExportScheduler.enqueueScheduled(any()) } throws RuntimeException("WorkManager not initialized")
        every { AutoExportScheduler.scheduleNext(any()) } just Runs
        try {
            AutoExportAlarmReceiver().onReceive(context, Intent())

            verifyOrder {
                AutoExportScheduler.scheduleNext(context)
                AutoExportScheduler.enqueueScheduled(context)
            }
            verify { AppLogger.e("AutoExportAlarm", "Failed to enqueue export worker", any()) }
        } finally {
            unmockkObject(AutoExportScheduler)
        }
    }

    @Test
    fun `scheduler is a singleton object`() {
        assertSame(AutoExportScheduler, AutoExportScheduler)
    }
}
