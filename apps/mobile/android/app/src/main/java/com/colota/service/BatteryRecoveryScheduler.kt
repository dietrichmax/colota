/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.Colota.util.AppLogger

/**
 * Arms / disarms the charger-gated recovery worker. Enqueued when tracking is
 * stopped because the battery dropped below 5%; the worker fires once the device
 * starts charging and resumes the location service. WorkManager survives process
 * death (unlike a runtime receiver) and coalesces cable-wobble for free.
 */
object BatteryRecoveryScheduler {

    private const val TAG = "BatteryRecoveryScheduler"
    internal const val UNIQUE_WORK = "battery-recovery"

    fun schedule(context: Context) {
        val request = OneTimeWorkRequestBuilder<BatteryRecoveryWorker>()
            .setConstraints(Constraints.Builder().setRequiresCharging(true).build())
            .build()
        WorkManager.getInstance(context.applicationContext)
            .enqueueUniqueWork(UNIQUE_WORK, ExistingWorkPolicy.REPLACE, request)
        AppLogger.i(TAG, "Armed battery-recovery worker (charging constraint)")
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context.applicationContext).cancelUniqueWork(UNIQUE_WORK)
    }
}
