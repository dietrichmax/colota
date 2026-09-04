/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.Manifest
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.Colota.data.DatabaseHelper
import com.Colota.data.SettingsKeys
import com.Colota.util.AppLogger

/**
 * Periodic check that the service the user asked for is actually alive.
 *
 * A killed service leaves no in-process guard behind, so this runs out of process. The alarm
 * grants the power allowlist but not the foreground-service background-start exemption, so the
 * direct restart only succeeds when the app is exempt from battery optimisation. Otherwise the
 * user gets a notification that recovers tracking when they tap it.
 */
class TrackingWatchdogReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        try {
            val dbHelper = DatabaseHelper.getInstance(context)
            val wanted = dbHelper.getSetting(SettingsKeys.TRACKING_ENABLED, "false") == "true"
            if (!wanted) {
                AppLogger.d(TAG, "Tracking not wanted - watchdog disarmed")
                return
            }

            if (LocationForegroundService.isRunning) {
                AppLogger.d(TAG, "Service is running")
                TrackingWatchdogScheduler.schedule(context)
                return
            }

            val granted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                AppLogger.w(TAG, "Service is down but location permission is missing - watchdog disarmed")
                return
            }

            AppLogger.w(TAG, "Tracking wanted but the service is not running - restarting")
            try {
                LocationForegroundService.startTracking(context, dbHelper, "Restarted by watchdog")
            } catch (e: Exception) {
                AppLogger.e(TAG, "Watchdog restart failed (${e.javaClass.simpleName})", e)
                // Tracking can run with notifications denied, so the tap-to-resume fallback
                // is not always available. Say so rather than assume the user was told.
                if (canPromptToResume(context)) {
                    notifyTapToResume(context)
                } else {
                    AppLogger.w(TAG, "Cannot prompt to resume either - notifications are denied")
                }
            }
            TrackingWatchdogScheduler.schedule(context)
        } catch (e: Exception) {
            // A tick can land mid-restore, when the database is deliberately gated.
            AppLogger.e(TAG, "Watchdog tick failed", e)
        }
    }

    /** App permission is not enough: the stop notification has its own channel, blockable alone. */
    private fun canPromptToResume(context: Context): Boolean {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = manager.getNotificationChannel(NotificationHelper.STOPPED_CHANNEL_ID)
        return channel == null || channel.importance != NotificationManager.IMPORTANCE_NONE
    }

    private fun notifyTapToResume(context: Context) {
        val notificationManager =
            context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        NotificationHelper(context, notificationManager).let {
            it.createChannel()
            notificationManager.notify(
                NotificationHelper.STOPPED_NOTIFICATION_ID,
                it.buildStoppedNotification("Tracking service was killed - tap to resume", unexpected = true)
            )
        }
    }

    companion object {
        private const val TAG = "TrackingWatchdog"
    }
}
