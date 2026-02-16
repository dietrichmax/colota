/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.data

import android.content.ContentValues
import com.Colota.BuildConfig
import com.Colota.util.TimedCache
import android.content.Context
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableArray

class ProfileHelper(private val context: Context) {

    private val dbHelper by lazy { DatabaseHelper.getInstance(context) }

    private val profileCache = TimedCache(30000L) { loadEnabledProfilesFromDB() }

    data class CachedProfile(
        val id: Int,
        val name: String,
        val intervalMs: Long,
        val minUpdateDistance: Float,
        val syncIntervalSeconds: Int,
        val priority: Int,
        val conditionType: String,
        val speedThreshold: Float?,
        val deactivationDelaySeconds: Int
    )

    companion object {
        private const val TAG = "ProfileHelper"
    }

    fun invalidateCache() {
        profileCache.invalidate()
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "Profile cache invalidated")
        }
    }

    fun getEnabledProfiles(): List<CachedProfile> = profileCache.get()

    private fun loadEnabledProfilesFromDB(): List<CachedProfile> {
        return try {
            val profiles = mutableListOf<CachedProfile>()
            dbHelper.readableDatabase.query(
                DatabaseHelper.TABLE_PROFILES,
                arrayOf(
                    "id", "name", "interval_ms", "min_update_distance",
                    "sync_interval_seconds", "priority", "condition_type",
                    "speed_threshold", "deactivation_delay_seconds"
                ),
                "enabled = 1",
                null, null, null,
                "priority DESC"
            ).use { cursor ->
                val idIdx = cursor.getColumnIndexOrThrow("id")
                val nameIdx = cursor.getColumnIndexOrThrow("name")
                val intervalIdx = cursor.getColumnIndexOrThrow("interval_ms")
                val distIdx = cursor.getColumnIndexOrThrow("min_update_distance")
                val syncIdx = cursor.getColumnIndexOrThrow("sync_interval_seconds")
                val prioIdx = cursor.getColumnIndexOrThrow("priority")
                val condIdx = cursor.getColumnIndexOrThrow("condition_type")
                val speedIdx = cursor.getColumnIndexOrThrow("speed_threshold")
                val delayIdx = cursor.getColumnIndexOrThrow("deactivation_delay_seconds")

                while (cursor.moveToNext()) {
                    profiles.add(CachedProfile(
                        id = cursor.getInt(idIdx),
                        name = cursor.getString(nameIdx),
                        intervalMs = cursor.getLong(intervalIdx),
                        minUpdateDistance = cursor.getFloat(distIdx),
                        syncIntervalSeconds = cursor.getInt(syncIdx),
                        priority = cursor.getInt(prioIdx),
                        conditionType = cursor.getString(condIdx),
                        speedThreshold = if (cursor.isNull(speedIdx)) null else cursor.getFloat(speedIdx),
                        deactivationDelaySeconds = cursor.getInt(delayIdx)
                    ))
                }
            }
            profiles
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load profiles", e)
            emptyList()
        }
    }

    fun getProfilesAsArray(): WritableArray {
        val array = Arguments.createArray()

        try {
            dbHelper.readableDatabase.query(
                DatabaseHelper.TABLE_PROFILES,
                null, null, null, null, null,
                "priority DESC"
            ).use { cursor ->
                val idIdx = cursor.getColumnIndexOrThrow("id")
                val nameIdx = cursor.getColumnIndexOrThrow("name")
                val intervalIdx = cursor.getColumnIndexOrThrow("interval_ms")
                val distIdx = cursor.getColumnIndexOrThrow("min_update_distance")
                val syncIdx = cursor.getColumnIndexOrThrow("sync_interval_seconds")
                val prioIdx = cursor.getColumnIndexOrThrow("priority")
                val condIdx = cursor.getColumnIndexOrThrow("condition_type")
                val speedIdx = cursor.getColumnIndexOrThrow("speed_threshold")
                val delayIdx = cursor.getColumnIndexOrThrow("deactivation_delay_seconds")
                val enabledIdx = cursor.getColumnIndexOrThrow("enabled")
                val createdIdx = cursor.getColumnIndexOrThrow("created_at")

                while (cursor.moveToNext()) {
                    array.pushMap(Arguments.createMap().apply {
                        putInt("id", cursor.getInt(idIdx))
                        putString("name", cursor.getString(nameIdx))
                        putDouble("intervalMs", cursor.getLong(intervalIdx).toDouble())
                        putDouble("minUpdateDistance", cursor.getFloat(distIdx).toDouble())
                        putInt("syncIntervalSeconds", cursor.getInt(syncIdx))
                        putInt("priority", cursor.getInt(prioIdx))
                        putString("conditionType", cursor.getString(condIdx))
                        if (cursor.isNull(speedIdx)) {
                            putNull("speedThreshold")
                        } else {
                            putDouble("speedThreshold", cursor.getFloat(speedIdx).toDouble())
                        }
                        putInt("deactivationDelaySeconds", cursor.getInt(delayIdx))
                        putBoolean("enabled", cursor.getInt(enabledIdx) == 1)
                        putDouble("createdAt", cursor.getLong(createdIdx).toDouble())
                    })
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load profiles as array", e)
        }

        return array
    }

    fun insertProfile(
        name: String,
        intervalMs: Long,
        minUpdateDistance: Float,
        syncIntervalSeconds: Int,
        priority: Int,
        conditionType: String,
        speedThreshold: Float?,
        deactivationDelaySeconds: Int
    ): Int {
        val values = ContentValues().apply {
            put("name", name)
            put("interval_ms", intervalMs)
            put("min_update_distance", minUpdateDistance)
            put("sync_interval_seconds", syncIntervalSeconds)
            put("priority", priority)
            put("condition_type", conditionType)
            if (speedThreshold != null) {
                put("speed_threshold", speedThreshold)
            } else {
                putNull("speed_threshold")
            }
            put("deactivation_delay_seconds", deactivationDelaySeconds)
            put("enabled", 1)
            put("created_at", System.currentTimeMillis() / 1000)
        }

        return dbHelper.writableDatabase
            .insert(DatabaseHelper.TABLE_PROFILES, null, values)
            .toInt()
    }

    fun updateProfile(
        id: Int,
        name: String?,
        intervalMs: Long?,
        minUpdateDistance: Float?,
        syncIntervalSeconds: Int?,
        priority: Int?,
        conditionType: String?,
        speedThreshold: Float?,
        hasSpeedThreshold: Boolean,
        deactivationDelaySeconds: Int?,
        enabled: Boolean?
    ): Boolean {
        val values = ContentValues().apply {
            name?.let { put("name", it) }
            intervalMs?.let { put("interval_ms", it) }
            minUpdateDistance?.let { put("min_update_distance", it) }
            syncIntervalSeconds?.let { put("sync_interval_seconds", it) }
            priority?.let { put("priority", it) }
            conditionType?.let { put("condition_type", it) }
            if (hasSpeedThreshold) {
                if (speedThreshold != null) {
                    put("speed_threshold", speedThreshold)
                } else {
                    putNull("speed_threshold")
                }
            }
            deactivationDelaySeconds?.let { put("deactivation_delay_seconds", it) }
            enabled?.let { put("enabled", if (it) 1 else 0) }
        }

        if (values.size() == 0) return false

        return dbHelper.writableDatabase.update(
            DatabaseHelper.TABLE_PROFILES,
            values,
            "id = ?",
            arrayOf(id.toString())
        ) > 0
    }

    fun deleteProfile(id: Int): Boolean {
        return dbHelper.writableDatabase.delete(
            DatabaseHelper.TABLE_PROFILES,
            "id = ?",
            arrayOf(id.toString())
        ) > 0
    }

    fun logTripEvent(
        profileId: Int?,
        profileName: String,
        eventType: String,
        latitude: Double?,
        longitude: Double?,
        timestamp: Long
    ) {
        try {
            val values = ContentValues().apply {
                if (profileId != null) {
                    put("profile_id", profileId)
                } else {
                    putNull("profile_id")
                }
                put("profile_name", profileName)
                put("event_type", eventType)
                if (latitude != null) put("latitude", latitude) else putNull("latitude")
                if (longitude != null) put("longitude", longitude) else putNull("longitude")
                put("timestamp", timestamp)
            }

            dbHelper.writableDatabase.insert(DatabaseHelper.TABLE_TRIP_EVENTS, null, values)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to log trip event", e)
        }
    }

    fun getTripEventsAsArray(startTimestamp: Long, endTimestamp: Long): WritableArray {
        val array = Arguments.createArray()

        try {
            dbHelper.readableDatabase.query(
                DatabaseHelper.TABLE_TRIP_EVENTS,
                null,
                "timestamp >= ? AND timestamp <= ?",
                arrayOf(startTimestamp.toString(), endTimestamp.toString()),
                null, null,
                "timestamp DESC"
            ).use { cursor ->
                val idIdx = cursor.getColumnIndexOrThrow("id")
                val profIdIdx = cursor.getColumnIndexOrThrow("profile_id")
                val profNameIdx = cursor.getColumnIndexOrThrow("profile_name")
                val typeIdx = cursor.getColumnIndexOrThrow("event_type")
                val latIdx = cursor.getColumnIndexOrThrow("latitude")
                val lonIdx = cursor.getColumnIndexOrThrow("longitude")
                val tsIdx = cursor.getColumnIndexOrThrow("timestamp")

                while (cursor.moveToNext()) {
                    array.pushMap(Arguments.createMap().apply {
                        putInt("id", cursor.getInt(idIdx))
                        if (cursor.isNull(profIdIdx)) putNull("profileId")
                        else putInt("profileId", cursor.getInt(profIdIdx))
                        putString("profileName", cursor.getString(profNameIdx))
                        putString("eventType", cursor.getString(typeIdx))
                        if (cursor.isNull(latIdx)) putNull("latitude")
                        else putDouble("latitude", cursor.getDouble(latIdx))
                        if (cursor.isNull(lonIdx)) putNull("longitude")
                        else putDouble("longitude", cursor.getDouble(lonIdx))
                        putDouble("timestamp", cursor.getLong(tsIdx).toDouble())
                    })
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load trip events", e)
        }

        return array
    }
}
