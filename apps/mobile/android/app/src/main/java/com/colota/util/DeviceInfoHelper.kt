/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
package com.Colota.util

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.LocationManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.Colota.util.AppLogger
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

/**
 * Helper class for device information, battery optimization, and permissions.
 */
class DeviceInfoHelper(private val context: Context) {
    
    private val powerManager by lazy {
        context.getSystemService(Context.POWER_SERVICE) as PowerManager
    }

    private val locationManager by lazy {
        context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
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
            putString("deviceId", Build.DEVICE)
            putString("systemVersion", Build.VERSION.RELEASE)
            putInt("apiLevel", Build.VERSION.SDK_INT)
        }
    }

    /**
     * @return Pair of (battery level %, status code: 0=Unknown, 1=Discharging, 2=Charging, 3=Full)
     */
    fun getCachedBatteryStatus(): Pair<Int, Int> = batteryCache.get()

    fun getBatteryStatus(): Pair<Int, Int> {
        val snap = readBatterySticky()
        return Pair(snap.level, snap.status)
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

    /** True when device is connected to any power source (AC, USB, wireless). */
    fun isPluggedIn(): Boolean = readBatterySticky().isPlugged

    private data class BatterySticky(val level: Int, val status: Int, val isPlugged: Boolean)

    private fun readBatterySticky(): BatterySticky {
        val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val rawLevel = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val pct = if (rawLevel >= 0 && scale > 0) (rawLevel * 100) / scale else 100
        val rawStatus = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val status = when (rawStatus) {
            BatteryManager.BATTERY_STATUS_CHARGING -> 2      // Charging
            BatteryManager.BATTERY_STATUS_FULL -> 3          // Full
            BatteryManager.BATTERY_STATUS_DISCHARGING -> 1   // Unplugged/Discharging
            BatteryManager.BATTERY_STATUS_NOT_CHARGING -> 1  // Unplugged/Discharging
            else -> 0                                        // Unknown
        }
        val plugged = (intent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0
        return BatterySticky(pct, status, plugged)
    }

    fun invalidateBatteryCache() = batteryCache.invalidate()

    fun isIgnoringBatteryOptimizations(): Boolean {
        return powerManager.isIgnoringBatteryOptimizations(context.packageName)
    }

    /** Whether the system location toggle is on. App permission is separate. */
    fun isLocationEnabled(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            locationManager.isLocationEnabled
        } else {
            @Suppress("DEPRECATION")
            locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        }
    }

    fun openLocationSettings(): Boolean {
        val candidates = listOf(
            Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS),
            Intent(Settings.ACTION_SECURITY_SETTINGS),
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${context.packageName}")
            }
        )
        val flags = Intent.FLAG_ACTIVITY_NEW_TASK or
            Intent.FLAG_ACTIVITY_NO_HISTORY or
            Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
        for (intent in candidates) {
            if (intent.resolveActivity(context.packageManager) == null) continue
            return try {
                intent.flags = flags
                context.startActivity(intent)
                true
            } catch (e: Exception) {
                AppLogger.w(TAG, "Failed to open ${intent.action}, trying next: ${e.message}")
                continue
            }
        }
        AppLogger.e(TAG, "No supported location settings intent found")
        return false
    }

    fun requestIgnoreBatteryOptimizations(): Boolean {
        return try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${context.packageName}")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to open battery optimization settings", e)
            // Fallback to general settings
            try {
                val fallbackIntent = Intent(Settings.ACTION_SETTINGS).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(fallbackIntent)
                false // Indicate fallback was used
            } catch (e2: Exception) {
                AppLogger.e(TAG, "Failed to open general settings", e2)
                throw e2 // Let caller handle this
            }
        }
    }
}