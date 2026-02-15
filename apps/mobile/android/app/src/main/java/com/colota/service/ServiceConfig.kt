/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.content.Intent
import com.Colota.data.DatabaseHelper
import android.os.Bundle
import com.facebook.react.bridge.ReadableMap
import org.json.JSONObject

/**
 * Centralized service configuration shared across all native components.
 */
data class ServiceConfig(
    val endpoint: String = "",
    val interval: Long = 5000L,
    val minUpdateDistance: Float = 0f,
    val syncIntervalSeconds: Int = 0,
    val maxRetries: Int = 5,
    val accuracyThreshold: Float = 50.0f,
    val filterInaccurateLocations: Boolean = false,
    val retryIntervalSeconds: Int = 30,
    val isOfflineMode: Boolean = false,
    val isWifiOnlySync: Boolean = false,
    val fieldMap: String? = null,
    val customFields: String? = null,
    val httpMethod: String = "POST"
) {
    companion object {
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
                isWifiOnlySync = saved["isWifiOnlySync"]?.toBoolean() ?: false,
                fieldMap = saved["fieldMap"],
                customFields = saved["customFields"],
                httpMethod = saved["httpMethod"] ?: "POST"
            )
        }

        fun fromReadableMap(config: ReadableMap, dbHelper: DatabaseHelper): ServiceConfig {
            val dbConfig = fromDatabase(dbHelper)

            val fieldMapJson = config.getMap("fieldMap")?.let { map ->
                val json = JSONObject()
                val iterator = map.keySetIterator()
                while (iterator.hasNextKey()) {
                    val key = iterator.nextKey()
                    map.getString(key)?.let { json.put(key, it) }
                }
                json.toString()
            }

            val customFieldsJson = config.getMap("customFields")?.let { map ->
                val json = JSONObject()
                val iterator = map.keySetIterator()
                while (iterator.hasNextKey()) {
                    val key = iterator.nextKey()
                    map.getString(key)?.let { json.put(key, it) }
                }
                json.toString()
            }

            return ServiceConfig(
                endpoint = config.getStringOrNull("endpoint") ?: dbConfig.endpoint,
                interval = config.getDoubleOrNull("interval")?.toLong() ?: dbConfig.interval,
                minUpdateDistance = config.getDoubleOrNull("minUpdateDistance")?.toFloat() ?: dbConfig.minUpdateDistance,
                syncIntervalSeconds = config.getIntOrNull("syncInterval") ?: dbConfig.syncIntervalSeconds,
                maxRetries = config.getIntOrNull("maxRetries") ?: dbConfig.maxRetries,
                accuracyThreshold = config.getDoubleOrNull("accuracyThreshold")?.toFloat() ?: dbConfig.accuracyThreshold,
                filterInaccurateLocations = config.getBooleanOrNull("filterInaccurateLocations") ?: dbConfig.filterInaccurateLocations,
                retryIntervalSeconds = config.getIntOrNull("retryInterval") ?: dbConfig.retryIntervalSeconds,
                isOfflineMode = config.getBooleanOrNull("isOfflineMode") ?: dbConfig.isOfflineMode,
                isWifiOnlySync = config.getBooleanOrNull("isWifiOnlySync") ?: dbConfig.isWifiOnlySync,
                fieldMap = fieldMapJson ?: dbConfig.fieldMap,
                customFields = customFieldsJson ?: dbConfig.customFields,
                httpMethod = config.getStringOrNull("httpMethod") ?: dbConfig.httpMethod
            )
        }

        fun fromIntent(intent: Intent, dbHelper: DatabaseHelper): ServiceConfig {
            val extras = intent.extras ?: return fromDatabase(dbHelper)
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
                isWifiOnlySync = extras.getBooleanOrDefault("isWifiOnlySync", dbConfig.isWifiOnlySync),
                fieldMap = extras.getStringOrDefault("fieldMap", dbConfig.fieldMap),
                customFields = extras.getStringOrDefault("customFields", dbConfig.customFields),
                httpMethod = extras.getStringOrDefault("httpMethod", dbConfig.httpMethod) ?: "POST"
            )
        }
    }
    
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
            putExtra("isWifiOnlySync", isWifiOnlySync)
            fieldMap?.let { putExtra("fieldMap", it) }
            customFields?.let { putExtra("customFields", it) }
            putExtra("httpMethod", httpMethod)
        }
    }
}

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

internal fun ReadableMap.getDoubleOrNull(key: String): Double? =
    if (hasKey(key)) getDouble(key) else null

internal fun ReadableMap.getIntOrNull(key: String): Int? =
    if (hasKey(key)) getInt(key) else null

internal fun ReadableMap.getStringOrNull(key: String): String? =
    if (hasKey(key)) getString(key) else null

internal fun ReadableMap.getBooleanOrNull(key: String): Boolean? =
    if (hasKey(key)) getBoolean(key) else null