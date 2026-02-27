/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.data

import android.content.ContentValues
import com.Colota.util.AppLogger
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.database.sqlite.SQLiteStatement
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.*
import org.json.JSONObject

/**
 * SQLite database helper for Colota location tracking.
 *
 * SECURITY NOTE: The database is NOT encrypted. Location history (coordinates,
 * timestamps, battery) is stored in plaintext. This is a known limitation —
 * an attacker with physical device access or root could read the data.
 * Migrating to SQLCipher would address this but adds APK size (~3 MB) and
 * a performance cost. Auth credentials are stored separately in
 * EncryptedSharedPreferences (see SecureStorageHelper).
 */
class DatabaseHelper private constructor(context: Context) :
    SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        private const val DATABASE_NAME = "Colota.db"
        private const val DATABASE_VERSION = 2

        const val TABLE_LOCATIONS = "locations"
        const val TABLE_QUEUE = "queue"
        const val TABLE_SETTINGS = "settings"
        const val TABLE_GEOFENCES = "geofences"
        const val TABLE_PROFILES = "tracking_profiles"
        private val DEFAULT_FIELD_MAP = mapOf(
            "lat" to "lat", "lon" to "lon", "acc" to "acc",
            "alt" to "alt", "vel" to "vel", "batt" to "batt",
            "bs" to "bs", "tst" to "tst", "bear" to "bear"
        )

        private const val TAG = "LocationDB"
        private const val TRIP_GAP_SECONDS = 900L // 15 min, matches JS segmentTrips

        @Volatile
        private var INSTANCE: DatabaseHelper? = null

        /**
         * Returns the singleton instance of the [DatabaseHelper].
         * Using the Application Context prevents memory leaks.
         */
        @JvmStatic
        fun getInstance(context: Context): DatabaseHelper {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: DatabaseHelper(context.applicationContext).also {
                    INSTANCE = it
                }
            }
        }
    }

    private var incrementRetryStmt: SQLiteStatement? = null

    override fun onCreate(db: SQLiteDatabase) {
        AppLogger.i(TAG, "Creating database v$DATABASE_VERSION")
        db.execSQL("""
            CREATE TABLE $TABLE_LOCATIONS (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                accuracy INTEGER,
                altitude INTEGER,
                speed INTEGER,
                bearing REAL,
                battery INTEGER,
                battery_status INTEGER,
                timestamp INTEGER NOT NULL,
                endpoint TEXT,
                created_at INTEGER NOT NULL
            )
        """)

        db.execSQL("""
            CREATE TABLE $TABLE_QUEUE (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                location_id INTEGER NOT NULL,
                payload TEXT NOT NULL,
                retry_count INTEGER DEFAULT 0,
                last_error TEXT,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (location_id) REFERENCES $TABLE_LOCATIONS(id) ON DELETE CASCADE
            )
        """)

        db.execSQL("""
            CREATE TABLE $TABLE_SETTINGS (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)

        db.execSQL("""
            CREATE TABLE $TABLE_GEOFENCES (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                radius REAL NOT NULL,
                enabled INTEGER DEFAULT 1,
                pause_tracking INTEGER DEFAULT 1,
                notify_enter INTEGER DEFAULT 0,
                notify_exit INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL
            )
        """)

        db.execSQL("""
            CREATE TABLE $TABLE_PROFILES (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                interval_ms INTEGER NOT NULL,
                min_update_distance REAL NOT NULL,
                sync_interval_seconds INTEGER NOT NULL,
                priority INTEGER NOT NULL DEFAULT 0,
                condition_type TEXT NOT NULL,
                speed_threshold REAL,
                deactivation_delay_seconds INTEGER NOT NULL DEFAULT 30,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL
            )
        """)

        db.execSQL("CREATE INDEX idx_queue_created ON $TABLE_QUEUE(created_at)")
        db.execSQL("CREATE INDEX idx_queue_location ON $TABLE_QUEUE(location_id)")
        db.execSQL("CREATE INDEX idx_locations_timestamp ON $TABLE_LOCATIONS(timestamp DESC)")
        db.execSQL("CREATE INDEX idx_locations_created ON $TABLE_LOCATIONS(created_at DESC)")
        db.execSQL("CREATE INDEX idx_geofences_enabled ON $TABLE_GEOFENCES(enabled, pause_tracking)")
        db.execSQL("CREATE INDEX idx_profiles_enabled ON $TABLE_PROFILES(enabled, priority DESC)")
        db.execSQL("CREATE INDEX idx_queue_retry ON $TABLE_QUEUE(retry_count)")

        prepopulateSettings(db)
    }

    private fun prepopulateSettings(db: SQLiteDatabase) {
        val fieldMapJson = JSONObject(DEFAULT_FIELD_MAP).toString()
        val defaults = mapOf(
            "interval" to "5000",
            "endpoint" to "",
            "minUpdateDistance" to "0",
            "fieldMap" to fieldMapJson,
            "syncInterval" to "0",
            "accuracyThreshold" to "50.0",
            "filterInaccurateLocations" to "false",
            "maxRetries" to "5",
            "retryInterval" to "30",
            "isOfflineMode" to "false",
            "isWifiOnlySync" to "false",
            "customFields" to "[]",
            "hasCompletedSetup" to "false",
            "tracking_enabled" to "false",
            "apiTemplate" to "custom",
            "syncPreset" to "instant",
            "httpMethod" to "POST"
        )

        db.beginTransaction()
        try {
            defaults.forEach { (key, value) ->
                val values = ContentValues().apply {
                    put("key", key)
                    put("value", value)
                }
                db.insertWithOnConflict(TABLE_SETTINGS, null, values, SQLiteDatabase.CONFLICT_IGNORE)
            }
            db.setTransactionSuccessful()
        } catch (e: Exception) {
            AppLogger.e(TAG, "Error prepopulating settings", e)
        } finally {
            db.endTransaction()
        }
    }

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.enableWriteAheadLogging() // allows concurrent reads during writes
        db.rawQuery("PRAGMA busy_timeout = 5000", null).use { it.moveToFirst() }
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        AppLogger.i(TAG, "Upgrading database from v$oldVersion to v$newVersion")
        if (oldVersion < 2) {
            db.execSQL("""
                CREATE TABLE IF NOT EXISTS $TABLE_PROFILES (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    interval_ms INTEGER NOT NULL,
                    min_update_distance REAL NOT NULL,
                    sync_interval_seconds INTEGER NOT NULL,
                    priority INTEGER NOT NULL DEFAULT 0,
                    condition_type TEXT NOT NULL,
                    speed_threshold REAL,
                    deactivation_delay_seconds INTEGER NOT NULL DEFAULT 30,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at INTEGER NOT NULL
                )
            """)
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_profiles_enabled ON $TABLE_PROFILES(enabled, priority DESC)")
        }
    }

    override fun onOpen(db: SQLiteDatabase) {
        super.onOpen(db)
        if (!db.isReadOnly) {
            db.execSQL("PRAGMA synchronous = NORMAL") // faster writes, safe with WAL
            db.execSQL("PRAGMA foreign_keys = ON")
        }
        
        incrementRetryStmt = db.compileStatement(
            "UPDATE $TABLE_QUEUE SET retry_count = retry_count + 1, last_error = ? WHERE id = ?"
        )
    }

    override fun close() {
        incrementRetryStmt?.close()
        incrementRetryStmt = null
        super.close()
    }


    fun saveLocation(
        latitude: Double,
        longitude: Double,
        accuracy: Double? = null,
        altitude: Int? = null,
        speed: Double? = null,
        bearing: Double? = null,
        battery: Int? = null,
        battery_status: Int? = null,
        timestamp: Long,
        endpoint: String? = null
    ): Long {
        val values = ContentValues().apply {
            put("latitude", latitude)
            put("longitude", longitude)
            put("accuracy", accuracy)
            put("altitude", altitude)
            put("speed", speed)
            put("bearing", bearing)
            put("battery", battery)
            put("battery_status", battery_status)
            put("timestamp", timestamp)
            put("endpoint", endpoint)
            put("created_at", System.currentTimeMillis() / 1000)
        }
        return writableDatabase.insert(TABLE_LOCATIONS, null, values)
    }

    /** Returns the most recent location (all locations live in the locations table). */
    fun getRawMostRecentLocation(): Map<String, Any?>? {
        val query = """
            SELECT latitude, longitude, accuracy, timestamp
            FROM $TABLE_LOCATIONS ORDER BY timestamp DESC LIMIT 1
        """.trimIndent()

        return try {
            readableDatabase.rawQuery(query, null).use { cursor ->
                if (cursor.moveToFirst()) {
                    mapOf(
                        "latitude" to cursor.getDouble(0),
                        "longitude" to cursor.getDouble(1),
                        "accuracy" to cursor.getDouble(2),
                        "timestamp" to cursor.getLong(3)
                    )
                } else {
                    null
                }
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Query failed", e)
            null
        }
    }

    private val ALLOWED_TABLES = setOf(TABLE_LOCATIONS, TABLE_QUEUE, TABLE_SETTINGS, TABLE_GEOFENCES, TABLE_PROFILES)

    fun getTableData(tableName: String, limit: Int, offset: Int): List<Map<String, Any?>> {
        require(tableName in ALLOWED_TABLES) { "Invalid table name: $tableName" }

        val data = mutableListOf<Map<String, Any?>>()

        val orderBy = when(tableName) {
            TABLE_LOCATIONS -> "timestamp DESC"
            TABLE_QUEUE -> "created_at DESC"
            TABLE_GEOFENCES -> "created_at DESC"
            else -> "ROWID DESC"
        }

        try {
            readableDatabase.query(
                tableName, 
                null, 
                null, null, null, null, 
                orderBy, 
                "$limit OFFSET $offset"
            ).use { cursor ->
                val columnNames = cursor.columnNames
                
                while (cursor.moveToNext()) {
                    val row = mutableMapOf<String, Any?>()
                    
                    for (column in columnNames) {
                        val idx = cursor.getColumnIndex(column)
                        if (idx != -1) {
                            row[column] = when (cursor.getType(idx)) {
                                android.database.Cursor.FIELD_TYPE_INTEGER -> cursor.getLong(idx)
                                android.database.Cursor.FIELD_TYPE_FLOAT -> cursor.getDouble(idx)
                                android.database.Cursor.FIELD_TYPE_STRING -> cursor.getString(idx)
                                else -> null
                            }
                        }
                    }
                    data.add(row)
                }
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Error reading table $tableName", e)
        }
        
        return data
    }

    /**
     * Retrieves locations within a date range, ordered chronologically.
     * Used for rendering track polylines on the map view.
     *
     * @param startTimestamp Start of range (Unix seconds, inclusive)
     * @param endTimestamp End of range (Unix seconds, inclusive)
     * @return Locations ordered by timestamp ASC for polyline drawing
     */
    fun getLocationsByDateRange(startTimestamp: Long, endTimestamp: Long): List<Map<String, Any?>> {
        val data = mutableListOf<Map<String, Any?>>()

        try {
            readableDatabase.query(
                TABLE_LOCATIONS,
                null,
                "timestamp >= ? AND timestamp <= ?",
                arrayOf(startTimestamp.toString(), endTimestamp.toString()),
                null, null,
                "timestamp ASC"
            ).use { cursor ->
                val columnNames = cursor.columnNames

                while (cursor.moveToNext()) {
                    val row = mutableMapOf<String, Any?>()
                    for (column in columnNames) {
                        val idx = cursor.getColumnIndex(column)
                        if (idx != -1) {
                            row[column] = when (cursor.getType(idx)) {
                                android.database.Cursor.FIELD_TYPE_INTEGER -> cursor.getLong(idx)
                                android.database.Cursor.FIELD_TYPE_FLOAT -> cursor.getDouble(idx)
                                android.database.Cursor.FIELD_TYPE_STRING -> cursor.getString(idx)
                                else -> null
                            }
                        }
                    }
                    data.add(row)
                }
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Error reading locations by date range", e)
        }

        return data
    }

    /**
    * Adds location to transmission queue.
    * @return The queue ID of the inserted row
    */
    fun addToQueue(locationId: Long, payload: String): Long {
        val values = ContentValues().apply {
            put("location_id", locationId)
            put("payload", payload)
            put("retry_count", 0)
            put("created_at", System.currentTimeMillis() / 1000)
        }
        return writableDatabase.insert(TABLE_QUEUE, null, values)
    }

    fun getQueuedLocations(limit: Int = 10): List<QueuedLocation> {
        val locations = mutableListOf<QueuedLocation>()
        
        readableDatabase.query(
            TABLE_QUEUE,
            arrayOf("id", "location_id", "payload", "retry_count"),
            null, null, null, null,
            "created_at ASC",
            limit.toString()
        ).use { cursor ->
            while (cursor.moveToNext()) {
                locations.add(
                    QueuedLocation(
                        queueId = cursor.getLong(0),
                        locationId = cursor.getLong(1),
                        payload = cursor.getString(2),
                        retryCount = cursor.getInt(3)
                    )
                )
            }
        }
        
        return locations
    }

    fun removeFromQueueByLocationId(locationId: Long): Int {
        return writableDatabase.delete(
            TABLE_QUEUE,
            "location_id = ?",
            arrayOf(locationId.toString())
        )
    }

    fun removeBatchFromQueue(queueIds: List<Long>) {
        if (queueIds.isEmpty()) return

        val placeholders = queueIds.joinToString(",") { "?" }
        val args = queueIds.map { it.toString() }.toTypedArray()

        val deleted = writableDatabase.delete(
            TABLE_QUEUE,
            "id IN ($placeholders)",
            args
        )

        if (deleted > 0) {
            AppLogger.d(TAG, "Batch deleted $deleted queue items")
        }
    }

    fun deleteLocations(locationIds: List<Long>) {
        if (locationIds.isEmpty()) return
        val placeholders = locationIds.joinToString(",") { "?" }
        val args = locationIds.map { it.toString() }.toTypedArray()
        writableDatabase.delete(TABLE_LOCATIONS, "id IN ($placeholders)", args)
    }

    @Synchronized
    fun incrementRetryCount(queueId: Long, error: String? = null) {
        val stmt = incrementRetryStmt ?: return // Exit if statement is null
        
        stmt.clearBindings()
        stmt.bindString(1, error ?: "")
        stmt.bindLong(2, queueId)
        stmt.executeUpdateDelete()
    }


    fun getStats(): Triple<Int, Int, Int> {
        val query = """
            SELECT 
                (SELECT COUNT(*) FROM $TABLE_QUEUE) as queued,
                (SELECT COUNT(*) FROM $TABLE_LOCATIONS) as total,
                (SELECT COUNT(*) FROM $TABLE_LOCATIONS WHERE timestamp >= ?) as today
        """.trimIndent()
        
        val todayStart = getTodayStartTimestamp()
        
        return readableDatabase.rawQuery(query, arrayOf(todayStart.toString())).use { cursor ->
            if (cursor.moveToFirst()) {
                Triple(
                    cursor.getInt(0), // queued
                    cursor.getInt(1), // total
                    cursor.getInt(2)  // today
                )
            } else {
                Triple(0, 0, 0)
            }
        }
    }

    fun getQueuedCount(): Int {
        return readableDatabase.rawQuery("SELECT COUNT(*) FROM $TABLE_QUEUE", null).use {
            if (it.moveToFirst()) it.getInt(0) else 0
        }
    }

    fun getDatabaseSizeMB(): Double {
        val dbPath = readableDatabase.path ?: return 0.0
        return java.io.File(dbPath).length() / (1024.0 * 1024.0)
    }


    fun clearSentHistory(): Int {
        AppLogger.d(TAG, "Clearing sent history")
        return writableDatabase.delete(
            TABLE_LOCATIONS,
            "id NOT IN (SELECT location_id FROM $TABLE_QUEUE)",
            null
        )
    }

    fun clearQueue(): Int {
        AppLogger.d(TAG, "Clearing queue")
        // Deleting locations cascades to their queue entries via FK ON DELETE CASCADE
        return writableDatabase.delete(
            TABLE_LOCATIONS,
            "id IN (SELECT location_id FROM $TABLE_QUEUE)",
            null
        )
    }

    fun clearAllLocations(): Int {
        writableDatabase.delete(TABLE_QUEUE, null, null) // FK constraint: queue references locations
        return writableDatabase.delete(TABLE_LOCATIONS, null, null)
    }

    fun deleteOlderThan(days: Int): Int {
        val cutoff = (System.currentTimeMillis() - days * 24 * 60 * 60 * 1000L) / 1000
        return writableDatabase.delete(TABLE_LOCATIONS, "timestamp < ?", arrayOf(cutoff.toString()))
    }

    /** Reclaims unused space. Call from background thread only. */
    fun vacuum() {
        AppLogger.d(TAG, "Starting VACUUM + ANALYZE")
        try {
            writableDatabase.execSQL("VACUUM")
            writableDatabase.execSQL("ANALYZE")
            AppLogger.d(TAG, "VACUUM + ANALYZE completed")
        } catch (e: Exception) {
            AppLogger.e(TAG, "Vacuum failed (likely concurrent access)", e)
        }
    }


    fun saveSetting(key: String, value: String) {
        val values = ContentValues().apply {
            put("key", key)
            put("value", value)
        }
        writableDatabase.insertWithOnConflict(
            TABLE_SETTINGS, 
            null, 
            values, 
            SQLiteDatabase.CONFLICT_REPLACE
        )
    }

    fun getSetting(key: String, defaultValue: String? = null): String? {
        return readableDatabase.query(
            TABLE_SETTINGS,
            arrayOf("value"),
            "key = ?",
            arrayOf(key),
            null, null, null
        ).use {
            if (it.moveToFirst()) it.getString(0)?.trim() else defaultValue
        }
    }

    fun getAllSettings(): Map<String, String> {
        val settings = mutableMapOf<String, String>()
        
        try {
            readableDatabase.query(
                TABLE_SETTINGS, 
                arrayOf("key", "value"),
                null, null, null, null, null
            ).use { cursor ->
                val keyIdx = cursor.getColumnIndexOrThrow("key")
                val valIdx = cursor.getColumnIndexOrThrow("value")

                while (cursor.moveToNext()) {
                    val key = cursor.getString(keyIdx)
                    val value = cursor.getString(valIdx)
                    if (key != null && value != null) {
                        settings[key] = value
                    }
                }
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Error loading settings", e)
        }
        
        return settings
    }


    /**
     * Returns distinct dates (YYYY-MM-DD) that have location data within the range.
     * Used by the calendar view to show activity dots.
     */
    fun getDaysWithData(startTimestamp: Long, endTimestamp: Long): List<String> {
        val days = mutableListOf<String>()
        try {
            readableDatabase.rawQuery(
                """
                SELECT DISTINCT strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime') as day
                FROM $TABLE_LOCATIONS
                WHERE timestamp >= ? AND timestamp <= ?
                ORDER BY day ASC
                """.trimIndent(),
                arrayOf(startTimestamp.toString(), endTimestamp.toString())
            ).use { cursor ->
                while (cursor.moveToNext()) {
                    days.add(cursor.getString(0))
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting days with data", e)
        }
        return days
    }

    /**
     * Returns per-day aggregated stats for a date range in a single query.
     * Computes distance (haversine) and trip count (15-min gap threshold) inline
     * to avoid nested cursors.
     */
    fun getDailyStats(startTimestamp: Long, endTimestamp: Long): List<Map<String, Any>> {
        val stats = mutableListOf<Map<String, Any>>()
        try {
            readableDatabase.rawQuery(
                """
                SELECT
                    strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime') as day,
                    latitude, longitude, timestamp
                FROM $TABLE_LOCATIONS
                WHERE timestamp >= ? AND timestamp <= ?
                ORDER BY day ASC, timestamp ASC
                """.trimIndent(),
                arrayOf(startTimestamp.toString(), endTimestamp.toString())
            ).use { cursor ->
                var currentDay: String? = null
                var count = 0
                var startTime = 0L
                var endTime = 0L
                var distance = 0.0
                var tripCount = 0
                var segmentSize = 0
                var prevLat = 0.0
                var prevLon = 0.0
                var prevTs = 0L

                fun emitDay() {
                    if (currentDay != null) {
                        stats.add(mapOf(
                            "day" to currentDay!!,
                            "count" to count,
                            "startTime" to startTime,
                            "endTime" to endTime,
                            "distanceMeters" to distance,
                            "tripCount" to tripCount
                        ))
                    }
                }

                while (cursor.moveToNext()) {
                    val day = cursor.getString(0)
                    val lat = cursor.getDouble(1)
                    val lon = cursor.getDouble(2)
                    val ts = cursor.getLong(3)

                    if (day != currentDay) {
                        emitDay()
                        currentDay = day
                        count = 1
                        startTime = ts
                        endTime = ts
                        distance = 0.0
                        tripCount = 0
                        segmentSize = 1
                        prevLat = lat
                        prevLon = lon
                        prevTs = ts
                    } else {
                        count++
                        endTime = ts
                        if (ts - prevTs >= TRIP_GAP_SECONDS) {
                            segmentSize = 1
                        } else {
                            segmentSize++
                            if (segmentSize == 2) tripCount++
                            distance += haversineDistance(prevLat, prevLon, lat, lon)
                        }
                    }
                    prevLat = lat
                    prevLon = lon
                    prevTs = ts
                }
                emitDay()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting daily stats", e)
        }
        return stats
    }

    internal fun haversineDistance(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371000.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2)
        return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }

    private fun getTodayStartTimestamp(): Long {
        return Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis / 1000 // convert to seconds
    }

}

/**
 * Data container for queued location records.
 */
data class QueuedLocation(
    val queueId: Long,
    val locationId: Long,
    val payload: String,
    val retryCount: Int
)