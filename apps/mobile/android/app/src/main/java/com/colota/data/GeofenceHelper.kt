/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.data

import android.content.ContentValues
import com.Colota.util.AppLogger
import com.Colota.util.TimedCache
import android.content.Context
import android.location.Location
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray
import kotlin.math.*

class GeofenceHelper(private val context: Context) {

    private val dbHelper by lazy { DatabaseHelper.getInstance(context) }
    
    private val geofenceCache = TimedCache(30000L) { loadGeofencesFromDB() }

    data class CachedGeofence(
        val name: String,
        val lat: Double,
        val lon: Double,
        val radius: Double,
        val pauseOnWifi: Boolean = false,
        val pauseOnMotionless: Boolean = false,
        val motionlessTimeoutMinutes: Int = 10,
        val heartbeatEnabled: Boolean = false,
        val heartbeatIntervalMinutes: Int = 15
    )

    companion object {
        private const val TAG = "GeofenceHelper"
        internal const val EARTH_RADIUS_METERS = 6371000.0

        /** Haversine formula — accurate at any distance on Earth. */
        internal fun calculateDistance(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
            val dLat = Math.toRadians(lat2 - lat1)
            val dLon = Math.toRadians(lon2 - lon1)
            val a = sin(dLat / 2).pow(2) +
                    cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2)
            return EARTH_RADIUS_METERS * 2 * atan2(sqrt(a), sqrt(1 - a))
        }

        internal fun isWithinRadius(lat1: Double, lon1: Double, lat2: Double, lon2: Double, radius: Double): Boolean {
            // Fast bounding-box rejection (lon degrees shrink at higher latitudes)
            val maxLatDeg = radius / 111000.0
            val maxLonDeg = radius / (111000.0 * cos(Math.toRadians(lat1)))
            if (Math.abs(lat1 - lat2) > maxLatDeg || Math.abs(lon1 - lon2) > maxLonDeg) return false
            return calculateDistance(lat1, lon1, lat2, lon2) <= radius
        }
    }

    fun getGeofenceByName(name: String): CachedGeofence? =
        geofenceCache.get().find { it.name == name }

    fun getPauseZone(location: Location): CachedGeofence? {
        val fences = getGeofences()
        val match = fences.find {
            isWithinRadius(location.latitude, location.longitude, it.lat, it.lon, it.radius)
        }
        if (match != null) {
            val dist = calculateDistance(location.latitude, location.longitude, match.lat, match.lon)
            AppLogger.d(TAG, "Inside zone '${match.name}' (${String.format("%.0f", dist)}m from center, radius=${match.radius}m)")
        }
        return match
    }
    
    fun invalidateCache() {
        geofenceCache.invalidate()
        AppLogger.d(TAG, "Geofence cache invalidated")
    }

    private fun getGeofences(): List<CachedGeofence> = geofenceCache.get()

    private fun loadGeofencesFromDB(): List<CachedGeofence> {
        return try {
            val fences = mutableListOf<CachedGeofence>()
            dbHelper.readableDatabase.query(
                DatabaseHelper.TABLE_GEOFENCES,
                arrayOf("name", "latitude", "longitude", "radius", "pause_on_wifi", "pause_on_motionless", "motionless_timeout_minutes", "heartbeat_enabled", "heartbeat_interval_minutes"),
                "enabled = 1 AND pause_tracking = 1",
                null, null, null, null
            ).use { cursor ->
                val nameIdx = cursor.getColumnIndexOrThrow("name")
                val latIdx = cursor.getColumnIndexOrThrow("latitude")
                val lonIdx = cursor.getColumnIndexOrThrow("longitude")
                val radIdx = cursor.getColumnIndexOrThrow("radius")
                val wifiIdx = cursor.getColumnIndexOrThrow("pause_on_wifi")
                val motionlessIdx = cursor.getColumnIndexOrThrow("pause_on_motionless")
                val timeoutIdx = cursor.getColumnIndexOrThrow("motionless_timeout_minutes")
                val heartbeatIdx = cursor.getColumnIndexOrThrow("heartbeat_enabled")
                val heartbeatIntervalIdx = cursor.getColumnIndexOrThrow("heartbeat_interval_minutes")

                while (cursor.moveToNext()) {
                    fences.add(CachedGeofence(
                        cursor.getString(nameIdx),
                        cursor.getDouble(latIdx),
                        cursor.getDouble(lonIdx),
                        cursor.getDouble(radIdx),
                        cursor.getInt(wifiIdx) == 1,
                        cursor.getInt(motionlessIdx) == 1,
                        cursor.getInt(timeoutIdx),
                        cursor.getInt(heartbeatIdx) == 1,
                        cursor.getInt(heartbeatIntervalIdx)
                    ))
                }
            }
            AppLogger.d(TAG, "Loaded ${fences.size} active pause zone(s)")
            fences
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to refresh geofence cache", e)
            emptyList()
        }
    }

    fun getGeofencesAsArray(): WritableArray {
        val array = Arguments.createArray()

        try {
            dbHelper.readableDatabase.query(
                DatabaseHelper.TABLE_GEOFENCES,
                null, null, null, null, null,
                "created_at DESC"
            ).use { cursor ->
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
                        putBoolean("pauseOnWifi", cursor.getInt(cursor.getColumnIndexOrThrow("pause_on_wifi")) == 1)
                        putBoolean("pauseOnMotionless", cursor.getInt(cursor.getColumnIndexOrThrow("pause_on_motionless")) == 1)
                        putInt("motionlessTimeoutMinutes", cursor.getInt(cursor.getColumnIndexOrThrow("motionless_timeout_minutes")))
                        putBoolean("heartbeatEnabled", cursor.getInt(cursor.getColumnIndexOrThrow("heartbeat_enabled")) == 1)
                        putInt("heartbeatIntervalMinutes", cursor.getInt(cursor.getColumnIndexOrThrow("heartbeat_interval_minutes")))
                        putDouble("createdAt", cursor.getLong(createdIdx).toDouble())
                    })
                }
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to load geofences as array", e)
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
        pause: Boolean,
        pauseOnWifi: Boolean = false,
        pauseOnMotionless: Boolean = false,
        motionlessTimeoutMinutes: Int = 10,
        heartbeatEnabled: Boolean = false,
        heartbeatIntervalMinutes: Int = 15
    ): Int {
        val values = ContentValues().apply {
            put("name", name)
            put("latitude", lat)
            put("longitude", lon)
            put("radius", rad)
            put("enabled", 1)
            put("pause_tracking", if (pause) 1 else 0)
            put("pause_on_wifi", if (pauseOnWifi) 1 else 0)
            put("pause_on_motionless", if (pauseOnMotionless) 1 else 0)
            put("motionless_timeout_minutes", motionlessTimeoutMinutes)
            put("heartbeat_enabled", if (heartbeatEnabled) 1 else 0)
            put("heartbeat_interval_minutes", heartbeatIntervalMinutes)
            put("created_at", System.currentTimeMillis() / 1000)
        }
        
        return dbHelper.writableDatabase
            .insert(DatabaseHelper.TABLE_GEOFENCES, null, values)
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
        pause: Boolean?,
        pauseOnWifi: Boolean? = null,
        pauseOnMotionless: Boolean? = null,
        motionlessTimeoutMinutes: Int? = null,
        heartbeatEnabled: Boolean? = null,
        heartbeatIntervalMinutes: Int? = null
    ): Boolean {
        val values = ContentValues().apply {
            name?.let { put("name", it) }
            lat?.let { put("latitude", it) }
            lon?.let { put("longitude", it) }
            rad?.let { put("radius", it) }
            en?.let { put("enabled", if (it) 1 else 0) }
            pause?.let { put("pause_tracking", if (it) 1 else 0) }
            pauseOnWifi?.let { put("pause_on_wifi", if (it) 1 else 0) }
            pauseOnMotionless?.let { put("pause_on_motionless", if (it) 1 else 0) }
            motionlessTimeoutMinutes?.let { put("motionless_timeout_minutes", it) }
            heartbeatEnabled?.let { put("heartbeat_enabled", if (it) 1 else 0) }
            heartbeatIntervalMinutes?.let { put("heartbeat_interval_minutes", it) }
        }
        
        if (values.size() == 0) return false
        
        return dbHelper.writableDatabase.update(
            DatabaseHelper.TABLE_GEOFENCES, 
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
            DatabaseHelper.TABLE_GEOFENCES, 
            "id = ?", 
            arrayOf(id.toString())
        ) > 0
    }
}