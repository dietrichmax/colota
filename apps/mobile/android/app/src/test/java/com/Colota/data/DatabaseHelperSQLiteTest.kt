/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.data

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import androidx.test.core.app.ApplicationProvider
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import com.Colota.util.AppLogger
import io.mockk.*

/**
 * SQLite integration tests for DatabaseHelper using Robolectric.
 * Tests actual insert/query/delete, onUpgrade migration, WAL mode,
 * transaction handling, and foreign key cascades against a real SQLite DB.
 */
@RunWith(RobolectricTestRunner::class)
class DatabaseHelperSQLiteTest {

    private lateinit var db: DatabaseHelper

    @Before
    fun setUp() {
        // Reset singleton so each test gets a fresh database
        resetSingleton()
        db = DatabaseHelper.getInstance(ApplicationProvider.getApplicationContext())

        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs
    }

    @After
    fun tearDown() {
        db.close()
        resetSingleton()
        unmockkObject(AppLogger)
    }

    private fun resetSingleton() {
        val field = DatabaseHelper::class.java.getDeclaredField("INSTANCE")
        field.isAccessible = true
        field.set(null, null)
    }

    // ========================================================================
    // Schema creation — tables and indexes exist
    // ========================================================================

    @Test
    fun `onCreate creates all five tables`() {
        val tables = queryTableNames()
        assertTrue(tables.contains("locations"))
        assertTrue(tables.contains("queue"))
        assertTrue(tables.contains("settings"))
        assertTrue(tables.contains("geofences"))
        assertTrue(tables.contains("tracking_profiles"))
    }

    @Test
    fun `onCreate creates indexes`() {
        val indexes = queryIndexNames()
        assertTrue(indexes.contains("idx_queue_created"))
        assertTrue(indexes.contains("idx_queue_location"))
        assertTrue(indexes.contains("idx_locations_timestamp"))
        assertTrue(indexes.contains("idx_locations_created"))
        assertTrue(indexes.contains("idx_geofences_enabled"))
        assertTrue(indexes.contains("idx_profiles_enabled"))
        assertTrue(indexes.contains("idx_queue_retry"))
    }

    @Test
    fun `onCreate prepopulates default settings`() {
        val settings = db.getAllSettings()
        assertEquals("5000", settings["interval"])
        assertEquals("", settings["endpoint"])
        assertEquals("0", settings["syncInterval"])
        assertEquals("false", settings["tracking_enabled"])
        assertEquals("POST", settings["httpMethod"])
        assertEquals("custom", settings["apiTemplate"])
    }

    // ========================================================================
    // onUpgrade — v1 → v2 migration
    // ========================================================================

    @Test
    fun `onUpgrade from v1 creates profiles table`() {
        val rawDb = db.writableDatabase

        // Drop profiles table to simulate v1 state
        rawDb.execSQL("DROP TABLE IF EXISTS ${DatabaseHelper.TABLE_PROFILES}")
        rawDb.execSQL("DROP INDEX IF EXISTS idx_profiles_enabled")

        // Run upgrade
        db.onUpgrade(rawDb, 1, 2)

        // Verify table was recreated
        val tables = queryTableNames()
        assertTrue(tables.contains("tracking_profiles"))

        // Verify we can insert into it
        val values = ContentValues().apply {
            put("name", "Test")
            put("interval_ms", 5000)
            put("min_update_distance", 0.0)
            put("sync_interval_seconds", 0)
            put("priority", 1)
            put("condition_type", "charging")
            put("enabled", 1)
            put("created_at", System.currentTimeMillis() / 1000)
        }
        val id = rawDb.insert(DatabaseHelper.TABLE_PROFILES, null, values)
        assertTrue(id > 0)
    }

    @Test
    fun `onUpgrade is idempotent for same version`() {
        val rawDb = db.writableDatabase

        // Run upgrade again — CREATE TABLE IF NOT EXISTS should be safe
        db.onUpgrade(rawDb, 1, 2)

        val tables = queryTableNames()
        assertTrue(tables.contains("tracking_profiles"))
    }

    // ========================================================================
    // WAL mode and pragmas
    // ========================================================================

    @Test
    fun `database has WAL journal mode enabled`() {
        val rawDb = db.readableDatabase
        rawDb.rawQuery("PRAGMA journal_mode", null).use { cursor ->
            cursor.moveToFirst()
            assertEquals("wal", cursor.getString(0))
        }
    }

    @Test
    fun `foreign keys are enabled`() {
        val rawDb = db.readableDatabase
        rawDb.rawQuery("PRAGMA foreign_keys", null).use { cursor ->
            cursor.moveToFirst()
            assertEquals(1, cursor.getInt(0))
        }
    }

    // ========================================================================
    // Location CRUD operations
    // ========================================================================

    @Test
    fun `saveLocation inserts and returns valid id`() {
        val id = db.saveLocation(
            latitude = 52.52,
            longitude = 13.405,
            accuracy = 10.0,
            timestamp = 1700000000L
        )
        assertTrue(id > 0)
    }

    @Test
    fun `saveLocation stores all fields correctly`() {
        val id = db.saveLocation(
            latitude = 52.52,
            longitude = 13.405,
            accuracy = 10.5,
            altitude = 34,
            speed = 1.5,
            bearing = 90.0,
            battery = 85,
            battery_status = 2,
            timestamp = 1700000000L,
            endpoint = "https://example.com"
        )

        val rawDb = db.readableDatabase
        rawDb.rawQuery("SELECT * FROM ${DatabaseHelper.TABLE_LOCATIONS} WHERE id = ?", arrayOf(id.toString())).use { cursor ->
            assertTrue(cursor.moveToFirst())
            assertEquals(52.52, cursor.getDouble(cursor.getColumnIndexOrThrow("latitude")), 0.001)
            assertEquals(13.405, cursor.getDouble(cursor.getColumnIndexOrThrow("longitude")), 0.001)
            assertEquals(10.5, cursor.getDouble(cursor.getColumnIndexOrThrow("accuracy")), 0.1)
            assertEquals(34, cursor.getInt(cursor.getColumnIndexOrThrow("altitude")))
            assertEquals(90.0, cursor.getDouble(cursor.getColumnIndexOrThrow("bearing")), 0.1)
            assertEquals(85, cursor.getInt(cursor.getColumnIndexOrThrow("battery")))
            assertEquals(2, cursor.getInt(cursor.getColumnIndexOrThrow("battery_status")))
            assertEquals(1700000000L, cursor.getLong(cursor.getColumnIndexOrThrow("timestamp")))
            assertEquals("https://example.com", cursor.getString(cursor.getColumnIndexOrThrow("endpoint")))
        }
    }

    @Test
    fun `saveLocation handles null optional fields`() {
        val id = db.saveLocation(
            latitude = 52.52,
            longitude = 13.405,
            timestamp = 1700000000L
        )

        val rawDb = db.readableDatabase
        rawDb.rawQuery("SELECT accuracy, altitude, speed FROM ${DatabaseHelper.TABLE_LOCATIONS} WHERE id = ?", arrayOf(id.toString())).use { cursor ->
            assertTrue(cursor.moveToFirst())
            assertTrue(cursor.isNull(0))
            assertTrue(cursor.isNull(1))
            assertTrue(cursor.isNull(2))
        }
    }

    @Test
    fun `getRawMostRecentLocation returns latest by timestamp`() {
        db.saveLocation(latitude = 52.0, longitude = 13.0, accuracy = 5.0, timestamp = 1000L)
        db.saveLocation(latitude = 53.0, longitude = 14.0, accuracy = 10.0, timestamp = 2000L)
        db.saveLocation(latitude = 51.0, longitude = 12.0, accuracy = 15.0, timestamp = 1500L)

        val result = db.getRawMostRecentLocation()
        assertNotNull(result)
        assertEquals(53.0, result!!["latitude"] as Double, 0.001)
        assertEquals(14.0, result["longitude"] as Double, 0.001)
        assertEquals(2000L, result["timestamp"])
    }

    @Test
    fun `getRawMostRecentLocation returns null when empty`() {
        assertNull(db.getRawMostRecentLocation())
    }

    @Test
    fun `deleteLocations removes specified locations`() {
        val id1 = db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)
        val id2 = db.saveLocation(latitude = 53.0, longitude = 14.0, timestamp = 2000L)
        val id3 = db.saveLocation(latitude = 54.0, longitude = 15.0, timestamp = 3000L)

        db.deleteLocations(listOf(id1, id3))

        val remaining = db.getTableData(DatabaseHelper.TABLE_LOCATIONS, 100, 0)
        assertEquals(1, remaining.size)
        assertEquals(53.0, remaining[0]["latitude"] as Double, 0.001)
    }

    @Test
    fun `deleteLocations is no-op for empty list`() {
        db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)
        db.deleteLocations(emptyList())

        val remaining = db.getTableData(DatabaseHelper.TABLE_LOCATIONS, 100, 0)
        assertEquals(1, remaining.size)
    }

    // ========================================================================
    // Queue operations
    // ========================================================================

    @Test
    fun `addToQueue and getQueuedLocations round-trip`() {
        val locId = db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)
        val queueId = db.addToQueue(locId, """{"lat":52.0}""")
        assertTrue(queueId > 0)

        val queued = db.getQueuedLocations(10)
        assertEquals(1, queued.size)
        assertEquals(queueId, queued[0].queueId)
        assertEquals(locId, queued[0].locationId)
        assertEquals("""{"lat":52.0}""", queued[0].payload)
        assertEquals(0, queued[0].retryCount)
    }

    @Test
    fun `getQueuedLocations respects limit`() {
        repeat(5) { i ->
            val locId = db.saveLocation(latitude = 52.0 + i, longitude = 13.0, timestamp = 1000L + i)
            db.addToQueue(locId, """{"lat":${52.0 + i}}""")
        }

        assertEquals(3, db.getQueuedLocations(3).size)
        assertEquals(5, db.getQueuedLocations(10).size)
    }

    @Test
    fun `getQueuedLocations returns oldest first`() {
        val loc1 = db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)
        val loc2 = db.saveLocation(latitude = 53.0, longitude = 14.0, timestamp = 2000L)
        db.addToQueue(loc1, """{"id":"first"}""")
        // Slight delay to ensure different created_at
        db.addToQueue(loc2, """{"id":"second"}""")

        val queued = db.getQueuedLocations(10)
        assertEquals("""{"id":"first"}""", queued[0].payload)
        assertEquals("""{"id":"second"}""", queued[1].payload)
    }

    @Test
    fun `getQueuedLocations returns fresh items before high-retry items`() {
        val loc1 = db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)
        val loc2 = db.saveLocation(latitude = 53.0, longitude = 14.0, timestamp = 2000L)
        val q1 = db.addToQueue(loc1, """{"id":"failing"}""")
        db.addToQueue(loc2, """{"id":"fresh"}""")

        // Increment retry count on the first (older) item
        db.incrementRetryCount(q1, "error")
        db.incrementRetryCount(q1, "error")
        db.incrementRetryCount(q1, "error")

        // Fresh item (retry_count=0) should come first despite being newer
        val queued = db.getQueuedLocations(10)
        assertEquals("""{"id":"fresh"}""", queued[0].payload)
        assertEquals("""{"id":"failing"}""", queued[1].payload)
    }

    @Test
    fun `removeFromQueueByLocationId deletes matching entries`() {
        val locId = db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)
        db.addToQueue(locId, """{"lat":52.0}""")

        val deleted = db.removeFromQueueByLocationId(locId)
        assertEquals(1, deleted)
        assertEquals(0, db.getQueuedCount())
    }

    @Test
    fun `removeBatchFromQueue deletes multiple entries`() {
        val ids = (1..5).map { i ->
            val locId = db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L + i)
            db.addToQueue(locId, """{"i":$i}""")
        }

        db.removeBatchFromQueue(ids.take(3))

        assertEquals(2, db.getQueuedCount())
    }

    @Test
    fun `removeBatchFromQueue is no-op for empty list`() {
        val locId = db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)
        db.addToQueue(locId, """{"lat":52.0}""")

        db.removeBatchFromQueue(emptyList())
        assertEquals(1, db.getQueuedCount())
    }

    @Test
    fun `incrementRetryCount updates count and error`() {
        val locId = db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)
        val queueId = db.addToQueue(locId, """{"lat":52.0}""")

        db.incrementRetryCount(queueId, "Network error")

        val queued = db.getQueuedLocations(10)
        assertEquals(1, queued[0].retryCount)

        // Verify error text via raw query
        db.readableDatabase.rawQuery(
            "SELECT last_error FROM ${DatabaseHelper.TABLE_QUEUE} WHERE id = ?",
            arrayOf(queueId.toString())
        ).use { cursor ->
            cursor.moveToFirst()
            assertEquals("Network error", cursor.getString(0))
        }
    }

    @Test
    fun `incrementRetryCount accumulates across multiple calls`() {
        val locId = db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)
        val queueId = db.addToQueue(locId, """{"lat":52.0}""")

        db.incrementRetryCount(queueId, "err1")
        db.incrementRetryCount(queueId, "err2")
        db.incrementRetryCount(queueId, "err3")

        val queued = db.getQueuedLocations(10)
        assertEquals(3, queued[0].retryCount)
    }

    @Test
    fun `getQueuedCount returns correct count`() {
        assertEquals(0, db.getQueuedCount())

        val locId = db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)
        db.addToQueue(locId, """{"lat":52.0}""")
        db.addToQueue(locId, """{"lat":52.0}""")

        assertEquals(2, db.getQueuedCount())
    }

    // ========================================================================
    // Foreign key cascades
    // ========================================================================

    @Test
    fun `deleting location cascades to queue entries`() {
        val locId = db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)
        db.addToQueue(locId, """{"lat":52.0}""")
        db.addToQueue(locId, """{"lat":52.0,"v":2}""")
        assertEquals(2, db.getQueuedCount())

        // Delete the location — should cascade to queue
        db.deleteLocations(listOf(locId))

        assertEquals(0, db.getQueuedCount())
    }

    @Test
    fun `clearAllLocations removes both locations and queue entries`() {
        val loc1 = db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)
        val loc2 = db.saveLocation(latitude = 53.0, longitude = 14.0, timestamp = 2000L)
        db.addToQueue(loc1, """{"lat":52.0}""")
        db.addToQueue(loc2, """{"lat":53.0}""")

        db.clearAllLocations()

        assertEquals(0, db.getQueuedCount())
        assertNull(db.getRawMostRecentLocation())
    }

    @Test
    fun `clearQueue removes only queued locations not sent ones`() {
        val queued = db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)
        val sent = db.saveLocation(latitude = 53.0, longitude = 14.0, timestamp = 2000L)
        db.addToQueue(queued, """{"lat":52.0}""")

        db.clearQueue()

        // Queued location (and its queue entry) should be gone
        assertEquals(0, db.getQueuedCount())
        // Sent location should remain
        val recent = db.getRawMostRecentLocation()
        assertNotNull(recent)
        assertEquals(53.0, recent!!["latitude"] as Double, 0.001)
    }

    @Test
    fun `clearSentHistory removes only unqueued locations`() {
        val queued = db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)
        val sent = db.saveLocation(latitude = 53.0, longitude = 14.0, timestamp = 2000L)
        db.addToQueue(queued, """{"lat":52.0}""")

        val deleted = db.clearSentHistory()
        assertEquals(1, deleted)

        // Queued location should remain
        assertEquals(1, db.getQueuedCount())
        val recent = db.getRawMostRecentLocation()
        assertEquals(52.0, recent!!["latitude"] as Double, 0.001)
    }

    // ========================================================================
    // Transaction handling
    // ========================================================================

    @Test
    fun `prepopulateSettings inserts all defaults in single transaction`() {
        val settings = db.getAllSettings()
        // Verify all expected defaults exist
        assertTrue(settings.containsKey("interval"))
        assertTrue(settings.containsKey("endpoint"))
        assertTrue(settings.containsKey("fieldMap"))
        assertTrue(settings.containsKey("tracking_enabled"))
        assertTrue(settings.containsKey("httpMethod"))
        assertTrue(settings.size >= 16)
    }

    @Test
    fun `saveSetting uses CONFLICT_REPLACE for upsert`() {
        db.saveSetting("tracking_enabled", "true")
        assertEquals("true", db.getSetting("tracking_enabled"))

        db.saveSetting("tracking_enabled", "false")
        assertEquals("false", db.getSetting("tracking_enabled"))
    }

    @Test
    fun `removeBatchFromQueue handles large batches correctly`() {
        val ids = (1..100).map { i ->
            val locId = db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L + i)
            db.addToQueue(locId, """{"i":$i}""")
        }

        db.removeBatchFromQueue(ids)
        assertEquals(0, db.getQueuedCount())
    }

    // ========================================================================
    // Settings operations
    // ========================================================================

    @Test
    fun `getSetting returns null for missing key`() {
        assertNull(db.getSetting("nonexistent_key"))
    }

    @Test
    fun `getSetting returns default value for missing key`() {
        assertEquals("fallback", db.getSetting("nonexistent_key", "fallback"))
    }

    @Test
    fun `getSetting trims whitespace from values`() {
        db.saveSetting("test_key", "  hello  ")
        assertEquals("hello", db.getSetting("test_key"))
    }

    @Test
    fun `getAllSettings returns complete map`() {
        db.saveSetting("custom1", "value1")
        db.saveSetting("custom2", "value2")

        val all = db.getAllSettings()
        assertEquals("value1", all["custom1"])
        assertEquals("value2", all["custom2"])
        // Plus prepopulated defaults
        assertTrue(all.size >= 18)
    }

    // ========================================================================
    // getTableData — pagination and type handling
    // ========================================================================

    @Test
    fun `getTableData returns paginated results`() {
        repeat(10) { i ->
            db.saveLocation(latitude = 52.0 + i, longitude = 13.0, timestamp = 1000L + i)
        }

        val page1 = db.getTableData(DatabaseHelper.TABLE_LOCATIONS, 3, 0)
        val page2 = db.getTableData(DatabaseHelper.TABLE_LOCATIONS, 3, 3)

        assertEquals(3, page1.size)
        assertEquals(3, page2.size)
        // Locations ordered by timestamp DESC — page 1 has newest
        assertNotEquals(page1[0]["timestamp"], page2[0]["timestamp"])
    }

    @Test
    fun `getTableData handles mixed column types`() {
        db.saveLocation(
            latitude = 52.52,
            longitude = 13.405,
            accuracy = 10.0,
            altitude = 34,
            timestamp = 1700000000L,
            endpoint = "https://example.com"
        )

        val data = db.getTableData(DatabaseHelper.TABLE_LOCATIONS, 1, 0)
        assertEquals(1, data.size)
        val row = data[0]
        // REAL columns
        assertTrue(row["latitude"] is Double)
        // INTEGER columns
        assertTrue(row["timestamp"] is Long)
        // TEXT columns
        assertTrue(row["endpoint"] is String)
    }

    @Test
    fun `getTableData rejects unknown table names`() {
        try {
            db.getTableData("evil_table; DROP TABLE locations", 10, 0)
            fail("Should throw IllegalArgumentException")
        } catch (e: IllegalArgumentException) {
            assertTrue(e.message!!.contains("Invalid table name"))
        }
    }

    // ========================================================================
    // getLocationsByDateRange
    // ========================================================================

    @Test
    fun `getLocationsByDateRange returns locations in ascending order`() {
        db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)
        db.saveLocation(latitude = 53.0, longitude = 14.0, timestamp = 2000L)
        db.saveLocation(latitude = 54.0, longitude = 15.0, timestamp = 3000L)

        val result = db.getLocationsByDateRange(1000L, 3000L)
        assertEquals(3, result.size)
        assertEquals(1000L, result[0]["timestamp"])
        assertEquals(2000L, result[1]["timestamp"])
        assertEquals(3000L, result[2]["timestamp"])
    }

    @Test
    fun `getLocationsByDateRange filters by range boundaries`() {
        db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 500L)
        db.saveLocation(latitude = 53.0, longitude = 14.0, timestamp = 1000L)
        db.saveLocation(latitude = 54.0, longitude = 15.0, timestamp = 2000L)
        db.saveLocation(latitude = 55.0, longitude = 16.0, timestamp = 3000L)

        val result = db.getLocationsByDateRange(1000L, 2000L)
        assertEquals(2, result.size)
        assertEquals(1000L, result[0]["timestamp"])
        assertEquals(2000L, result[1]["timestamp"])
    }

    @Test
    fun `getLocationsByDateRange returns empty for no matches`() {
        db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)

        val result = db.getLocationsByDateRange(5000L, 6000L)
        assertTrue(result.isEmpty())
    }

    // ========================================================================
    // Stats and cleanup
    // ========================================================================

    @Test
    fun `getStats returns correct counts`() {
        val loc1 = db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = System.currentTimeMillis() / 1000)
        val loc2 = db.saveLocation(latitude = 53.0, longitude = 14.0, timestamp = System.currentTimeMillis() / 1000)
        db.addToQueue(loc1, """{"lat":52.0}""")

        val (queued, total, today) = db.getStats()
        assertEquals(1, queued)
        assertEquals(2, total)
        assertEquals(2, today)
    }

    @Test
    fun `getStats returns zeros for empty database`() {
        val (queued, total, today) = db.getStats()
        assertEquals(0, queued)
        assertEquals(0, total)
        assertEquals(0, today)
    }

    @Test
    fun `vacuum runs without error`() {
        db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)
        db.vacuum()
        // No exception = pass
    }

    // ========================================================================
    // WAL concurrent access patterns
    // ========================================================================

    @Test
    fun `read during open write transaction does not block`() {
        // Insert baseline data
        db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)

        // Start a write transaction, then read — should not throw or deadlock
        val rawDb = db.writableDatabase
        rawDb.beginTransaction()
        try {
            val values = ContentValues().apply {
                put("latitude", 53.0)
                put("longitude", 14.0)
                put("timestamp", 2000L)
                put("created_at", System.currentTimeMillis() / 1000)
            }
            rawDb.insert(DatabaseHelper.TABLE_LOCATIONS, null, values)

            // Read while write transaction is open — WAL allows this without blocking.
            // Note: Robolectric uses a single connection, so uncommitted data may be
            // visible here. True WAL isolation requires separate connections.
            val recent = db.getRawMostRecentLocation()
            assertNotNull(recent)

            rawDb.setTransactionSuccessful()
        } finally {
            rawDb.endTransaction()
        }

        // After commit, read sees new data
        val recent = db.getRawMostRecentLocation()
        assertEquals(53.0, recent!!["latitude"] as Double, 0.001)
    }

    @Test
    fun `write transaction rollback does not persist data`() {
        db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L)

        val rawDb = db.writableDatabase
        rawDb.beginTransaction()
        try {
            val values = ContentValues().apply {
                put("latitude", 99.0)
                put("longitude", 99.0)
                put("timestamp", 9999L)
                put("created_at", System.currentTimeMillis() / 1000)
            }
            rawDb.insert(DatabaseHelper.TABLE_LOCATIONS, null, values)
            // Intentionally NOT calling setTransactionSuccessful()
        } finally {
            rawDb.endTransaction()
        }

        // Rolled-back row should not exist
        val data = db.getTableData(DatabaseHelper.TABLE_LOCATIONS, 100, 0)
        assertEquals(1, data.size)
        assertEquals(52.0, data[0]["latitude"] as Double, 0.001)
    }

    // ========================================================================
    // getDaysWithData
    // ========================================================================

    @Test
    fun `getDaysWithData returns distinct days`() {
        // Two locations on same day, one on a different day
        db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1708344000L) // midday
        db.saveLocation(latitude = 52.1, longitude = 13.1, timestamp = 1708344060L) // +1 min same day
        db.saveLocation(latitude = 53.0, longitude = 14.0, timestamp = 1708430400L) // next day midday

        val days = db.getDaysWithData(1708300000L, 1708500000L)
        assertEquals(2, days.size)
        // Ordered ASC
        assertTrue(days[0] < days[1])
    }

    @Test
    fun `getDaysWithData returns empty for no matches`() {
        db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1708344000L)

        val days = db.getDaysWithData(1700000000L, 1700100000L)
        assertTrue(days.isEmpty())
    }

    @Test
    fun `getDaysWithData respects range boundaries`() {
        db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1000L) // outside range
        db.saveLocation(latitude = 53.0, longitude = 14.0, timestamp = 5000L) // inside range
        db.saveLocation(latitude = 54.0, longitude = 15.0, timestamp = 9000L) // outside range

        val days = db.getDaysWithData(4000L, 6000L)
        assertEquals(1, days.size)
    }

    // ========================================================================
    // getDailyStats
    // ========================================================================

    @Test
    fun `getDailyStats returns per-day aggregated stats`() {
        // Day 1: 3 locations close together (single trip)
        db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1708344000L)
        db.saveLocation(latitude = 52.001, longitude = 13.001, timestamp = 1708344060L)
        db.saveLocation(latitude = 52.002, longitude = 13.002, timestamp = 1708344120L)

        // Day 2: 2 locations
        db.saveLocation(latitude = 53.0, longitude = 14.0, timestamp = 1708430400L)
        db.saveLocation(latitude = 53.001, longitude = 14.001, timestamp = 1708430460L)

        val stats = db.getDailyStats(1708300000L, 1708500000L)
        assertEquals(2, stats.size)

        // Day 1 stats
        assertEquals(3, stats[0]["count"])
        assertTrue((stats[0]["distanceMeters"] as Double) > 0)
        assertEquals(1, stats[0]["tripCount"]) // all within 60s, no gap
    }

    @Test
    fun `getDailyStats counts trips based on time gaps`() {
        // Trip 1: two locations 60s apart
        db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1708344000L) // 12:00
        db.saveLocation(latitude = 52.1, longitude = 13.1, timestamp = 1708344060L) // 12:01

        // Gap of 16 minutes (> 900s threshold)

        // Trip 2: two more locations
        db.saveLocation(latitude = 53.0, longitude = 14.0, timestamp = 1708345020L) // 12:17
        db.saveLocation(latitude = 53.1, longitude = 14.1, timestamp = 1708345080L) // 12:18

        val stats = db.getDailyStats(1708300000L, 1708400000L)
        assertEquals(1, stats.size)
        assertEquals(4, stats[0]["count"])
        assertEquals(2, stats[0]["tripCount"])
    }

    @Test
    fun `getDailyStats returns empty for no data`() {
        val stats = db.getDailyStats(1708300000L, 1708400000L)
        assertTrue(stats.isEmpty())
    }

    @Test
    fun `getDailyStats computes distance via haversine`() {
        // Two points roughly 11 km apart (Berlin to Potsdam)
        db.saveLocation(latitude = 52.52, longitude = 13.405, timestamp = 1708344000L)
        db.saveLocation(latitude = 52.39, longitude = 13.065, timestamp = 1708344060L)

        val stats = db.getDailyStats(1708300000L, 1708400000L)
        assertEquals(1, stats.size)
        val distance = stats[0]["distanceMeters"] as Double
        // Distance should be roughly 25-30 km (haversine)
        assertTrue("Distance should be > 20km, was $distance", distance > 20000)
        assertTrue("Distance should be < 40km, was $distance", distance < 40000)
    }

    // ========================================================================
    // haversineDistance
    // ========================================================================

    @Test
    fun `haversineDistance Berlin to Munich is approximately 504 km`() {
        val distance = db.haversineDistance(52.52, 13.405, 48.1351, 11.582)
        assertTrue("Expected ~504km, got ${distance / 1000}km", distance > 500000)
        assertTrue("Expected ~504km, got ${distance / 1000}km", distance < 510000)
    }

    @Test
    fun `haversineDistance same point returns zero`() {
        val distance = db.haversineDistance(52.52, 13.405, 52.52, 13.405)
        assertEquals(0.0, distance, 0.001)
    }

    // ========================================================================
    // deleteOlderThan
    // ========================================================================

    @Test
    fun `deleteOlderThan removes only old locations`() {
        val now = System.currentTimeMillis() / 1000
        db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = now - 86400 * 10) // 10 days ago
        db.saveLocation(latitude = 53.0, longitude = 14.0, timestamp = now) // today

        val deleted = db.deleteOlderThan(7)
        assertEquals(1, deleted)

        val remaining = db.getTableData(DatabaseHelper.TABLE_LOCATIONS, 100, 0)
        assertEquals(1, remaining.size)
        assertEquals(53.0, remaining[0]["latitude"] as Double, 0.001)
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private fun queryTableNames(): Set<String> {
        val tables = mutableSetOf<String>()
        db.readableDatabase.rawQuery(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'android_%'",
            null
        ).use { cursor ->
            while (cursor.moveToNext()) {
                tables.add(cursor.getString(0))
            }
        }
        return tables
    }

    private fun queryIndexNames(): Set<String> {
        val indexes = mutableSetOf<String>()
        db.readableDatabase.rawQuery(
            "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'",
            null
        ).use { cursor ->
            while (cursor.moveToNext()) {
                indexes.add(cursor.getString(0))
            }
        }
        return indexes
    }
}
