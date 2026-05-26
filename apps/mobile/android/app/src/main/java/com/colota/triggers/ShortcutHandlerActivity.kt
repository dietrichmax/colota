/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.triggers

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import com.Colota.bridge.LocationServiceModule
import com.Colota.data.DatabaseHelper
import com.Colota.service.LocationForegroundService
import com.Colota.service.ServiceConfig
import com.Colota.util.AppLogger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Transparent activity that handles app shortcut intents for starting and stopping
 * the tracking service. Finishes immediately after dispatching the action - no UI is shown.
 */
class ShortcutHandlerActivity : Activity() {

    companion object {
        private const val TAG = "ShortcutHandlerActivity"
        const val ACTION_START = "com.Colota.ACTION_SHORTCUT_START"
        const val ACTION_STOP = "com.Colota.ACTION_SHORTCUT_STOP"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val appContext = applicationContext
        val action = intent?.action

        // Detached scope so the IO work completes after finish().
        CoroutineScope(Dispatchers.IO).launch {
            try {
                when (action) {
                    ACTION_START -> handleStart(appContext)
                    ACTION_STOP -> handleStop(appContext)
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "Error handling shortcut", e)
            }
        }

        finish()
    }

    private fun handleStart(context: Context) {
        AppLogger.d(TAG, "Shortcut: start tracking")
        val config = ServiceConfig.fromDatabase(DatabaseHelper.getInstance(context))
        val serviceIntent = config.toIntent(
            Intent(context, LocationForegroundService::class.java)
        )
        context.startForegroundService(serviceIntent)
        LocationServiceModule.sendTrackingStartedEvent("Started via shortcut")
    }

    private fun handleStop(context: android.content.Context) {
        AppLogger.d(TAG, "Shortcut: stop tracking")
        val stopIntent = Intent(context, LocationForegroundService::class.java).apply {
            action = LocationForegroundService.ACTION_STOP_REQUEST
            putExtra(LocationForegroundService.EXTRA_STOP_REASON, "Stopped via shortcut")
        }
        context.startService(stopIntent)
    }
}
