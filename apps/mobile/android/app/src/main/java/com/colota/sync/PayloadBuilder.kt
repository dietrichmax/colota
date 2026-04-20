/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync

import android.location.Location
import com.Colota.util.AppLogger
import org.json.JSONObject
import kotlin.math.roundToInt

/** Stateless builder for outgoing location payloads. */
object PayloadBuilder {

    private const val TAG = "PayloadBuilder"

    fun buildLocationPayload(
        location: Location,
        timestamp: Long,
        batteryLevel: Int,
        batteryStatus: Int,
        fieldMap: Map<String, String>,
        customFields: Map<String, String>,
        apiFormat: ApiFormat,
    ): JSONObject {
        val effectiveFieldMap = if (apiFormat.usesFixedFieldNames) emptyMap() else fieldMap
        return JSONObject().apply {
            customFields.forEach { (key, value) ->
                put(key, value)
            }

            put(effectiveFieldMap["lat"] ?: "lat", location.latitude)
            put(effectiveFieldMap["lon"] ?: "lon", location.longitude)
            put(effectiveFieldMap["acc"] ?: "acc", location.accuracy.roundToInt())

            if (location.hasAltitude()) {
                put(effectiveFieldMap["alt"] ?: "alt", location.altitude.roundToInt())
            }

            if (location.hasSpeed()) {
                put(effectiveFieldMap["vel"] ?: "vel", Math.round(location.speed * 10.0f) / 10.0)
            }
            put(effectiveFieldMap["batt"] ?: "batt", batteryLevel)
            put(effectiveFieldMap["bs"] ?: "bs", batteryStatus)
            put(effectiveFieldMap["tst"] ?: "tst", timestamp)

            if (location.hasBearing()) {
                put(effectiveFieldMap["bear"] ?: "bear", location.bearing.toDouble())
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
