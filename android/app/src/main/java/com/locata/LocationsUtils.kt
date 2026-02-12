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
    private val dbHelper by lazy { LocationDatabaseHelper.getInstance(context) }
    
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
    // NETWORK & SYNC
    // ========================================

    /**
    * Executes an asynchronous POST request to the server.
    * Handles HTTP only for private IPs/localhost, HTTPS otherwise.
    */
    suspend fun sendToEndpoint(
        payload: JSONObject,
        endpoint: String
    ): Boolean = withContext(Dispatchers.IO) {

        if (endpoint.isBlank()) {
            // Endpoint empty, nothing to do
            if (BuildConfig.DEBUG) Log.d(TAG, "Empty endpoint provided")
            return@withContext false
        }

        // Parse URL safely
        val url = try {
            URL(endpoint)
        } catch (e: Exception) {
            Log.e(TAG, "Invalid URL: $endpoint")
            return@withContext false
        }

        val protocol = url.protocol.lowercase()
        val host = url.host ?: return@withContext false

        // Only allow http or https
        if (protocol != "http" && protocol != "https") {
            Log.e(TAG, "Invalid protocol: $endpoint")
            return@withContext false
        }

        // HTTP only allowed for private IPs / localhost
        if (protocol == "http" && !isPrivateHost(host)) {
            Log.e(TAG, "HTTP blocked for non-private host: $endpoint")
            return@withContext false
        }

        // Check network availability
        if (!isNetworkAvailable()) {
            if (BuildConfig.DEBUG) Log.d(TAG, "Sync skipped: No internet")
            return@withContext false
        }

        var connection: java.net.HttpURLConnection? = null

        try {
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

            // Write payload to output stream
            val bodyBytes = payload.toString().toByteArray(Charsets.UTF_8)
            connection.setFixedLengthStreamingMode(bodyBytes.size)

            connection.outputStream.use { it.write(bodyBytes) }

            val responseCode = connection.responseCode

            return@withContext if (responseCode in 200..299) {
                if (BuildConfig.DEBUG) Log.d(TAG, "Location successfully sent")
                true
            } else {
                val errorBody = try {
                    connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error body"
                } catch (_: Exception) {
                    "Could not read error body"
                }
                Log.e(TAG, "POST failed: $responseCode - $errorBody")
                false
            }

        } catch (e: Exception) {
            Log.e(TAG, "Network error: ${e.message}", e)
            false
        } finally {
            connection?.disconnect()
        }
    }


    /**
    * Checks if the given host is private or local.
    * Returns true for:
    * - "localhost"
    * - Loopback addresses (127.x.x.x, ::1)
    * - Site-local addresses (RFC1918)
    * - Any local/unspecified addresses (0.0.0.0, ::)
    */
    private fun isPrivateHost(host: String): Boolean {
        if (host == "localhost") return true // explicit localhost check

        return try {
            val address = java.net.InetAddress.getByName(host)

            // isAnyLocalAddress: 0.0.0.0 / ::0
            // isLoopbackAddress: 127.x.x.x / ::1
            // isSiteLocalAddress: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
            address.isAnyLocalAddress ||
            address.isLoopbackAddress ||
            address.isSiteLocalAddress
        } catch (e: Exception) {
            // Could not resolve host; treat as non-private
            if (BuildConfig.DEBUG) Log.d(TAG, "Host resolution failed for $host: ${e.message}")
            false
        }
    }

    /**
    * Checks for an active, validated internet connection.
    * Cached to avoid excessive system calls.
    */
    fun isNetworkAvailable(): Boolean {
        val now = System.currentTimeMillis()
        
        // Return cached result if fresh
        if ((now - lastNetworkCheckTime) < NETWORK_CHECK_CACHE_MS) {
            return lastNetworkCheck
        }
        
        lastNetworkCheck = try {
            val network = connectivityManager.activeNetwork
            if (network == null) {
                lastNetworkCheckTime = now
                return false
            }

            val capabilities = connectivityManager.getNetworkCapabilities(network)
            if (capabilities == null) {
                lastNetworkCheckTime = now
                return false
            }
            
            // Check for both internet capability and that the OS has validated the connection
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } catch (e: SecurityException) {
            Log.e(TAG, "Missing network permission", e)
            false
        } catch (e: Exception) {
            Log.e(TAG, "Network check failed", e)
            false
        }
        
        lastNetworkCheckTime = now
        return lastNetworkCheck
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
    // GEOFENCING
    // ========================================

    /**
    * Refreshes geofence cache from database
    */
    private fun refreshGeofenceCache(): List<CachedGeofence> {
        val fences = mutableListOf<CachedGeofence>()
        
        dbHelper.readableDatabase.query(
            LocationDatabaseHelper.TABLE_GEOFENCES, 
            arrayOf("name", "latitude", "longitude", "radius"),
            "enabled = 1 AND pause_tracking = 1",
            null, null, null, null
        ).use { cursor ->
            val nameIdx = cursor.getColumnIndexOrThrow("name")
            val latIdx = cursor.getColumnIndexOrThrow("latitude")
            val lonIdx = cursor.getColumnIndexOrThrow("longitude")
            val radiusIdx = cursor.getColumnIndexOrThrow("radius")
            
            while (cursor.moveToNext()) {
                fences.add(CachedGeofence(
                    cursor.getString(nameIdx),
                    cursor.getDouble(latIdx),
                    cursor.getDouble(lonIdx),
                    cursor.getDouble(radiusIdx)
                ))
            }
        }
        
        cachedGeofences = fences
        lastGeofenceCacheTime = System.currentTimeMillis()
        
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "Geofence cache refreshed: ${fences.size} zones")
        }
        
        return fences
    }

    /**
    * Gets geofences from cache or refreshes if stale
    */
    private fun getGeofences(): List<CachedGeofence> {
        val now = System.currentTimeMillis()
        
        return if (cachedGeofences == null || (now - lastGeofenceCacheTime) > GEOFENCE_CACHE_MS) {
            refreshGeofenceCache()
        } else {
            cachedGeofences!!
        }
    }

    /**
    * Invalidates cache when geofences change
    */
    fun invalidateGeofenceCache() {
        cachedGeofences = null
        lastGeofenceCacheTime = 0
        
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "Geofence cache invalidated")
        }
    }

    /**
     * Checks if location is within any active silent zone.
     * Returns immediately on first match for better performance.
     */
    fun getSilentZone(location: Location): String? {
        val fences = getGeofences()
        
        for (fence in fences) {
            if (isWithinRadius(
                    location.latitude, 
                    location.longitude, 
                    fence.lat, 
                    fence.lon,
                    fence.radius
                )) {
                return fence.name
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