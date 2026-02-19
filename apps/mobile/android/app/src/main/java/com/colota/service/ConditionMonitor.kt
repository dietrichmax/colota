/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.car.app.connection.CarConnection
import androidx.lifecycle.Observer
import com.Colota.BuildConfig

/**
 * Monitors device conditions (charging state, Android Auto connection)
 * and notifies ProfileManager when conditions change.
 *
 * Android Auto is detected via the [CarConnection] API, which reliably
 * reports projection and native car connections.
 *
 * All observers are registered programmatically so they only run while
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
    private var carConnection: CarConnection? = null
    private var carConnectionObserver: Observer<Int>? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    fun start() {
        // Unregister first to prevent duplicate observers on repeated start() calls
        stop()

        registerChargingMonitor()
        startCarConnectionMonitor()

        // Read initial charging state
        val charging = readCurrentChargingState()
        profileManager.onChargingStateChanged(charging)

        if (BuildConfig.DEBUG) {
            Log.d(TAG, "Condition monitors started — charging: $charging")
        }
    }

    fun stop() {
        chargingReceiver = unregisterSafely(chargingReceiver)
        stopCarConnectionMonitor()

        if (BuildConfig.DEBUG) {
            Log.d(TAG, "Condition monitors stopped")
        }
    }

    private fun unregisterSafely(receiver: BroadcastReceiver?): Nothing? {
        receiver?.let {
            try { context.unregisterReceiver(it) } catch (_: Exception) {}
        }
        return null
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
        context.registerReceiver(chargingReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
    }

    private fun startCarConnectionMonitor() {
        val connection = CarConnection(context)
        carConnection = connection

        val observer = Observer<Int> { connectionType ->
            val connected = connectionType != CarConnection.CONNECTION_TYPE_NOT_CONNECTED
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "CarConnection type: $connectionType (connected: $connected)")
            }
            profileManager.onCarModeStateChanged(connected)
        }
        carConnectionObserver = observer

        mainHandler.post {
            connection.type.observeForever(observer)
        }
    }

    private fun stopCarConnectionMonitor() {
        val observer = carConnectionObserver ?: return
        val connection = carConnection ?: return

        mainHandler.post {
            connection.type.removeObserver(observer)
        }

        carConnectionObserver = null
        carConnection = null
    }

    private fun readCurrentChargingState(): Boolean {
        val batteryIntent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        return status == BatteryManager.BATTERY_STATUS_CHARGING ||
               status == BatteryManager.BATTERY_STATUS_FULL
    }
}
