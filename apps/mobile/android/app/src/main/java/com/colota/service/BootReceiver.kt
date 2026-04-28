/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
 
package com.Colota.service

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.Colota.data.DatabaseHelper
import com.Colota.data.SettingsKeys
import com.Colota.export.AutoExportScheduler
import com.Colota.util.AppLogger
import com.Colota.util.DeviceInfoHelper
import kotlinx.coroutines.*

/**
 * Receiver responsible for restarting the location tracking service after device reboot.
 */
class LocationBootReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "BootReceiver"
        
        private val BOOT_ACTIONS = setOf(
            Intent.ACTION_BOOT_COMPLETED
        )
        
        private const val MAX_DB_RETRIES = 3
        private const val RETRY_DELAY_MS = 1000L
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        
        // Check if this is a boot-related action
        if (action !in BOOT_ACTIONS) return
        
        // Use goAsync() to prevent ANR during database access
        val pendingResult = goAsync()
        
        // Run database check on background thread
        CoroutineScope(Dispatchers.IO).launch {
            try {
                handleBootCompleted(context.applicationContext, action)
            } catch (e: Exception) {
                AppLogger.e(TAG, "Error handling boot", e)
            } finally {
                // CRITICAL: Always call finish()
                pendingResult.finish()
            }
        }
    }
    
    /**
     * Waits for database to be ready with retry logic.
     * Database might not be immediately available after boot.
     */
    private suspend fun waitForDatabaseReady(dbHelper: DatabaseHelper): Boolean {
        repeat(MAX_DB_RETRIES) { attempt ->
            try {
                // Test database access
                dbHelper.getSetting(SettingsKeys.TRACKING_ENABLED)
                return true
            } catch (e: Exception) {
                AppLogger.d(TAG, "DB not ready, attempt ${attempt + 1}/$MAX_DB_RETRIES")
                if (attempt < MAX_DB_RETRIES - 1) {
                    delay(RETRY_DELAY_MS)
                }
            }
        }
        return false
    }
    
    private suspend fun handleBootCompleted(context: Context, action: String) {
        try {
            val dbHelper = DatabaseHelper.getInstance(context)

            // Wait for database to be ready
            if (!waitForDatabaseReady(dbHelper)) {
                AppLogger.e(TAG, "Database not ready after $MAX_DB_RETRIES attempts")
                return
            }

            // Alarms don't survive reboot. No-op if auto-export is disabled.
            try {
                AutoExportScheduler.scheduleNext(context)
            } catch (e: Exception) {
                AppLogger.w(TAG, "scheduleNext failed on boot: ${e.message}")
            }

            val isEnabled = dbHelper.getSetting(SettingsKeys.TRACKING_ENABLED, "false") == "true"
            
            if (!isEnabled) {
                AppLogger.d(TAG, "Boot detected but tracking disabled")

                // Re-show notification if battery is still critically low
                val deviceInfo = DeviceInfoHelper(context)
                if (deviceInfo.isBatteryCritical()) {
                    AppLogger.d(TAG, "Battery still critical - showing stopped notification")
                    val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    val notificationHelper = NotificationHelper(context, notificationManager)
                    notificationHelper.createChannel()
                    notificationManager.notify(
                        NotificationHelper.STOPPED_NOTIFICATION_ID,
                        notificationHelper.buildStoppedNotification("Battery below 5% - tracking paused")
                    )
                }
                return
            }
            
            AppLogger.d(TAG, "Boot detected ($action). Restarting service...")
            
            // Load config using ServiceConfig (eliminates duplication)
            val config = ServiceConfig.fromDatabase(dbHelper)

            // Create service intent with config
            val serviceIntent = Intent(context, LocationForegroundService::class.java)
            config.toIntent(serviceIntent)
            
            context.startForegroundService(serviceIntent)
            
            AppLogger.d(TAG, "Service start requested successfully")
            
        } catch (e: SecurityException) {
            AppLogger.e(TAG, "Permission denied when starting service", e)
        } catch (e: IllegalStateException) {
            // ForegroundServiceStartNotAllowedException on Android 12+
            AppLogger.e(TAG, "Cannot start foreground service from background", e)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Error restarting service on boot", e)
        }
    }
}