/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import com.Colota.util.AppLogger
import com.Colota.util.DeviceInfoHelper

/**
 * Fires [onCritical] when the battery drops below the critical threshold while unplugged.
 *
 * Watches ACTION_BATTERY_CHANGED instead of checking on each GPS fix, so the stop still happens
 * while a zone pause has GPS turned off. Deep Doze batches the broadcast, so a crossing while
 * paused may only be caught at the next maintenance window.
 */
class BatteryMonitor(
    private val context: Context,
    private val deviceInfoHelper: DeviceInfoHelper,
    private val onCritical: () -> Unit,
) {
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (deviceInfoHelper.isBatteryCritical()) onCritical()
        }
    }

    private var registered = false

    /** Idempotent. The sticky broadcast is delivered on register, so starting already below the
     *  threshold stops right away. */
    fun start() {
        if (registered) return
        ContextCompat.registerReceiver(
            context,
            receiver,
            IntentFilter(Intent.ACTION_BATTERY_CHANGED),
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
        registered = true
        AppLogger.d(TAG, "Battery monitor registered")
    }

    fun stop() {
        if (!registered) return
        registered = false
        try {
            context.unregisterReceiver(receiver)
        } catch (e: IllegalArgumentException) {
            AppLogger.w(TAG, "Battery monitor already unregistered: ${e.message}")
        }
    }

    companion object {
        private const val TAG = "BatteryMonitor"
    }
}
