/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.app.UiModeManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.os.BatteryManager
import android.util.Log
import com.Colota.BuildConfig

/**
 * Monitors device conditions (charging state, Android Auto / car mode)
 * and notifies ProfileManager when conditions change.
 *
 * All receivers are registered programmatically so they only run while
 * the foreground service is active.
 */
class ConditionMonitor(
    private val context: Context,
    private val profileManager: ProfileManager
) {
    companion object {
        private const val TAG = "ConditionMonitor"
    }

    private var chargingReceiver: BroadcastReceiver? = null
    private var carModeReceiver: BroadcastReceiver? = null

    fun start() {
        registerChargingMonitor()
        registerCarModeMonitor()

        // Read initial states
        profileManager.onChargingStateChanged(readCurrentChargingState())
        profileManager.onCarModeStateChanged(readCurrentCarModeState())

        if (BuildConfig.DEBUG) {
            Log.d(TAG, "Condition monitors started — charging: ${readCurrentChargingState()}, carMode: ${readCurrentCarModeState()}")
        }
    }

    fun stop() {
        chargingReceiver?.let {
            try { context.unregisterReceiver(it) } catch (_: Exception) {}
        }
        chargingReceiver = null

        carModeReceiver?.let {
            try { context.unregisterReceiver(it) } catch (_: Exception) {}
        }
        carModeReceiver = null

        if (BuildConfig.DEBUG) {
            Log.d(TAG, "Condition monitors stopped")
        }
    }

    private fun registerChargingMonitor() {
        chargingReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    Intent.ACTION_POWER_CONNECTED -> {
                        if (BuildConfig.DEBUG) Log.d(TAG, "Power connected")
                        profileManager.onChargingStateChanged(true)
                    }
                    Intent.ACTION_POWER_DISCONNECTED -> {
                        if (BuildConfig.DEBUG) Log.d(TAG, "Power disconnected")
                        profileManager.onChargingStateChanged(false)
                    }
                }
            }
        }

        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_POWER_CONNECTED)
            addAction(Intent.ACTION_POWER_DISCONNECTED)
        }
        context.registerReceiver(chargingReceiver, filter)
    }

    private fun registerCarModeMonitor() {
        carModeReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                if (intent.action == Intent.ACTION_CONFIGURATION_CHANGED) {
                    val isCarMode = readCurrentCarModeState()
                    if (BuildConfig.DEBUG) Log.d(TAG, "Configuration changed — carMode: $isCarMode")
                    profileManager.onCarModeStateChanged(isCarMode)
                }
            }
        }

        context.registerReceiver(carModeReceiver, IntentFilter(Intent.ACTION_CONFIGURATION_CHANGED))
    }

    private fun readCurrentChargingState(): Boolean {
        val batteryIntent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        return status == BatteryManager.BATTERY_STATUS_CHARGING ||
               status == BatteryManager.BATTERY_STATUS_FULL
    }

    private fun readCurrentCarModeState(): Boolean {
        val uiModeManager = context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
        return uiModeManager?.currentModeType == Configuration.UI_MODE_TYPE_CAR
    }
}
