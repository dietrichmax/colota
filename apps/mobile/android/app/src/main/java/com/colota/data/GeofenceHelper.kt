/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.data

import android.content.ContentValues
import android.content.Context
import android.location.Location
import com.Colota.util.AppLogger
import com.Colota.util.geo.haversineDistance
import com.Colota.util.geo.isWithinRadius
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray

class GeofenceHelper(private val context: Context) {

    private val dbHelper by lazy { DatabaseHelper.getInstance(context) }

    /** Runtime view of an enabled pause-tracking geofence row. */
    data class Geofence(
        val name: String,
        val lat: Double,
        val lon: Double,
        val radius: Double,
        val pauseOnWifi: Boolean = false,
        val pauseOnMotionless: Boolean = false,
        val motionlessTimeoutMinutes: Int = 10,
        val heartbeatEnabled: Boolean = false,
        val heartbeatIntervalMinutes: Int = 15,
    )

    companion object {
        private const val TAG = "GeofenceHelper"
    }

    fun getGeofenceByName(name: String): Geofence? =
        loadGeofencesFromDB().find { it.name == name }

    fun getPauseZone(location: Location): Geofence? {
        val match = loadGeofencesFromDB().find {
            isWithinRadius(location.latitude, location.longitude, it.lat, it.lon, it.radius)
        }
        if (match != null) {
            val dist = haversineDistance(location.latitude, location.longitude, match.lat, match.lon)
            AppLogger.d(TAG, "Inside zone '${match.name}' (${String.format("%.0f", dist)}m from center, radius=${match.radius}m)")
        }
        return match
    }

    private fun loadGeofencesFromDB(): List<Geofence> {
        return try {
            val fences = mutableListOf<Geofence>()
            dbHelper.readableDatabase.query(
                DatabaseHelper.TABLE_GEOFENCES,
                arrayOf(
                    "name", "latitude", "longitude", "radius",
                    "pause_on_wifi", "pause_on_motionless", "motionless_timeout_minutes",
                    "heartbeat_enabled", "heartbeat_interval_minutes",
                ),
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
                    fences.add(Geofence(
                        name = cursor.getString(nameIdx),
                        lat = cursor.getDouble(latIdx),
                        lon = cursor.getDouble(lonIdx),
                        radius = cursor.getDouble(radIdx),
                        pauseOnWifi = cursor.getInt(wifiIdx) == 1,
                        pauseOnMotionless = cursor.getInt(motionlessIdx) == 1,
                        motionlessTimeoutMinutes = cursor.getInt(timeoutIdx),
                        heartbeatEnabled = cursor.getInt(heartbeatIdx) == 1,
                        heartbeatIntervalMinutes = cursor.getInt(heartbeatIntervalIdx),
                    ))
                }
            }
            AppLogger.d(TAG, "Loaded ${fences.size} active pause zone(s)")
            fences
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to load geofences from DB", e)
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
                val radIdx = cursor.getColumnIndexOrThrow("radius")
                val enabledIdx = cursor.getColumnIndexOrThrow("enabled")
                val pauseIdx = cursor.getColumnIndexOrThrow("pause_tracking")
                val wifiIdx = cursor.getColumnIndexOrThrow("pause_on_wifi")
                val motionlessIdx = cursor.getColumnIndexOrThrow("pause_on_motionless")
                val timeoutIdx = cursor.getColumnIndexOrThrow("motionless_timeout_minutes")
                val heartbeatIdx = cursor.getColumnIndexOrThrow("heartbeat_enabled")
                val heartbeatIntervalIdx = cursor.getColumnIndexOrThrow("heartbeat_interval_minutes")
                val createdIdx = cursor.getColumnIndexOrThrow("created_at")

                while (cursor.moveToNext()) {
                    array.pushMap(Arguments.createMap().apply {
                        putInt("id", cursor.getInt(idIdx))
                        putString("name", cursor.getString(nameIdx))
                        putDouble("lat", cursor.getDouble(latIdx))
                        putDouble("lon", cursor.getDouble(lonIdx))
                        putDouble("radius", cursor.getDouble(radIdx))
                        putBoolean("enabled", cursor.getInt(enabledIdx) == 1)
                        putBoolean("pauseTracking", cursor.getInt(pauseIdx) == 1)
                        putBoolean("pauseOnWifi", cursor.getInt(wifiIdx) == 1)
                        putBoolean("pauseOnMotionless", cursor.getInt(motionlessIdx) == 1)
                        putInt("motionlessTimeoutMinutes", cursor.getInt(timeoutIdx))
                        putBoolean("heartbeatEnabled", cursor.getInt(heartbeatIdx) == 1)
                        putInt("heartbeatIntervalMinutes", cursor.getInt(heartbeatIntervalIdx))
                        putDouble("createdAt", cursor.getLong(createdIdx).toDouble())
                    })
                }
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to load geofences as array", e)
        }

        return array
    }

    /** Inserts a geofence. Returns the new row id, or -1 on failure. */
    fun insertGeofence(
        name: String,
        lat: Double,
        lon: Double,
        radius: Double,
        pauseTracking: Boolean,
        pauseOnWifi: Boolean = false,
        pauseOnMotionless: Boolean = false,
        motionlessTimeoutMinutes: Int = 10,
        heartbeatEnabled: Boolean = false,
        heartbeatIntervalMinutes: Int = 15,
    ): Int {
        val values = ContentValues().apply {
            put("name", name)
            put("latitude", lat)
            put("longitude", lon)
            put("radius", radius)
            put("enabled", 1)
            put("pause_tracking", if (pauseTracking) 1 else 0)
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

    /** PATCH-style update: null args leave the column untouched. Returns false if nothing changed. */
    fun updateGeofence(
        id: Int,
        name: String? = null,
        lat: Double? = null,
        lon: Double? = null,
        radius: Double? = null,
        enabled: Boolean? = null,
        pauseTracking: Boolean? = null,
        pauseOnWifi: Boolean? = null,
        pauseOnMotionless: Boolean? = null,
        motionlessTimeoutMinutes: Int? = null,
        heartbeatEnabled: Boolean? = null,
        heartbeatIntervalMinutes: Int? = null,
    ): Boolean {
        val values = ContentValues().apply {
            name?.let { put("name", it) }
            lat?.let { put("latitude", it) }
            lon?.let { put("longitude", it) }
            radius?.let { put("radius", it) }
            enabled?.let { put("enabled", if (it) 1 else 0) }
            pauseTracking?.let { put("pause_tracking", if (it) 1 else 0) }
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

    /** Deletes a geofence by id. */
    fun deleteGeofence(id: Int): Boolean {
        return dbHelper.writableDatabase.delete(
            DatabaseHelper.TABLE_GEOFENCES,
            "id = ?",
            arrayOf(id.toString())
        ) > 0
    }
}
