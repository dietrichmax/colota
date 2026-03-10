/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.export

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.Colota.util.AppLogger
import java.util.concurrent.TimeUnit

/**
 * Manages scheduling/cancelling of periodic auto-export via WorkManager.
 *
 * Always schedules a daily (24h) worker. The worker itself checks
 * AutoExportConfig.isExportDue() to determine whether an export should
 * actually run (daily/weekly/monthly). This avoids unreliable long-interval
 * periodic work (e.g. 720h for monthly) and ensures calendar-accurate
 * monthly scheduling.
 */
object AutoExportScheduler {

    private const val TAG = "AutoExportScheduler"
    private const val WORK_NAME = "colota_auto_export"
    private const val CHECK_INTERVAL_HOURS = 24L

    /**
     * Schedules the daily auto-export check worker.
     */
    fun schedule(context: Context) {
        val constraints = Constraints.Builder()
            .setRequiresBatteryNotLow(true)
            .build()

        val request = PeriodicWorkRequestBuilder<AutoExportWorker>(
            CHECK_INTERVAL_HOURS, TimeUnit.HOURS
        )
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        )

        AppLogger.i(TAG, "Scheduled auto-export check (every ${CHECK_INTERVAL_HOURS}h)")
    }

    /**
     * Enqueues a one-time auto-export that runs immediately, bypassing isExportDue().
     */
    fun runNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<AutoExportWorker>()
            .addTag("colota_auto_export_now")
            .build()

        WorkManager.getInstance(context).enqueue(request)
        AppLogger.i(TAG, "Enqueued immediate auto-export")
    }

    /**
     * Cancels any scheduled auto-export work.
     */
    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
        AppLogger.i(TAG, "Cancelled auto-export")
    }
}
