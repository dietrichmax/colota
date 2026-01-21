/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota

import android.content.Context
import android.content.Intent
import android.net.Uri
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

    companion object {
        private const val TAG = "DeviceInfoHelper"
    }

    // ============================================================================
    // DEVICE INFORMATION
    // ============================================================================

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

    // ============================================================================
    // BATTERY OPTIMIZATION
    // ============================================================================

    /**
     * Checks if the app is exempt from battery optimization.
     * @return true if exempt, false otherwise (or true on Android < M)
     */
    fun isIgnoringBatteryOptimizations(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            powerManager.isIgnoringBatteryOptimizations(context.packageName)
        } else {
            true // Battery optimization doesn't exist on older versions
        }
    }

    /**
     * Requests battery optimization exemption.
     * Opens system settings dialog.
     * @return true if dialog opened successfully, false if fallback used
     */
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