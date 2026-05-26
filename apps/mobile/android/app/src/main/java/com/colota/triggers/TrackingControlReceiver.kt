/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.triggers

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import com.Colota.bridge.LocationServiceModule
import com.Colota.data.DatabaseHelper
import com.Colota.service.LocationForegroundService
import com.Colota.service.ServiceConfig
import com.Colota.util.AppLogger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Exported broadcast receiver that starts and stops tracking from automation apps.
 */
class TrackingControlReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "TrackingControlReceiver"
        const val ACTION_START = "com.Colota.action.START_TRACKING"
        const val ACTION_STOP = "com.Colota.action.STOP_TRACKING"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != ACTION_START && action != ACTION_STOP) return

        val appContext = context.applicationContext
        val pending = goAsync()

        CoroutineScope(Dispatchers.IO).launch {
            try {
                when (action) {
                    ACTION_START -> handleStart(appContext)
                    ACTION_STOP -> handleStop(appContext)
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "Error handling broadcast", e)
            } finally {
                pending.finish()
            }
        }
    }

    private fun handleStart(context: Context) {
        AppLogger.d(TAG, "Broadcast: start tracking")
        val config = ServiceConfig.fromDatabase(DatabaseHelper.getInstance(context))
        val serviceIntent = config.toIntent(
            Intent(context, LocationForegroundService::class.java)
        )
        context.startForegroundService(serviceIntent)
        LocationServiceModule.sendTrackingStartedEvent("Started via automation intent")
        toastOnMain(context, "Colota tracking started")
    }

    // Route stop through the service so stopForegroundServiceWithReason runs.
    // Direct stopService skips the pause-zone flag clearing and stopped notification.
    private fun handleStop(context: Context) {
        AppLogger.d(TAG, "Broadcast: stop tracking")
        val stopIntent = Intent(context, LocationForegroundService::class.java).apply {
            action = LocationForegroundService.ACTION_STOP_REQUEST
            putExtra(LocationForegroundService.EXTRA_STOP_REASON, "Stopped via automation intent")
        }
        context.startService(stopIntent)
        toastOnMain(context, "Colota tracking stopped")
    }

    private fun toastOnMain(context: Context, message: String) {
        Handler(Looper.getMainLooper()).post {
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        }
    }
}
