/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.data

import android.content.ContentValues
import android.database.Cursor
import com.Colota.util.AppLogger
import com.Colota.util.geo.haversineDistance
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.os.Build
import java.time.LocalDate
import java.time.ZoneId
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
        const val DATABASE_NAME = "Colota.db"
        const val DATABASE_VERSION = 6

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

        private const val CREATE_PROFILES_TABLE = """
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
                activation_delay_seconds INTEGER NOT NULL DEFAULT 0,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at INTEGER NOT NULL
            )
        """
        // Profiles table as introduced in v2, before activation_delay_seconds (added by the v6
        // migration). Frozen on purpose: the < 2 migration must create this older shape so the v6
        // ALTER adds the column without colliding. onCreate uses the latest CREATE_PROFILES_TABLE.
        private const val CREATE_PROFILES_TABLE_V2 = """
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
        """
        private const val CREATE_PROFILES_INDEX =
            "CREATE INDEX IF NOT EXISTS idx_profiles_enabled ON $TABLE_PROFILES(enabled, priority DESC)"

        @Volatile
        private var INSTANCE: DatabaseHelper? = null

        // Set true while a restore is replacing the DB; JS-bridge writers must short-circuit
        // so a write doesn't race the file swap. Cleared by BackupServiceModule in its finally.
        @Volatile
        private var restoreInProgress: Boolean = false

        @JvmStatic
        fun setRestoreInProgress(value: Boolean) {
            restoreInProgress = value
        }

        // Drain the WAL into main, then best-effort delete sidecars before the rename. SQLite's
        // WAL salt+checksum makes replay unlikely, but stale sidecars next to the new DB are untidy.
        @JvmStatic
        fun replaceLiveDatabase(context: Context, newDb: java.io.File) {
            synchronized(this) {
                INSTANCE?.close()
                INSTANCE = null

                val target = context.applicationContext.getDatabasePath(DATABASE_NAME)
                target.parentFile?.mkdirs()

                drainLiveWal(target)

                bestEffortDelete(java.io.File("${target.absolutePath}-wal"))
                bestEffortDelete(java.io.File("${target.absolutePath}-shm"))
                bestEffortDelete(java.io.File("${target.absolutePath}-journal"))

                val staging = java.io.File(target.parentFile, "${DATABASE_NAME}.incoming")
                try {
                    try {
                        java.nio.file.Files.move(
                            newDb.toPath(),
                            target.toPath(),
                            java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                            java.nio.file.StandardCopyOption.ATOMIC_MOVE,
                        )
                    } catch (_: java.nio.file.AtomicMoveNotSupportedException) {
                        newDb.inputStream().use { input ->
                            staging.outputStream().use { input.copyTo(it) }
                        }
                        java.nio.file.Files.move(
                            staging.toPath(),
                            target.toPath(),
                            java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                            java.nio.file.StandardCopyOption.ATOMIC_MOVE,
                        )
                        newDb.delete()
                    }
                } finally {
                    if (staging.exists()) staging.delete()
                }
            }
        }

        // Sidecar deletes are non-critical; SQLite recovers fine without them. A SecurityException
        // from a sandbox-restricted FS shouldn't abort the whole swap.
        private fun bestEffortDelete(file: java.io.File) {
            try {
                file.delete()
            } catch (e: SecurityException) {
                AppLogger.w(TAG, "Could not delete ${file.name}: ${e.message}")
            }
        }

        // Truncating checkpoint moves uncheckpointed WAL pages into main before sidecar delete.
        private fun drainLiveWal(target: java.io.File) {
            if (!target.exists()) return
            try {
                val db = SQLiteDatabase.openDatabase(
                    target.absolutePath,
                    null,
                    SQLiteDatabase.OPEN_READWRITE,
                )
                try {
                    db.rawQuery("PRAGMA wal_checkpoint(TRUNCATE)", null).use { it.moveToFirst() }
                } finally {
                    db.close()
                }
            } catch (e: Exception) {
                AppLogger.w(TAG, "Could not drain WAL before replace: ${e.message}")
            }
        }

        // Run before the swap so a migration failure leaves the live DB untouched.
        @JvmStatic
        fun migrateCandidate(candidateFile: java.io.File) {
            val db = SQLiteDatabase.openDatabase(
                candidateFile.absolutePath,
                null,
                SQLiteDatabase.OPEN_READWRITE,
            )
            try {
                // DELETE mode: migration writes go straight to main, not a -wal that the rename ignores.
                db.rawQuery("PRAGMA journal_mode=DELETE", null).use { it.moveToFirst() }

                val current = db.version
                if (current > DATABASE_VERSION) {
                    throw IllegalStateException(
                        "Candidate schema $current is newer than app schema $DATABASE_VERSION"
                    )
                }
                if (current < DATABASE_VERSION) {
                    db.beginTransaction()
                    try {
                        applyMigrations(db, current, DATABASE_VERSION)
                        db.version = DATABASE_VERSION
                        db.setTransactionSuccessful()
                    } finally {
                        db.endTransaction()
                    }
                }
            } finally {
                db.close()
            }
        }

        private fun applyMigrations(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
            AppLogger.i(TAG, "Migrating database from v$oldVersion to v$newVersion")
            if (oldVersion < 2) {
                db.execSQL(CREATE_PROFILES_TABLE_V2)
                db.execSQL(CREATE_PROFILES_INDEX)
            }
            if (oldVersion < 3) {
                db.execSQL("ALTER TABLE $TABLE_LOCATIONS ADD COLUMN sent INTEGER NOT NULL DEFAULT 0")
                db.execSQL("""
                    UPDATE $TABLE_LOCATIONS SET sent = 1
                    WHERE NOT EXISTS (
                        SELECT 1 FROM $TABLE_QUEUE
                        WHERE $TABLE_QUEUE.location_id = $TABLE_LOCATIONS.id
                    )
                """.trimIndent())
            }
            if (oldVersion < 4) {
                db.execSQL("ALTER TABLE $TABLE_GEOFENCES ADD COLUMN pause_on_wifi INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE $TABLE_GEOFENCES ADD COLUMN pause_on_motionless INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE $TABLE_GEOFENCES ADD COLUMN motionless_timeout_minutes INTEGER NOT NULL DEFAULT 10")
            }
            if (oldVersion < 5) {
                db.execSQL("ALTER TABLE $TABLE_GEOFENCES ADD COLUMN heartbeat_enabled INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE $TABLE_GEOFENCES ADD COLUMN heartbeat_interval_minutes INTEGER NOT NULL DEFAULT 15")
            }
            if (oldVersion < 6) {
                db.execSQL("ALTER TABLE $TABLE_PROFILES ADD COLUMN activation_delay_seconds INTEGER NOT NULL DEFAULT 0")
                // Stationary profiles existed before this column with a fixed 60s detection window;
                // backfill that value so they keep behaving the same now that it is a stored field.
                db.execSQL("UPDATE $TABLE_PROFILES SET activation_delay_seconds = 60 WHERE condition_type = 'stationary'")
                db.execSQL("ALTER TABLE $TABLE_LOCATIONS ADD COLUMN note TEXT")
            }
        }

        @JvmStatic
        fun getInstance(context: Context): DatabaseHelper {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: DatabaseHelper(context.applicationContext).also {
                    INSTANCE = it
                }
            }
        }
    }

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
                sent INTEGER NOT NULL DEFAULT 0,
                note TEXT,
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
                pause_on_wifi INTEGER DEFAULT 0,
                pause_on_motionless INTEGER DEFAULT 0,
                motionless_timeout_minutes INTEGER DEFAULT 10,
                heartbeat_enabled INTEGER DEFAULT 0,
                heartbeat_interval_minutes INTEGER DEFAULT 15,
                notify_enter INTEGER DEFAULT 0,
                notify_exit INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL
            )
        """)

        db.execSQL(CREATE_PROFILES_TABLE)

        db.execSQL("CREATE INDEX idx_queue_created ON $TABLE_QUEUE(created_at)")
        db.execSQL("CREATE INDEX idx_queue_location ON $TABLE_QUEUE(location_id)")
        db.execSQL("CREATE INDEX idx_locations_timestamp ON $TABLE_LOCATIONS(timestamp DESC)")
        db.execSQL("CREATE INDEX idx_locations_created ON $TABLE_LOCATIONS(created_at DESC)")
        db.execSQL("CREATE INDEX idx_geofences_enabled ON $TABLE_GEOFENCES(enabled, pause_tracking)")
        db.execSQL(CREATE_PROFILES_INDEX)
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
            "retryInterval" to "30",
            "isOfflineMode" to "false",
            "syncCondition" to "any",
            "syncSsid" to "",
            "customFields" to "[]",
            "hasCompletedSetup" to "false",
            SettingsKeys.TRACKING_ENABLED to "false",
            "apiTemplate" to "custom",
            "syncPreset" to "instant",
            "httpMethod" to "POST",
            "dawarichMode" to "single",
            "overlandBatchSize" to "50"
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
        applyMigrations(db, oldVersion, newVersion)
    }

    override fun onOpen(db: SQLiteDatabase) {
        super.onOpen(db)
        if (!db.isReadOnly) {
            db.execSQL("PRAGMA synchronous = NORMAL") // faster writes, safe with WAL
            db.execSQL("PRAGMA foreign_keys = ON")
        }
    }


    // Writers that race the restore swap can land on the orphaned (pre-rename) inode and lose data.
    private fun requireNotRestoring() {
        if (restoreInProgress) {
            throw IllegalStateException("Database is being restored; try again in a moment")
        }
    }

    // Single-transaction bulk insert for imports. Rows go in with sent=1 (skip the queue)
    // by default; pass non-null payloads to also enqueue them with sent=0.
    fun bulkInsertImportedLocations(
        rows: List<com.Colota.importer.ImportRow>,
        payloads: List<String>? = null,
    ): Int {
        requireNotRestoring()
        if (rows.isEmpty()) return 0
        require(payloads == null || payloads.size == rows.size) {
            "payloads length (${payloads?.size}) must match rows length (${rows.size})"
        }
        val db = writableDatabase
        val locationSql = """
            INSERT INTO $TABLE_LOCATIONS
            (latitude, longitude, accuracy, altitude, speed, bearing, battery, timestamp, sent, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """.trimIndent()
        val queueSql = """
            INSERT INTO $TABLE_QUEUE
            (location_id, payload, retry_count, created_at)
            VALUES (?, ?, 0, ?)
        """.trimIndent()
        val sentFlag: Long = if (payloads == null) 1L else 0L
        val nowSec = System.currentTimeMillis() / 1000
        var inserted = 0
        db.beginTransaction()
        try {
            val locationStmt = db.compileStatement(locationSql)
            val queueStmt = if (payloads != null) db.compileStatement(queueSql) else null
            try {
                for ((i, row) in rows.withIndex()) {
                    locationStmt.clearBindings()
                    locationStmt.bindDouble(1, row.latitude)
                    locationStmt.bindDouble(2, row.longitude)
                    if (row.accuracy != null) locationStmt.bindLong(3, row.accuracy.toLong()) else locationStmt.bindNull(3)
                    if (row.altitude != null) locationStmt.bindLong(4, row.altitude.toLong()) else locationStmt.bindNull(4)
                    if (row.speed != null) locationStmt.bindLong(5, row.speed.toLong()) else locationStmt.bindNull(5)
                    if (row.bearing != null) locationStmt.bindDouble(6, row.bearing) else locationStmt.bindNull(6)
                    if (row.battery != null) locationStmt.bindLong(7, row.battery.toLong()) else locationStmt.bindNull(7)
                    locationStmt.bindLong(8, row.timestamp)
                    locationStmt.bindLong(9, sentFlag)
                    locationStmt.bindLong(10, nowSec)
                    val locationId = locationStmt.executeInsert()
                    if (locationId == -1L) continue
                    inserted++
                    if (queueStmt != null && payloads != null) {
                        queueStmt.clearBindings()
                        queueStmt.bindLong(1, locationId)
                        queueStmt.bindString(2, payloads[i])
                        queueStmt.bindLong(3, nowSec)
                        queueStmt.executeInsert()
                    }
                }
            } finally {
                locationStmt.close()
                queueStmt?.close()
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        return inserted
    }

    // ASC-sorted stream of (ts, lat, lon) triples for merge-walk dedup. Memory stays
    // O(1) because the caller never materialises the existing-key set.
    fun forEachLocationKeyInRange(
        startTs: Long,
        endTs: Long,
        consumer: (Long, Double, Double) -> Unit,
    ) {
        readableDatabase.query(
            TABLE_LOCATIONS,
            arrayOf("timestamp", "latitude", "longitude"),
            "timestamp >= ? AND timestamp <= ?",
            arrayOf(startTs.toString(), endTs.toString()),
            null, null,
            "timestamp ASC, latitude ASC, longitude ASC",
        ).use { cursor ->
            while (cursor.moveToNext()) {
                consumer(cursor.getLong(0), cursor.getDouble(1), cursor.getDouble(2))
            }
        }
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
        requireNotRestoring()
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

    private fun Cursor.toMapList(): List<Map<String, Any?>> = buildList {
        val columns = columnNames
        while (moveToNext()) {
            add(buildMap {
                for (col in columns) {
                    val idx = getColumnIndex(col)
                    if (idx != -1) {
                        put(col, when (getType(idx)) {
                            Cursor.FIELD_TYPE_INTEGER -> getLong(idx)
                            Cursor.FIELD_TYPE_FLOAT -> getDouble(idx)
                            Cursor.FIELD_TYPE_STRING -> getString(idx)
                            else -> null
                        })
                    }
                }
            })
        }
    }

    fun getTableData(tableName: String, limit: Int, offset: Int): List<Map<String, Any?>> {
        require(tableName in ALLOWED_TABLES) { "Invalid table name: $tableName" }

        val orderBy = when(tableName) {
            TABLE_LOCATIONS -> "timestamp DESC"
            TABLE_QUEUE -> "created_at DESC"
            TABLE_GEOFENCES -> "created_at DESC"
            else -> "ROWID DESC"
        }

        return try {
            readableDatabase.query(
                tableName, null, null, null, null, null,
                orderBy, "$limit OFFSET $offset"
            ).use { it.toMapList() }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Error reading table $tableName", e)
            emptyList()
        }
    }

    /**
     * Returns all locations ordered chronologically (ASC) with pagination.
     * Used for export operations where chronological order is required.
     */
    fun getLocationsChronological(limit: Int, offset: Int): List<Map<String, Any?>> {
        return try {
            readableDatabase.query(
                TABLE_LOCATIONS, null, null, null, null, null,
                "timestamp ASC, id ASC", "$limit OFFSET $offset"
            ).use { it.toMapList() }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Error reading locations chronologically", e)
            emptyList()
        }
    }

    /**
     * Retrieves locations within a date range, ordered chronologically.
     * Used for rendering track polylines on the map view.
     *
     * @param startTimestamp Start of range (Unix seconds, inclusive)
     * @param endTimestamp End of range (Unix seconds, inclusive)
     * @return Locations ordered by timestamp ASC for polyline drawing
     */
    fun getLocationsByDateRange(
        startTimestamp: Long,
        endTimestamp: Long,
        limit: Int = 0,
        offset: Int = 0
    ): List<Map<String, Any?>> {
        return try {
            readableDatabase.query(
                TABLE_LOCATIONS, null,
                "timestamp >= ? AND timestamp <= ?",
                arrayOf(startTimestamp.toString(), endTimestamp.toString()),
                null, null,
                "timestamp ASC, id ASC",
                if (limit > 0) "$limit OFFSET $offset" else null
            ).use { it.toMapList() }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Error reading locations by date range", e)
            emptyList()
        }
    }


    /**
    * Adds location to transmission queue.
    * @return The queue ID of the inserted row
    */
    fun addToQueue(locationId: Long, payload: String): Long {
        requireNotRestoring()
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
            "retry_count ASC, created_at ASC",
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
        requireNotRestoring()
        return writableDatabase.delete(
            TABLE_QUEUE,
            "location_id = ?",
            arrayOf(locationId.toString())
        )
    }

    fun removeBatchFromQueue(queueIds: List<Long>) {
        requireNotRestoring()
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
        requireNotRestoring()
        if (locationIds.isEmpty()) return
        val placeholders = locationIds.joinToString(",") { "?" }
        val args = locationIds.map { it.toString() }.toTypedArray()
        writableDatabase.delete(TABLE_LOCATIONS, "id IN ($placeholders)", args)
    }

    /** Sets or clears the free-text note on a single location. Pass null to clear. */
    fun updateLocationNote(id: Long, note: String?) {
        requireNotRestoring()
        val values = ContentValues().apply { put("note", note) }
        writableDatabase.update(TABLE_LOCATIONS, values, "id = ?", arrayOf(id.toString()))
    }

    fun incrementRetryCount(queueId: Long, error: String? = null) {
        requireNotRestoring()
        writableDatabase.execSQL(
            "UPDATE $TABLE_QUEUE SET retry_count = retry_count + 1, last_error = ? WHERE id = ?",
            arrayOf<Any>(error ?: "", queueId)
        )
    }


    data class Stats(val queued: Int, val sent: Int, val total: Int, val today: Int)

    fun getStats(): Stats {
        val query = """
            SELECT
                (SELECT COUNT(*) FROM $TABLE_QUEUE) as queued,
                (SELECT COUNT(*) FROM $TABLE_LOCATIONS WHERE sent = 1) as sent,
                (SELECT COUNT(*) FROM $TABLE_LOCATIONS) as total,
                (SELECT COUNT(*) FROM $TABLE_LOCATIONS WHERE timestamp >= ?) as today
        """.trimIndent()

        val todayStart = getTodayStartTimestamp()

        return readableDatabase.rawQuery(query, arrayOf(todayStart.toString())).use { cursor ->
            if (cursor.moveToFirst()) {
                Stats(
                    queued = cursor.getInt(0),
                    sent = cursor.getInt(1),
                    total = cursor.getInt(2),
                    today = cursor.getInt(3)
                )
            } else {
                Stats(0, 0, 0, 0)
            }
        }
    }

    fun markLocationsSent(locationIds: List<Long>) {
        requireNotRestoring()
        if (locationIds.isEmpty()) return
        val placeholders = locationIds.joinToString(",") { "?" }
        val args = locationIds.map { it.toString() }.toTypedArray()
        writableDatabase.execSQL(
            "UPDATE $TABLE_LOCATIONS SET sent = 1 WHERE id IN ($placeholders)",
            args
        )
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

    fun snapshotTo(destFile: java.io.File) {
        requireNotRestoring()
        val db = writableDatabase
        val srcPath = db.path ?: throw IllegalStateException("Database path is null")

        // VACUUM INTO is transactional even under concurrent writers (SQLite 3.27+, API 30+).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            db.execSQL("VACUUM INTO ?", arrayOf(destFile.absolutePath))
            return
        }

        // API 26-29 fallback: hold an IMMEDIATE write lock around the checkpoint + copy.
        // beginTransactionNonExclusive maps to BEGIN IMMEDIATE in Android's SQLite,
        // so other writers must queue at the file lock, preventing -wal appends from
        // tearing the main-file copy. Readers continue via WAL snapshots.
        db.beginTransactionNonExclusive()
        try {
            db.rawQuery("PRAGMA wal_checkpoint(TRUNCATE)", null).use { it.moveToFirst() }
            java.io.File(srcPath).inputStream().use { input ->
                destFile.outputStream().use { output ->
                    input.copyTo(output)
                }
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }


    fun clearSentHistory(): Int {
        requireNotRestoring()
        AppLogger.d(TAG, "Clearing sent history")
        return writableDatabase.delete(
            TABLE_LOCATIONS,
            "sent = 1",
            null
        )
    }

    fun clearQueue(): Int {
        requireNotRestoring()
        AppLogger.d(TAG, "Clearing queue")
        // Deleting locations cascades to their queue entries via FK ON DELETE CASCADE
        return writableDatabase.delete(
            TABLE_LOCATIONS,
            "id IN (SELECT location_id FROM $TABLE_QUEUE)",
            null
        )
    }

    fun clearAllLocations(): Int {
        requireNotRestoring()
        writableDatabase.delete(TABLE_QUEUE, null, null) // FK constraint: queue references locations
        return writableDatabase.delete(TABLE_LOCATIONS, null, null)
    }

    fun deleteOlderThan(days: Int): Int {
        requireNotRestoring()
        val cutoff = (System.currentTimeMillis() - days.toLong() * 24 * 60 * 60 * 1000) / 1000
        return writableDatabase.delete(TABLE_LOCATIONS, "timestamp < ?", arrayOf(cutoff.toString()))
    }

    fun deleteInRange(startTs: Long, endTs: Long): Int {
        requireNotRestoring()
        return writableDatabase.delete(
            TABLE_LOCATIONS,
            "timestamp >= ? AND timestamp <= ?",
            arrayOf(startTs.toString(), endTs.toString())
        )
    }

    /** Single-transaction multi-range delete. All ranges succeed or none do. */
    fun deleteInRanges(ranges: List<Pair<Long, Long>>): Int {
        requireNotRestoring()
        if (ranges.isEmpty()) return 0
        val db = writableDatabase
        var total = 0
        db.beginTransaction()
        try {
            for ((startTs, endTs) in ranges) {
                total += db.delete(
                    TABLE_LOCATIONS,
                    "timestamp >= ? AND timestamp <= ?",
                    arrayOf(startTs.toString(), endTs.toString())
                )
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        return total
    }

    /** Reclaims unused space. Call from background thread only. */
    fun vacuum() {
        requireNotRestoring()
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
        requireNotRestoring()
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
            AppLogger.e(TAG, "Error getting days with data", e)
        }
        return days
    }

    /**
     * Returns date strings (YYYY-MM-DD) in the range with at least one annotated
     * location (non-empty note). Used by the calendar to flag days that have notes.
     */
    fun getDaysWithNotes(startTimestamp: Long, endTimestamp: Long): List<String> {
        val days = mutableListOf<String>()
        try {
            readableDatabase.rawQuery(
                """
                SELECT DISTINCT strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime') as day
                FROM $TABLE_LOCATIONS
                WHERE timestamp >= ? AND timestamp <= ? AND note IS NOT NULL AND note != ''
                ORDER BY day ASC
                """.trimIndent(),
                arrayOf(startTimestamp.toString(), endTimestamp.toString())
            ).use { cursor ->
                while (cursor.moveToNext()) {
                    days.add(cursor.getString(0))
                }
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Error getting days with notes", e)
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
                ORDER BY day ASC, timestamp ASC, id ASC
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
            AppLogger.e(TAG, "Error getting daily stats", e)
        }
        return stats
    }

    private fun getTodayStartTimestamp(): Long =
        LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toEpochSecond()

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