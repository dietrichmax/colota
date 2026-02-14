/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota

import android.location.Location
import android.util.Log
import com.facebook.react.bridge.ReadableMap
import org.json.JSONObject
import kotlin.math.*

/**
 * Utility class for building and parsing location payloads.
 */
class LocationUtils {

    companion object {
        private const val TAG = "LocationUtils"
    }

    // ========================================
    // DATA CONVERSION
    // ========================================

    /**
     * Maps native location data into JSONObject with dynamic field mapping.
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
            // Add custom static fields first
            customFields?.forEach { (key, value) ->
                put(key, value)
            }

            put(fieldMap["lat"] ?: "lat", location.latitude)
            put(fieldMap["lon"] ?: "lon", location.longitude)
            put(fieldMap["acc"] ?: "acc", location.accuracy.roundToInt())

            if (location.hasAltitude()) {
                put(fieldMap["alt"] ?: "alt", location.altitude.roundToInt())
            }

            put(fieldMap["vel"] ?: "vel", location.speed.roundToInt())
            put(fieldMap["batt"] ?: "batt", batteryLevel)
            put(fieldMap["bs"] ?: "bs", batteryStatus)
            put(fieldMap["tst"] ?: "tst", timestamp)

            if (location.hasBearing()) {
                put(fieldMap["bear"] ?: "bear", location.bearing.toDouble())
            }
        }
    }

    /**
     * Parses JSON string to Map with error handling.
     */
    fun parseFieldMap(jsonString: String?): Map<String, String>? {
        if (jsonString.isNullOrBlank()) return null

        return try {
            val json = JSONObject(jsonString)
            json.keys().asSequence().associateWith { json.getString(it) }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse field map", e)
            null
        }
    }

    /**
     * Parses JSON array string of custom fields into a Map.
     * Expected format: [{"key":"_type","value":"location"},...]
     */
    fun parseCustomFields(jsonString: String?): Map<String, String>? {
        if (jsonString.isNullOrBlank() || jsonString == "[]") return null
        return try {
            val arr = org.json.JSONArray(jsonString)
            val map = mutableMapOf<String, String>()
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                map[obj.getString("key")] = obj.getString("value")
            }
            if (map.isEmpty()) null else map
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse custom fields", e)
            null
        }
    }

    /**
     * Converts ReadableMap to JSON string with null safety.
     */
    fun convertFieldMapToJson(fieldMap: ReadableMap): String {
        val json = JSONObject()
        val iterator = fieldMap.keySetIterator()

        while (iterator.hasNextKey()) {
            val key = iterator.nextKey()
            fieldMap.getString(key)?.let { value ->
                json.put(key, value)
            }
        }

        return json.toString()
    }

}