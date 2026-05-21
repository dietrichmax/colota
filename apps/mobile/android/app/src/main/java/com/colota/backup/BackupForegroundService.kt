/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.backup

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.Colota.util.AppLogger

// Notification-only shell; work stays in BackupServiceModule's coroutine to keep the password CharArray on heap.
class BackupForegroundService : Service() {

    companion object {
        private const val TAG = "BackupForegroundService"
        private const val CHANNEL_ID = "backup_restore"
        private const val NOTIFICATION_ID = 9201
        private const val EXTRA_MESSAGE = "message"

        // Caller must dispatch on Main; Android 12+ throws on background FGS starts.
        // Throws so the caller can abort the operation; running unprotected risks
        // a process kill mid-backup or mid-restore.
        fun start(context: Context, message: String) {
            val intent = Intent(context, BackupForegroundService::class.java).apply {
                putExtra(EXTRA_MESSAGE, message)
            }
            try {
                ContextCompat.startForegroundService(context, intent)
            } catch (e: Exception) {
                AppLogger.e(TAG, "FGS start denied: ${e.message}")
                throw IllegalStateException(
                    "Cannot start backup service. Bring the app to the foreground and try again.",
                    e,
                )
            }
        }

        fun stop(context: Context) {
            try {
                context.stopService(Intent(context, BackupForegroundService::class.java))
            } catch (e: Exception) {
                AppLogger.w(TAG, "stopService failed: ${e.message}")
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // System-restart redelivery: no work to do, stop so the notification doesn't linger.
        if (intent == null) {
            stopSelf(startId)
            return START_NOT_STICKY
        }

        ensureChannel()
        val message = intent.getStringExtra(EXTRA_MESSAGE) ?: "Working..."
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_save)
            .setContentTitle("Colota Backup")
            .setContentText(message)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        try {
            // API 34+ enforces shortService at runtime (3-min cap, no extra permission).
            // Pre-34, the manifest attribute is unknown and the system tolerates a
            // typeless start — backup is a brief user-initiated action either way.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE,
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            AppLogger.w(TAG, "startForeground denied; service runs as background: ${e.message}")
        }
        return START_NOT_STICKY
    }

    // shortService on API 34+ enforces a hard 3-minute cap; if hit, the system invokes
    // this callback before stopping us. The API 35+ (startId, fgsType) overload's default
    // impl delegates here, so one override covers both API levels.
    override fun onTimeout(startId: Int) {
        AppLogger.w(TAG, "shortService timeout reached; backup/restore stopping")
        stopSelf(startId)
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Backup & Restore",
            NotificationManager.IMPORTANCE_LOW,
        ).apply { description = "Shown while a backup or restore is in progress" }
        nm.createNotificationChannel(channel)
    }
}
