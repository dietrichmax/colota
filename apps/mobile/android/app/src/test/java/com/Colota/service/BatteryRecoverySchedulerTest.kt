/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.SynchronousExecutor
import androidx.work.testing.WorkManagerTestInitHelper
import com.Colota.util.AppLogger
import io.mockk.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class BatteryRecoverySchedulerTest {

    private lateinit var context: Context

    private fun workInfos(): List<WorkInfo> =
        WorkManager.getInstance(context)
            .getWorkInfosForUniqueWork(BatteryRecoveryScheduler.UNIQUE_WORK)
            .get()

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        val config = Configuration.Builder()
            .setExecutor(SynchronousExecutor())
            .build()
        WorkManagerTestInitHelper.initializeTestWorkManager(context, config)

        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any()) } just Runs

        BatteryRecoveryScheduler.cancel(context)
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
    }

    @Test
    fun `schedule enqueues unique work that requires charging`() {
        BatteryRecoveryScheduler.schedule(context)

        val infos = workInfos()
        assertEquals("Exactly one recovery work should be enqueued", 1, infos.size)
        assertEquals(WorkInfo.State.ENQUEUED, infos[0].state)
        assertTrue(
            "Recovery work must wait for charging",
            infos[0].constraints.requiresCharging()
        )
    }

    @Test
    fun `cancel removes the pending recovery work`() {
        BatteryRecoveryScheduler.schedule(context)
        assertEquals(1, workInfos().count { it.state == WorkInfo.State.ENQUEUED })

        BatteryRecoveryScheduler.cancel(context)

        assertTrue(
            "No recovery work should remain enqueued after cancel",
            workInfos().none { it.state == WorkInfo.State.ENQUEUED }
        )
    }

    @Test
    fun `scheduling twice replaces, leaving a single pending work`() {
        BatteryRecoveryScheduler.schedule(context)
        BatteryRecoveryScheduler.schedule(context)

        assertEquals(
            "REPLACE policy must not leave duplicate enqueued work",
            1,
            workInfos().count { it.state == WorkInfo.State.ENQUEUED }
        )
    }
}
