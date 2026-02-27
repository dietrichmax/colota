/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync

import android.location.Location
import com.Colota.util.AppLogger
import org.json.JSONObject
import kotlin.math.roundToInt

/**
 * Builds and parses location payloads with dynamic field mapping.
 */
class PayloadBuilder {

    companion object {
        private const val TAG = "PayloadBuilder"
    }

    /**
     * Builds a JSON payload from location data, applying field name mapping and custom fields.
     */
    fun buildPayload(
        location: Location,
        batteryLevel: Int,
        batteryStatus: Int,
        fieldMap: Map<String, String>,
        timestamp: Long,
        customFields: Map<String, String>? = null
    ): JSONObject {
        return JSONObject().apply {
            customFields?.forEach { (key, value) ->
                put(key, value)
            }

            put(fieldMap["lat"] ?: "lat", location.latitude)
            put(fieldMap["lon"] ?: "lon", location.longitude)
            put(fieldMap["acc"] ?: "acc", location.accuracy.roundToInt())

            if (location.hasAltitude()) {
                put(fieldMap["alt"] ?: "alt", location.altitude.roundToInt())
            }

            if (location.hasSpeed()) {
                put(fieldMap["vel"] ?: "vel", Math.round(location.speed * 10.0f) / 10.0)
            }
            put(fieldMap["batt"] ?: "batt", batteryLevel)
            put(fieldMap["bs"] ?: "bs", batteryStatus)
            put(fieldMap["tst"] ?: "tst", timestamp)

            if (location.hasBearing()) {
                put(fieldMap["bear"] ?: "bear", location.bearing.toDouble())
            }
        }
    }

    fun parseFieldMap(jsonString: String?): Map<String, String>? {
        if (jsonString.isNullOrBlank()) return null

        return try {
            val json = JSONObject(jsonString)
            json.keys().asSequence().associateWith { json.getString(it) }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to parse field map", e)
            null
        }
    }

    /**
     * Parses custom fields from either format:
     * - Array:  [{"key":"_type","value":"location"},...]  (from DB / SettingsService)
     * - Object: {"_type":"location",...}                   (from Intent / ReadableMap)
     */
    fun parseCustomFields(jsonString: String?): Map<String, String>? {
        if (jsonString.isNullOrBlank() || jsonString == "[]" || jsonString == "{}") return null
        val trimmed = jsonString.trim()
        return try {
            val map = mutableMapOf<String, String>()
            if (trimmed.startsWith("[")) {
                val arr = org.json.JSONArray(trimmed)
                for (i in 0 until arr.length()) {
                    val obj = arr.getJSONObject(i)
                    map[obj.getString("key")] = obj.getString("value")
                }
            } else {
                val obj = JSONObject(trimmed)
                obj.keys().forEach { key -> map[key] = obj.getString(key) }
            }
            if (map.isEmpty()) null else map
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to parse custom fields", e)
            null
        }
    }

}