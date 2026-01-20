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
        private const val CONNECTION_TIMEOUT = 15000
        private const val READ_TIMEOUT = 15000
    }

    // Lazy initialization - only created when first accessed
    private val dbHelper by lazy { LocationDatabaseHelper.getInstance(context) }
    
    // Cache connectivity manager to avoid repeated getSystemService calls
    private val connectivityManager by lazy { 
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager 
    }

    // ========================================
    // NETWORK & SYNC
    // ========================================

    /**
    * Executes an asynchronous POST request to the server.
    * Handles both HTTP (for localhost) and HTTPS connections.
    */
    suspend fun sendToEndpoint(
        payload: JSONObject, 
        endpoint: String
    ): Boolean = withContext(Dispatchers.IO) {
        Log.d(TAG, "Reached sendToEndpoint")
        // Validate endpoint
        if (endpoint.isBlank()) {
            Log.w(TAG, "Empty endpoint provided")
            return@withContext false
        }
        
        // Determine if localhost/local network
        val isLocalhost = endpoint.contains("localhost") || 
                        endpoint.contains("127.0.0.1") || 
                        endpoint.contains("192.168.") ||
                        endpoint.contains("10.0.")
        
        // Single validation check
        val isValid = when {
            endpoint.startsWith("https://", ignoreCase = true) -> true
            endpoint.startsWith("http://", ignoreCase = true) && isLocalhost -> true
            endpoint.startsWith("http://", ignoreCase = true) -> {
                Log.e(TAG, "Insecure endpoint blocked: $endpoint (use HTTPS for non-localhost)")
                false
            }
            else -> {
                Log.e(TAG, "Invalid protocol: $endpoint (must start with http:// or https://)")
                false
            }
        }
        
        if (!isValid) return@withContext false
        
        // Check network availability
        if (!isNetworkAvailable()) {
            Log.d(TAG, "Sync skipped: No internet")
            return@withContext false
        }
        
        var connection: java.net.HttpURLConnection? = null
        
        try {
            Log.d(TAG, "Sending")
            val url = URL(endpoint)
            connection = url.openConnection() as java.net.HttpURLConnection
            
            connection.apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                setRequestProperty("Accept", "application/json")
                doOutput = true
                connectTimeout = CONNECTION_TIMEOUT
                readTimeout = READ_TIMEOUT
                useCaches = false
            }
            
            // Write payload
            val bodyBytes = payload.toString().toByteArray(Charsets.UTF_8)
            connection.setFixedLengthStreamingMode(bodyBytes.size)
            
            connection.outputStream.use { outputStream ->
                outputStream.write(bodyBytes)
            }
            
            // Read response
            val responseCode = connection.responseCode
            
            if (responseCode in 200..299) {
                
                Log.d(TAG, "Location successfully sent")
                // Success - optionally read response body
                // connection.inputStream.use { it.bufferedReader().readText() }
                true
            } else {
                // Read error body for debugging
                val errorBody = try {
                    connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error body"
                } catch (e: Exception) {
                    "Could not read error body"
                }
                
                Log.e(TAG, "POST failed: $responseCode - $errorBody")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Network error: ${e.message}", e)
            false
        } finally {
            // Manual cleanup since we can't use .use{}
            connection?.disconnect()
        }
    }

    /**
     * Checks for an active, validated internet connection.
     * Uses cached ConnectivityManager for better performance.
     */
    fun isNetworkAvailable(): Boolean {
        return try {
            val activeNetwork = connectivityManager.activeNetwork ?: return false
            val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork) 
                ?: return false
            
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } catch (e: SecurityException) {
            Log.e(TAG, "Missing network permission", e)
            false
        }
    }

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
        timestamp: Long
    ): JSONObject {
        return JSONObject().apply {
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

    // ========================================
    // DEVICE STATUS
    // ========================================

    /**
     * Reads battery level and charging status.
     */
    fun getBatteryStatus(): Pair<Int, Int> {
        val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            ?: return Pair(0, 0)  // unknown
        
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        
        val percentage = if (scale > 0) {
            (level * 100 / scale.toFloat()).toInt()
        } else {
            0
        }
        
        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        
        // Convert to 0-3 status code
        val batteryStatus = when (status) {
            BatteryManager.BATTERY_STATUS_CHARGING -> 2      // charging
            BatteryManager.BATTERY_STATUS_FULL -> 3          // full
            BatteryManager.BATTERY_STATUS_DISCHARGING,
            BatteryManager.BATTERY_STATUS_NOT_CHARGING -> 1  // unplugged
            else -> 0                                         // unknown
        }
                            
        return Pair(percentage, batteryStatus)
    }

    // ========================================
    // GEOFENCING
    // ========================================

    /**
     * Checks if location is within any active silent zone.
     * Returns immediately on first match for better performance.
     */
    fun getSilentZone(location: Location): String? {
        dbHelper.readableDatabase.query(
            LocationDatabaseHelper.TABLE_GEOFENCES, 
            arrayOf("name", "latitude", "longitude", "radius"),
            "enabled = 1 AND pause_tracking = 1",
            null, null, null, null
        ).use { cursor ->
            while (cursor.moveToNext()) {
                val fenceLat = cursor.getDouble(1)
                val fenceLon = cursor.getDouble(2)
                val radius = cursor.getDouble(3)
                
                if (calculateDistance(location.latitude, location.longitude, fenceLat, fenceLon) <= radius) {
                    return cursor.getString(0)
                }
            }
        }
        return null
    }

    /**
     * Fetches all geofences with optimized column index caching.
     */
    fun getGeofencesAsArray(): WritableArray {
        val array = Arguments.createArray()
        
        dbHelper.readableDatabase.query(
            LocationDatabaseHelper.TABLE_GEOFENCES, 
            null, null, null, null, null, 
            "created_at DESC"
        ).use { cursor ->
            // Cache column indices (faster than repeated getColumnIndexOrThrow calls)
            val idIdx = cursor.getColumnIndexOrThrow("id")
            val nameIdx = cursor.getColumnIndexOrThrow("name")
            val latIdx = cursor.getColumnIndexOrThrow("latitude")
            val lonIdx = cursor.getColumnIndexOrThrow("longitude")
            val radiusIdx = cursor.getColumnIndexOrThrow("radius")
            val enabledIdx = cursor.getColumnIndexOrThrow("enabled")
            val pauseIdx = cursor.getColumnIndexOrThrow("pause_tracking")
            val createdIdx = cursor.getColumnIndexOrThrow("created_at")
            
            while (cursor.moveToNext()) {
                array.pushMap(Arguments.createMap().apply {
                    putInt("id", cursor.getInt(idIdx))
                    putString("name", cursor.getString(nameIdx))
                    putDouble("lat", cursor.getDouble(latIdx))
                    putDouble("lon", cursor.getDouble(lonIdx))
                    putDouble("radius", cursor.getDouble(radiusIdx))
                    putBoolean("enabled", cursor.getInt(enabledIdx) == 1)
                    putBoolean("pauseTracking", cursor.getInt(pauseIdx) == 1)
                    putDouble("createdAt", cursor.getLong(createdIdx).toDouble())
                })
            }
        }
        
        return array
    }

    /**
     * Inserts a new geofence into the database.
     */
    fun insertGeofence(
        name: String, 
        lat: Double, 
        lon: Double, 
        rad: Double, 
        pause: Boolean
    ): Int {
        val values = ContentValues().apply {
            put("name", name)
            put("latitude", lat)
            put("longitude", lon)
            put("radius", rad)
            put("enabled", 1)
            put("pause_tracking", if (pause) 1 else 0)
            put("created_at", System.currentTimeMillis())
        }
        
        return dbHelper.writableDatabase
            .insert(LocationDatabaseHelper.TABLE_GEOFENCES, null, values)
            .toInt()
    }
    
    /**
     * Updates geofence with only provided fields.
     */
    fun updateGeofence(
        id: Int, 
        name: String?, 
        lat: Double?, 
        lon: Double?, 
        rad: Double?, 
        en: Boolean?, 
        pause: Boolean?
    ): Boolean {
        val values = ContentValues().apply {
            name?.let { put("name", it) }
            lat?.let { put("latitude", it) }
            lon?.let { put("longitude", it) }
            rad?.let { put("radius", it) }
            en?.let { put("enabled", if (it) 1 else 0) }
            pause?.let { put("pause_tracking", if (it) 1 else 0) }
        }
        
        if (values.size() == 0) return false
        
        return dbHelper.writableDatabase.update(
            LocationDatabaseHelper.TABLE_GEOFENCES, 
            values, 
            "id = ?", 
            arrayOf(id.toString())
        ) > 0
    }

    /**
     * Deletes a geofence by ID.
     */
    fun deleteGeofence(id: Int): Boolean {
        return dbHelper.writableDatabase.delete(
            LocationDatabaseHelper.TABLE_GEOFENCES, 
            "id = ?", 
            arrayOf(id.toString())
        ) > 0
    }
}