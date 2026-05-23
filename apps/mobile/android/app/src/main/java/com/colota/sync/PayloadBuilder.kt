/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync

import android.location.Location
import com.Colota.util.AppLogger
import com.Colota.util.BatteryStatus
import org.json.JSONObject
import java.time.Instant
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
     * Custom fields go at the envelope level (matches the Overland iOS client and
     * what Dawarich's overland controller expects), NOT inside per-Feature properties.
     *
     * The `device_id` fallback chain (device_id -> tid -> id -> "colota") lets users
     * migrating from OwnTracks (tid) or Traccar (id) keep their identity working
     * without reconfiguring custom fields. Don't prune as dead code.
     */
    fun buildOverlandBatchPayload(
        items: List<JSONObject>,
        customFields: Map<String, String>,
    ): JSONObject {
        val locations = org.json.JSONArray()
        for (flat in items) {
            locations.put(flatToOverlandFeature(flat))
        }
        return JSONObject().apply {
            put("locations", locations)
            customFields.forEach { (key, value) ->
                if (key != "device_id" && key != "locations") put(key, value)
            }
            val firstPayload = items.firstOrNull() ?: JSONObject()
            val deviceId = customFields["device_id"]?.ifBlank { null }
                ?: firstPayload.optString("device_id", "").ifBlank { null }
                ?: firstPayload.optString("tid", "").ifBlank { null }
                ?: firstPayload.optString("id", "").ifBlank { null }
                ?: "colota"
            put("device_id", deviceId)
        }
    }

    private fun flatToOverlandFeature(flat: JSONObject): JSONObject {
        val coordinates = org.json.JSONArray().apply {
            put(flat.optDouble("lon", 0.0))  // GeoJSON: [lon, lat], not lat/lon
            put(flat.optDouble("lat", 0.0))
        }
        val geometry = JSONObject().apply {
            put("type", "Point")
            put("coordinates", coordinates)
        }
        val properties = JSONObject().apply {
            // Guard against tst=0 from a corrupted row (optLong's default only fires on missing key).
            val tstRaw = flat.optLong("tst", 0L)
            val tst = if (tstRaw > 0) tstRaw else System.currentTimeMillis() / 1000
            put("timestamp", Instant.ofEpochSecond(tst).toString())
            if (flat.has("acc")) put("horizontal_accuracy", flat.optInt("acc"))
            if (flat.has("alt")) put("altitude", flat.optInt("alt"))
            if (flat.has("vel")) put("speed", flat.optDouble("vel"))
            if (flat.has("bear")) put("course", flat.optDouble("bear"))
            val batt = flat.optInt("batt", -1)
            if (batt >= 0) {
                put("battery_level", batt / 100.0)
                put("battery_state", BatteryStatus.toOverlandString(flat.optInt("bs", BatteryStatus.UNKNOWN)))
            }
        }
        return JSONObject().apply {
            put("type", "Feature")
            put("geometry", geometry)
            put("properties", properties)
        }
    }

    /** Traccar 6.7.0+ JSON spec: https://www.traccar.org/osmand/ */
    fun buildTraccarJsonPayload(flat: JSONObject): JSONObject {
        val coords = JSONObject().apply {
            put("latitude", flat.optDouble("lat", 0.0))
            put("longitude", flat.optDouble("lon", 0.0))
            if (flat.has("acc")) put("accuracy", flat.optDouble("acc"))
            if (flat.has("alt")) put("altitude", flat.optDouble("alt"))
            if (flat.has("vel")) put("speed", flat.optDouble("vel"))
            if (flat.has("bear")) put("heading", flat.optDouble("bear"))
        }

        val tst = flat.optLong("tst", System.currentTimeMillis() / 1000)
        val timestamp = Instant.ofEpochSecond(tst).toString()

        val location = JSONObject().apply {
            put("timestamp", timestamp)
            put("coords", coords)
            val batt = flat.optInt("batt", -1)
            if (batt >= 0) {
                val bs = flat.optInt("bs", BatteryStatus.UNKNOWN)
                put("battery", JSONObject().apply {
                    put("level", batt / 100.0)
                    put("is_charging", BatteryStatus.isPluggedIn(bs))
                })
            }
        }

        return JSONObject().apply {
            put("location", location)
            // Prefer "id" (Traccar OsmAnd GET custom field) so both modes share the same identifier
            val deviceId = flat.optString("id", "").ifBlank { flat.optString("device_id", "colota") }
            put("device_id", deviceId)
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
