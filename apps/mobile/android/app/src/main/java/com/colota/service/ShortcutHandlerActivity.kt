/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import com.Colota.data.DatabaseHelper
import com.Colota.data.SettingsKeys
import com.Colota.util.AppLogger

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
        val dbHelper = DatabaseHelper.getInstance(this)

        when (intent?.action) {
            ACTION_START -> {
                AppLogger.d(TAG, "Shortcut: start tracking")
                val config = ServiceConfig.fromDatabase(dbHelper)
                val serviceIntent = config.toIntent(
                    Intent(this, LocationForegroundService::class.java)
                )
                startForegroundService(serviceIntent)
            }
            ACTION_STOP -> {
                AppLogger.d(TAG, "Shortcut: stop tracking")
                dbHelper.saveSetting(SettingsKeys.TRACKING_ENABLED, "false")
                dbHelper.saveSetting(SettingsKeys.PAUSE_ZONE_NAME, "")
                stopService(Intent(this, LocationForegroundService::class.java))
            }
        }

        finish()
    }
}
