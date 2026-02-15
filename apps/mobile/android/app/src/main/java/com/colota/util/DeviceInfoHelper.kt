/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
package com.Colota.util

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

/**
 * Helper class for device information, battery optimization, and permissions.
 */
class DeviceInfoHelper(private val context: Context) {
    
    private val powerManager by lazy {
        context.getSystemService(Context.POWER_SERVICE) as PowerManager
    }

    private val batteryCache = TimedCache(60000L) { getBatteryStatus() }

    companion object {
        private const val TAG = "DeviceInfoHelper"
    }

    fun getDeviceInfo(): WritableMap {
        return Arguments.createMap().apply {
            putString("model", Build.MODEL)
            putString("brand", Build.BRAND)
            putString("manufacturer", Build.MANUFACTURER)
            putString("device", Build.DEVICE)
            putString("deviceId", Build.DEVICE)
            putString("systemVersion", Build.VERSION.RELEASE)
            putInt("apiLevel", Build.VERSION.SDK_INT)
        }
    }

    fun getSystemVersion(): String = Build.VERSION.RELEASE
    fun getApiLevel(): Int = Build.VERSION.SDK_INT
    fun getModel(): String = Build.MODEL
    fun getBrand(): String = Build.BRAND
    fun getDeviceId(): String = Build.DEVICE

    /**
     * @return Pair of (battery level %, status code: 0=Unknown, 1=Discharging, 2=Charging, 3=Full)
     */
    fun getCachedBatteryStatus(): Pair<Int, Int> = batteryCache.get()

    fun getBatteryStatus(): Pair<Int, Int> {
        val batteryIntent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        
        val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val batteryPct = if (level >= 0 && scale > 0) {
            (level * 100) / scale
        } else {
            100 // Default to full if unable to read
        }

        val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val batteryStatus = when (status) {
            BatteryManager.BATTERY_STATUS_CHARGING -> 2      // Charging
            BatteryManager.BATTERY_STATUS_FULL -> 3          // Full
            BatteryManager.BATTERY_STATUS_DISCHARGING -> 1   // Unplugged/Discharging
            BatteryManager.BATTERY_STATUS_NOT_CHARGING -> 1  // Unplugged/Discharging
            else -> 0                                        // Unknown
        }

        return Pair(batteryPct, batteryStatus)
    }

    fun getBatteryStatusString(): String {
        val (level, status) = getCachedBatteryStatus()
        val statusText = when (status) {
            0 -> "Unknown"
            1 -> "Unplugged/Discharging"
            2 -> "Charging"
            3 -> "Full"
            else -> "Unknown ($status)"
        }
        return "$level% ($statusText)"
    }

    fun isBatteryCritical(threshold: Int = 5): Boolean {
        val (level, status) = getCachedBatteryStatus()
        return level < threshold && status == 1 // Discharging
    }

    fun invalidateBatteryCache() = batteryCache.invalidate()

    fun isIgnoringBatteryOptimizations(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            powerManager.isIgnoringBatteryOptimizations(context.packageName)
        } else {
            true // Battery optimization doesn't exist on older versions
        }
    }

    fun requestIgnoreBatteryOptimizations(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true // Not applicable on older versions
        }

        return try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${context.packageName}")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open battery optimization settings", e)
            // Fallback to general settings
            try {
                val fallbackIntent = Intent(Settings.ACTION_SETTINGS).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(fallbackIntent)
                false // Indicate fallback was used
            } catch (e2: Exception) {
                Log.e(TAG, "Failed to open general settings", e2)
                throw e2 // Let caller handle this
            }
        }
    }
}