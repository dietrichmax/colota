/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota

import android.content.Intent
import android.os.Bundle

/**
 * Centralized service configuration to eliminate duplication across:
 * - LocationBootReceiver
 * - LocationServiceModule  
 * - LocationForegroundService
 */
data class ServiceConfig(
    val endpoint: String = "",
    val interval: Long = 1000L,
    val minUpdateDistance: Float = 0f,
    val syncIntervalSeconds: Int = 0,
    val maxRetries: Int = 5,
    val accuracyThreshold: Float = 50.0f,
    val filterInaccurateLocations: Boolean = true,
    val retryIntervalSeconds: Int = 300,
    val isOfflineMode: Boolean = false,
    val fieldMap: String? = null
) {
    companion object {
        /**
         * Loads configuration from database settings.
         */
        fun fromDatabase(dbHelper: DatabaseHelper): ServiceConfig {
            val saved = dbHelper.getAllSettings()
            
            return ServiceConfig(
                endpoint = saved["endpoint"] ?: "",
                interval = saved["interval"]?.toLongOrNull() ?: 1000L,
                minUpdateDistance = saved["minUpdateDistance"]?.toFloatOrNull() ?: 0f,
                syncIntervalSeconds = saved["syncInterval"]?.toIntOrNull() ?: 0,
                maxRetries = saved["maxRetries"]?.toIntOrNull() ?: 5,
                accuracyThreshold = saved["accuracyThreshold"]?.toFloatOrNull() ?: 50.0f,
                filterInaccurateLocations = saved["filterInaccurateLocations"]?.toBoolean() ?: true,
                retryIntervalSeconds = saved["retryInterval"]?.toIntOrNull() ?: 300,
                isOfflineMode = saved["isOfflineMode"]?.toBoolean() ?: false,
                fieldMap = saved["fieldMap"]
            )
        }
        
        /**
         * Loads configuration from Intent extras (for service start).
         */
        fun fromIntent(intent: Intent, dbHelper: DatabaseHelper): ServiceConfig {
            val extras = intent.extras ?: return fromDatabase(dbHelper)
            
            // Load from database first, then override with intent extras
            val dbConfig = fromDatabase(dbHelper)
            
            return ServiceConfig(
                endpoint = extras.getString("endpoint") ?: dbConfig.endpoint,
                interval = extras.getLongOrDefault("interval", dbConfig.interval),
                minUpdateDistance = extras.getFloatOrDefault("minUpdateDistance", dbConfig.minUpdateDistance),
                syncIntervalSeconds = extras.getIntOrDefault("syncInterval", dbConfig.syncIntervalSeconds),
                maxRetries = extras.getIntOrDefault("maxRetries", dbConfig.maxRetries),
                accuracyThreshold = extras.getFloatOrDefault("accuracyThreshold", dbConfig.accuracyThreshold),
                filterInaccurateLocations = extras.getBooleanOrDefault("filterInaccurateLocations", dbConfig.filterInaccurateLocations),
                retryIntervalSeconds = extras.getIntOrDefault("retryInterval", dbConfig.retryIntervalSeconds),
                isOfflineMode = extras.getBooleanOrDefault("isOfflineMode", dbConfig.isOfflineMode),
                fieldMap = extras.getStringOrDefault("fieldMap", dbConfig.fieldMap)
            )
        }
    }
    
    /**
     * Converts config to Intent extras for service communication.
     */
    fun toIntent(intent: Intent): Intent {
        return intent.apply {
            putExtra("interval", interval)
            putExtra("minUpdateDistance", minUpdateDistance)
            putExtra("endpoint", endpoint)
            putExtra("syncInterval", syncIntervalSeconds)
            putExtra("accuracyThreshold", accuracyThreshold)
            putExtra("filterInaccurateLocations", filterInaccurateLocations)
            putExtra("maxRetries", maxRetries)
            putExtra("retryInterval", retryIntervalSeconds)
            putExtra("isOfflineMode", isOfflineMode)
            fieldMap?.let { putExtra("fieldMap", it) }
        }
    }
}

// Extension functions for safer Bundle access
private fun Bundle.getStringOrDefault(key: String, default: String?): String? =
    if (containsKey(key)) getString(key) else default

private fun Bundle.getLongOrDefault(key: String, default: Long): Long =
    if (containsKey(key)) getLong(key) else default

private fun Bundle.getFloatOrDefault(key: String, default: Float): Float =
    if (containsKey(key)) getFloat(key) else default

private fun Bundle.getIntOrDefault(key: String, default: Int): Int =
    if (containsKey(key)) getInt(key) else default

private fun Bundle.getBooleanOrDefault(key: String, default: Boolean): Boolean =
    if (containsKey(key)) getBoolean(key) else default