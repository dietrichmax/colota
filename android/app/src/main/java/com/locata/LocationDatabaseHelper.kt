/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.database.sqlite.SQLiteStatement
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.*
import org.json.JSONObject

/**
 * SQLite database helper for Colota location tracking.
 *
 * Optimized for:
 * - No cursor leaks (proper resource management)
 * - Efficient batch operations
 * - Prepared statements for security & speed
 * - Strategic indexing for query performance
 * - Async VACUUM to prevent UI blocking
 *
 * @param context The Android [Context] used to open or create the database.
 */
class LocationDatabaseHelper private constructor(context: Context) :
    SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        private const val DATABASE_NAME = "Colota.db"
        private const val DATABASE_VERSION = 1

        const val TABLE_LOCATIONS = "locations"
        const val TABLE_QUEUE = "queue"
        const val TABLE_SETTINGS = "settings"
        const val TABLE_GEOFENCES = "geofences"

        private val DEFAULT_FIELD_MAP = mapOf(
            "lat" to "lat", "lon" to "lon", "acc" to "acc",
            "alt" to "alt", "vel" to "vel", "batt" to "batt",
            "bs" to "bs", "tst" to "tst", "bear" to "bear"
        )

        private const val TAG = "LocationDB"

        @Volatile
        private var INSTANCE: LocationDatabaseHelper? = null

        /**
         * Returns the singleton instance of the [LocationDatabaseHelper].
         * Using the Application Context prevents memory leaks.
         */
        @JvmStatic
        fun getInstance(context: Context): LocationDatabaseHelper {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: LocationDatabaseHelper(context.applicationContext).also {
                    INSTANCE = it
                }
            }
        }
    }

    // Cached prepared statements for better performance
    private var incrementRetryStmt: SQLiteStatement? = null

    /**
     * Called when the database is created for the first time.
     * Creates schema with optimized indexes.
     */
    override fun onCreate(db: SQLiteDatabase) {
        // Create Locations Table
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

        // Create Queue Table with Foreign Key
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

        // Create Settings Table
        db.execSQL("""
            CREATE TABLE $TABLE_SETTINGS (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)

        // Create Geofences Table
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

        // Optimized indexes
        db.execSQL("CREATE INDEX idx_queue_created ON $TABLE_QUEUE(created_at)")
        db.execSQL("CREATE INDEX idx_queue_location ON $TABLE_QUEUE(location_id)")
        db.execSQL("CREATE INDEX idx_locations_timestamp ON $TABLE_LOCATIONS(timestamp DESC)")
        db.execSQL("CREATE INDEX idx_locations_created ON $TABLE_LOCATIONS(created_at DESC)")
        db.execSQL("CREATE INDEX idx_geofences_enabled ON $TABLE_GEOFENCES(enabled, pause_tracking)")
        db.execSQL("CREATE INDEX idx_queue_retry ON $TABLE_QUEUE(retry_count)")

        prepopulateSettings(db)
    }

    /**
     * Seeds settings with default values.
     */
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
            "isOfflineMode" to "false"
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
            Log.e(TAG, "Error prepopulating settings", e)
        } finally {
            db.endTransaction()
        }
    }

    /**
     * Configures database connection.
     */
    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.enableWriteAheadLogging()
        
        // Close cursor after PRAGMA query
        db.rawQuery("PRAGMA busy_timeout = 5000", null).use { it.moveToFirst() }
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE_QUEUE")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_LOCATIONS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_SETTINGS")
        db.execSQL("DROP TABLE IF EXISTS $TABLE_GEOFENCES")
        onCreate(db)
    }

    /**
     * Finalizes database settings after opening.
     */
    override fun onOpen(db: SQLiteDatabase) {
        super.onOpen(db)
        if (!db.isReadOnly) {
            db.execSQL("PRAGMA synchronous = NORMAL")
            db.execSQL("PRAGMA foreign_keys = ON")
        }
        
        // Prepare cached statements
        incrementRetryStmt = db.compileStatement(
            "UPDATE $TABLE_QUEUE SET retry_count = retry_count + 1, last_error = ? WHERE id = ?"
        )
    }

    override fun close() {
        incrementRetryStmt?.close()
        incrementRetryStmt = null
        super.close()
    }

    // ========================== LOCATION OPERATIONS ==========================

    /**
     * Persists a new location coordinate and metadata.
     */
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
            put("created_at", System.currentTimeMillis())
        }
        return writableDatabase.insert(TABLE_LOCATIONS, null, values)
    }

    /**
     * Retrieves the most recent location.
     */
    fun getRawMostRecentLocation(): Map<String, Any?>? {
        val query = """
            SELECT latitude, longitude, accuracy, timestamp 
            FROM (
                SELECT latitude, longitude, accuracy, timestamp FROM $TABLE_LOCATIONS
                UNION ALL
                SELECT l.latitude, l.longitude, l.accuracy, l.timestamp 
                FROM $TABLE_QUEUE q
                JOIN $TABLE_LOCATIONS l ON q.location_id = l.id
            ) ORDER BY timestamp DESC LIMIT 1
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
            Log.e(TAG, "Query failed", e)
            null
        }
    }

    /**
     * Universal table data getter for debugging.
     */
    fun getTableData(tableName: String, limit: Int, offset: Int): List<Map<String, Any?>> {
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
            Log.e(TAG, "Error reading table $tableName", e)
        }
        
        return data
    }

    // ========================== QUEUE OPERATIONS ==========================

    /**
    * Adds location to transmission queue.
    * @return The queue ID of the inserted row
    */
    fun addToQueue(locationId: Long, payload: String): Long {
        val values = ContentValues().apply {
            put("location_id", locationId)
            put("payload", payload)
            put("retry_count", 0)
            put("created_at", System.currentTimeMillis())
        }
        return writableDatabase.insert(TABLE_QUEUE, null, values)
    }

    /**
     * Retrieves queued locations for batch sync.
     */
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

    /**
     * Removes queue entry by location ID.
     */
    fun removeFromQueueByLocationId(locationId: Long): Int {
        return writableDatabase.delete(
            TABLE_QUEUE,
            "location_id = ?",
            arrayOf(locationId.toString())
        )
    }

    /**
     * Batch delete using single query with IN clause.
     */
    fun removeBatchFromQueue(queueIds: List<Long>) {
        if (queueIds.isEmpty()) return
        
        val placeholders = queueIds.joinToString(",") { "?" }
        val args = queueIds.map { it.toString() }.toTypedArray()
        
        val deleted = writableDatabase.delete(
            TABLE_QUEUE,
            "id IN ($placeholders)",
            args
        )
        
        if (BuildConfig.DEBUG && deleted > 0) {
            Log.d(TAG, "Batch deleted $deleted queue items")
        }
    }

    /**
     * Uses prepared statement for better performance.
     * Thread-safe with synchronized access.
     */
    @Synchronized
    fun incrementRetryCount(queueId: Long, error: String? = null) {
        incrementRetryStmt?.let { stmt ->
            stmt.clearBindings()
            stmt.bindString(1, error ?: "")
            stmt.bindLong(2, queueId)
            stmt.executeUpdateDelete()
        }
    }

    // ========================== STATS OPERATIONS ==========================

    /**
     * Combined stats query
     */
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

    /** Individual stat methods for backward compatibility */
    fun getQueuedCount(): Int {
        return readableDatabase.rawQuery("SELECT COUNT(*) FROM $TABLE_QUEUE", null).use {
            if (it.moveToFirst()) it.getInt(0) else 0
        }
    }

    fun getSentCount(): Int = getTotalCount() - getQueuedCount()

    fun getTotalCount(): Int {
        return readableDatabase.rawQuery("SELECT COUNT(*) FROM $TABLE_LOCATIONS", null).use {
            if (it.moveToFirst()) it.getInt(0) else 0
        }
    }

    fun getTodayCount(): Int {
        val todayStart = getTodayStartTimestamp()
        return readableDatabase.rawQuery(
            "SELECT COUNT(*) FROM $TABLE_LOCATIONS WHERE timestamp >= ?",
            arrayOf(todayStart.toString())
        ).use {
            if (it.moveToFirst()) it.getInt(0) else 0
        }
    }

    fun getDatabaseSizeMB(): Double {
        val dbPath = readableDatabase.path ?: return 0.0
        return java.io.File(dbPath).length() / (1024.0 * 1024.0)
    }

    // ========================== CLEANUP OPERATIONS ==========================

    /**
     * Purges synchronized history records.
     */
    fun clearSentHistory(): Int {
        return writableDatabase.delete(
            TABLE_LOCATIONS,
            "id NOT IN (SELECT location_id FROM $TABLE_QUEUE)",
            null
        )
    }

    fun clearQueue(): Int {
        return writableDatabase.delete(TABLE_QUEUE, null, null)
    }

    fun clearAllLocations(): Int {
        writableDatabase.delete(TABLE_QUEUE, null, null)
        return writableDatabase.delete(TABLE_LOCATIONS, null, null)
    }

    fun deleteOlderThan(days: Int): Int {
        val cutoff = System.currentTimeMillis() - days * 24 * 60 * 60 * 1000L
        return writableDatabase.delete(
            TABLE_LOCATIONS, 
            "timestamp < ?", 
            arrayOf(cutoff.toString())
        )
    }

    /**
     * Synchronous vacuum for backward compatibility.
     *  Can block UI for seconds. Use vacuumAsync() instead.
     */
    fun vacuum() {
        writableDatabase.execSQL("VACUUM")
        writableDatabase.execSQL("ANALYZE")
    }

    // ========================== SETTINGS OPERATIONS ==========================

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
            Log.e(TAG, "Error loading settings", e)
        }
        
        return settings
    }

    // ========================== HELPER METHODS ==========================

    private fun getTodayStartTimestamp(): Long {
        return Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.timeInMillis
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