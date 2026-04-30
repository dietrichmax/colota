/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.export

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.annotation.WorkerThread
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.Colota.data.DatabaseHelper
import com.Colota.util.AppLogger

/**
 * AlarmManager-based scheduling. Worker reschedules the next slot on completion;
 * BootReceiver re-arms after reboot. Uses setAndAllowWhileIdle to avoid the
 * SCHEDULE_EXACT_ALARM permission, accepting ~minute accuracy in exchange.
 */
object AutoExportScheduler {

    private const val TAG = "AutoExportScheduler"
    private const val ALARM_REQUEST_CODE = 9101
    internal const val IMMEDIATE_WORK_TAG = "colota_auto_export_now"
    // From the pre-AlarmManager build; cancelled here for upgrade hygiene.
    private const val LEGACY_PERIODIC_WORK_NAME = "colota_auto_export"

    @WorkerThread
    fun scheduleNext(context: Context) {
        WorkManager.getInstance(context.applicationContext)
            .cancelUniqueWork(LEGACY_PERIODIC_WORK_NAME)

        val db = DatabaseHelper.getInstance(context)
        val config = AutoExportConfig.from(db)
        if (!config.enabled) {
            AppLogger.d(TAG, "Auto-export disabled, not scheduling")
            return
        }
        val nextTs = config.nextExportTimestamp()
        if (nextTs <= 0L) {
            AppLogger.d(TAG, "No next export timestamp computed")
            return
        }
        val triggerAtMillis = nextTs * 1000
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = pendingIntent(context)
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi)
        AppLogger.i(TAG, "Scheduled auto-export alarm for $nextTs (epoch s)")
    }

    fun runNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<AutoExportWorker>()
            .addTag(IMMEDIATE_WORK_TAG)
            .build()
        WorkManager.getInstance(context.applicationContext).enqueue(request)
        AppLogger.i(TAG, "Enqueued immediate auto-export")
    }

    fun cancel(context: Context) {
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(pendingIntent(context))
        AppLogger.i(TAG, "Cancelled auto-export alarm")
    }

    private fun pendingIntent(context: Context): PendingIntent {
        val intent = Intent().apply {
            component = ComponentName(context, AutoExportAlarmReceiver::class.java)
            setPackage(context.packageName)
        }
        return PendingIntent.getBroadcast(
            context,
            ALARM_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
