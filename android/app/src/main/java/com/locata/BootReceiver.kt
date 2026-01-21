/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
 
package com.Colota

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import kotlinx.coroutines.*

/**
 * Receiver responsible for restarting the location tracking service after device reboot.
 */
class LocationBootReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "BootReceiver"
        
        // Supported boot actions for better device compatibility
        private val BOOT_ACTIONS = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON"
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
                Log.e(TAG, "Error handling boot", e)
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
    private suspend fun waitForDatabaseReady(dbHelper: LocationDatabaseHelper): Boolean {
        repeat(MAX_DB_RETRIES) { attempt ->
            try {
                // Test database access
                dbHelper.getSetting("tracking_enabled")
                return true
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, "DB not ready, attempt ${attempt + 1}/$MAX_DB_RETRIES")
                }
                if (attempt < MAX_DB_RETRIES - 1) {
                    delay(RETRY_DELAY_MS)
                }
            }
        }
        return false
    }
    
    private suspend fun handleBootCompleted(context: Context, action: String) {
        try {
            val dbHelper = LocationDatabaseHelper.getInstance(context)
            
            // Wait for database to be ready
            if (!waitForDatabaseReady(dbHelper)) {
                Log.e(TAG, "Database not ready after $MAX_DB_RETRIES attempts")
                return
            }
            
            val isEnabled = dbHelper.getSetting("tracking_enabled", "false") == "true"
            
            if (!isEnabled) {
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, "Boot detected but tracking disabled")
                }
                return
            }
            
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Boot detected ($action). Restarting service...")
            }
            
            // Load config using ServiceConfig (eliminates duplication)
            val config = ServiceConfig.fromDatabase(dbHelper)
            
            // Create service intent with config
            val serviceIntent = Intent(context, LocationForegroundService::class.java)
            config.toIntent(serviceIntent)
            
            // Start service based on Android version
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Service start requested successfully")
            }
            
        } catch (e: SecurityException) {
            Log.e(TAG, "Permission denied when starting service", e)
        } catch (e: Exception) {
            Log.e(TAG, "Error restarting service on boot", e)
        }
    }
}