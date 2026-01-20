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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Receiver responsible for restarting the location tracking service after device reboot.
 * 
 * Optimized for:
 * - Fast execution (doesn't block boot process)
 * - Proper async database access
 * - Multiple boot action support
 * - Better error handling
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
                handleBootCompleted(context, action)
            } catch (e: Exception) {
                Log.e(TAG, "Error handling boot", e)
            } finally {
                // Must call finish() when done
                pendingResult.finish()
            }
        }
    }
    
    private fun handleBootCompleted(context: Context, action: String) {
        try {
            val dbHelper = LocationDatabaseHelper.getInstance(context.applicationContext)
            val isEnabled = dbHelper.getSetting("tracking_enabled", "false") == "true"
            
            if (isEnabled) {
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, "Boot detected ($action). Restarting service...")
                }
                
                val serviceIntent = Intent(context, LocationForegroundService::class.java).apply {
                    // Pass all settings to service
                    val settings = dbHelper.getAllSettings()
                    
                    settings["interval"]?.toLongOrNull()?.let { 
                        putExtra("interval", it) 
                    }
                    settings["minUpdateDistance"]?.toFloatOrNull()?.let { 
                        putExtra("minUpdateDistance", it) 
                    }
                    settings["endpoint"]?.let { 
                        putExtra("endpoint", it) 
                    }
                    settings["syncInterval"]?.toIntOrNull()?.let { 
                        putExtra("syncInterval", it) 
                    }
                    settings["accuracyThreshold"]?.toFloatOrNull()?.let { 
                        putExtra("accuracyThreshold", it) 
                    }
                    settings["filterInaccurateLocations"]?.toBooleanStrictOrNull()?.let { 
                        putExtra("filterInaccurateLocations", it) 
                    }
                    settings["maxRetries"]?.toIntOrNull()?.let { 
                        putExtra("maxRetries", it) 
                    }
                    settings["retryInterval"]?.toIntOrNull()?.let { 
                        putExtra("retryInterval", it) 
                    }
                    settings["isOfflineMode"]?.toBooleanStrictOrNull()?.let { 
                        putExtra("isOfflineMode", it) 
                    }
                    settings["fieldMap"]?.let { 
                        putExtra("fieldMap", it) 
                    }
                }
                
                // Start service based on Android version
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            } else {
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, "Boot detected but tracking disabled")
                }
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "Permission denied when starting service", e)
        } catch (e: Exception) {
            Log.e(TAG, "Error restarting service on boot", e)
        }
    }
}