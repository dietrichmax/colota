/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.Colota.data.DatabaseHelper
import com.Colota.data.SettingsKeys
import com.Colota.util.AppLogger

/**
 * Resumes the location foreground service after a battery-critical (<5%) stop,
 * once the device starts charging. Armed by [BatteryRecoveryScheduler] with a
 * charging constraint. Promoting to a foreground service (mirroring
 * AutoExportWorker) grants the "an FGS is already running" exemption so the
 * service start is allowed from the background on Android 12+.
 */
class BatteryRecoveryWorker(
    private val appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    companion object {
        private const val TAG = "BatteryRecoveryWorker"
        private const val CHANNEL_ID = "battery_recovery"
        private const val FOREGROUND_NOTIFICATION_ID = 9003
    }

    override suspend fun getForegroundInfo(): ForegroundInfo {
        ensureNotificationChannel()
        val notification = NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Resuming tracking")
            .setContentText("Charger connected - restarting location tracking")
            .setOngoing(true)
            .build()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(FOREGROUND_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(FOREGROUND_NOTIFICATION_ID, notification)
        }
    }

    override suspend fun doWork(): Result {
        val db = try {
            DatabaseHelper.getInstance(appContext)
        } catch (e: Exception) {
            // Transient DB lock (e.g. just after boot) - let WorkManager retry.
            AppLogger.w(TAG, "DB unavailable, will retry: ${e.message}")
            return Result.retry()
        }

        val stoppedByBattery = db.getSetting(SettingsKeys.STOPPED_BY_BATTERY, "false") == "true"
        if (!stoppedByBattery) {
            AppLogger.d(TAG, "Not stopped by battery - nothing to resume")
            return Result.success()
        }

        val alreadyTracking = db.getSetting(SettingsKeys.TRACKING_ENABLED, "false") == "true"
        if (alreadyTracking) {
            // Manual start / cable-wobble race already brought tracking back.
            AppLogger.d(TAG, "Already tracking - skipping resume")
            return Result.success()
        }

        AppLogger.i(TAG, "Charger connected after battery stop - resuming tracking")

        // Some OEMs throw under aggressive background restrictions; the start
        // often still succeeds. onStartCommand clears the flag + cancels this work.
        try {
            setForeground(getForegroundInfo())
        } catch (e: Exception) {
            AppLogger.w(TAG, "Could not promote to foreground service: ${e.message}")
        }

        return try {
            LocationForegroundService.startTracking(appContext, db, "Charger reconnected")
            Result.success()
        } catch (e: SecurityException) {
            // Missing FGS permission / background-start restriction - retrying won't help.
            AppLogger.e(TAG, "Not allowed to resume location service", e)
            Result.failure()
        } catch (e: IllegalStateException) {
            // ForegroundServiceStartNotAllowedException (API 31+) is structural, not transient.
            AppLogger.e(TAG, "Cannot start foreground service from background", e)
            Result.failure()
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to resume location service", e)
            Result.retry()
        }
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = appContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Battery Recovery",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Resuming tracking after a low-battery stop"
            }
            nm.createNotificationChannel(channel)
        }
    }
}
