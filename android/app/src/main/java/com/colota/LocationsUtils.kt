/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.Location
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.URL
import javax.net.ssl.HttpsURLConnection
import kotlin.math.*

/**
 * Utility class providing specialized logic for the Colota tracking engine.
 * Maintains a reference to [Context] to handle system-level queries like battery and network.
 */
class LocationUtils(private val context: Context) {

    companion object {
        private const val TAG = "LocationUtils"
        private const val EARTH_RADIUS_METERS = 6371000.0
        private const val CONNECTION_TIMEOUT = 10000
        private const val READ_TIMEOUT = 10000
    }

    // Lazy initialization - only created when first accessed
    private val dbHelper by lazy { DatabaseHelper.getInstance(context) }
    
    // Cache connectivity manager to avoid repeated getSystemService calls
    private val connectivityManager: ConnectivityManager by lazy {
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    }
    
    @Volatile
    private var cachedGeofences: List<CachedGeofence>? = null
    private var lastGeofenceCacheTime: Long = 0
    private val GEOFENCE_CACHE_MS = 30000L // 30 seconds

    data class CachedGeofence(
        val name: String,
        val lat: Double,
        val lon: Double,
        val radius: Double
    )
    
    @Volatile
    private var lastNetworkCheck: Boolean = true
    private var lastNetworkCheckTime: Long = 0
    private val NETWORK_CHECK_CACHE_MS = 5000L // 5 seconds

    // ========================================
    // GEOMETRY
    // ========================================

    /**
     * Calculates the great-circle distance using Haversine formula.
     * Optimized with cached radians conversion.
     */
    fun calculateDistance(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val lat1Rad = Math.toRadians(lat1)
        val lat2Rad = Math.toRadians(lat2)
        
        val a = sin(dLat / 2).pow(2) + 
                cos(lat1Rad) * cos(lat2Rad) * sin(dLon / 2).pow(2)
        
        return EARTH_RADIUS_METERS * 2 * atan2(sqrt(a), sqrt(1 - a))
    }

    /**
    * Fast distance check without square root for geofence detection.
    * Returns true if within radius (cheaper than full Haversine).
    */
    fun isWithinRadius(lat1: Double, lon1: Double, lat2: Double, lon2: Double, radiusMeters: Double): Boolean {
        // Quick rejection test using simple lat/lon differences
        val latDiff = Math.abs(lat1 - lat2)
        val lonDiff = Math.abs(lon1 - lon2)
        
        // Rough approximation: 1 degree ≈ 111km at equator
        val maxDegreeDiff = radiusMeters / 111000.0
        
        // Quick rejection: if way outside bounding box, skip expensive calculation
        if (latDiff > maxDegreeDiff || lonDiff > maxDegreeDiff) {
            return false
        }
        
        // Only do full Haversine if within rough bounding box
        return calculateDistance(lat1, lon1, lat2, lon2) <= radiusMeters
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