/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.Colota.util.AppLogger

/**
 * Schedules the stationary-profile heartbeat alarm. Uses setAndAllowWhileIdle (like
 * AutoExportScheduler) so it fires through Doze without the SCHEDULE_EXACT_ALARM permission;
 * the OS floors it to ~9min while idle, which suits a stationary cadence. Delivered to
 * [LocationForegroundService] as ACTION_STATIONARY_HEARTBEAT.
 */
object StationaryHeartbeatScheduler {

    private const val TAG = "StationaryHeartbeat"
    private const val REQUEST_CODE = 9301
    /** Cadence floor; Doze also floors allow-while-idle to ~9min. */
    private const val MIN_INTERVAL_MS = 60_000L

    fun schedule(context: Context, intervalMs: Long) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        val delay = maxOf(intervalMs, MIN_INTERVAL_MS)
        am.setAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            System.currentTimeMillis() + delay,
            pendingIntent(context)
        )
        AppLogger.d(TAG, "Stationary heartbeat armed: ${delay / 1000}s")
    }

    fun cancel(context: Context) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        am.cancel(pendingIntent(context))
        AppLogger.d(TAG, "Stationary heartbeat cancelled")
    }

    private fun pendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, LocationForegroundService::class.java).apply {
            action = LocationForegroundService.ACTION_STATIONARY_HEARTBEAT
            setPackage(context.packageName)
        }
        return PendingIntent.getForegroundService(
            context,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
