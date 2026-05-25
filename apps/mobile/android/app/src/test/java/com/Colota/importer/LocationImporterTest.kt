/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.importer

import androidx.test.core.app.ApplicationProvider
import com.Colota.data.DatabaseHelper
import com.Colota.util.AppLogger
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockkObject
import io.mockk.unmockkObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.concurrent.atomic.AtomicBoolean

@RunWith(RobolectricTestRunner::class)
class LocationImporterTest {

    private lateinit var db: DatabaseHelper

    @Before
    fun setUp() {
        resetDbSingleton()
        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs

        db = DatabaseHelper.getInstance(ApplicationProvider.getApplicationContext())
    }

    @After
    fun tearDown() {
        db.close()
        resetDbSingleton()
        unmockkObject(AppLogger)
    }

    private fun resetDbSingleton() {
        val field = DatabaseHelper::class.java.getDeclaredField("INSTANCE")
        field.isAccessible = true
        field.set(null, null)
    }

    @Test
    fun `detectFormat identifies Colota GeoJSON by FeatureCollection sniff`() {
        val sniff = """{"type":"FeatureCollection","features":[]}"""
        assertEquals(ImportFormat.GEOJSON, LocationImporter.detectFormat(sniff))
    }

    @Test
    fun `detectFormat identifies legacy Takeout by latitudeE7 sniff`() {
        // Records.json may be huge; sniffing the leading bytes must be enough.
        val sniff = """{"locations":[{"latitudeE7":525000000,"longitudeE7":134000000,"timestampMs":"1700000000000"}"""
        assertEquals(ImportFormat.GOOGLE_TIMELINE_LEGACY, LocationImporter.detectFormat(sniff))
    }

    @Test
    fun `detectFormat identifies new on-device timeline by semanticSegments`() {
        val sniff = """{"semanticSegments":[{"startTime":"2024-01-01T00:00:00Z"}]}"""
        assertEquals(ImportFormat.GOOGLE_TIMELINE_NEW, LocationImporter.detectFormat(sniff))
    }

    @Test
    fun `detectFormat identifies new on-device timeline by rawSignals`() {
        val sniff = """{"rawSignals":[{"position":{"LatLng":"52.5°,13.4°"}}]}"""
        assertEquals(ImportFormat.GOOGLE_TIMELINE_NEW, LocationImporter.detectFormat(sniff))
    }

    @Test
    fun `detectFormat returns null for unrecognised content`() {
        assertNull(LocationImporter.detectFormat("this is just text"))
    }

    @Test
    fun `Google Timeline precedence over generic GeoJSON`() {
        val sniff = """{"type":"something","features":[],"locations":[{"latitudeE7":1,"timestampMs":"1"}]}"""
        assertEquals(ImportFormat.GOOGLE_TIMELINE_LEGACY, LocationImporter.detectFormat(sniff))
    }

    @Test
    fun `detectFormat rejects XML files with DOCTYPE declarations`() {
        val gpxWithDoctype = """
            <?xml version="1.0"?>
            <!DOCTYPE gpx [
              <!ENTITY lol "lol">
              <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
            ]>
            <gpx version="1.1"></gpx>
        """.trimIndent()
        try {
            LocationImporter.detectFormat(gpxWithDoctype)
            throw AssertionError("expected UnsupportedFormatException for DOCTYPE")
        } catch (e: UnsupportedFormatException) {
            assertTrue(e.message!!.contains("DOCTYPE"))
        }
    }

    @Test
    fun `detectFormat identifies GPX by root element`() {
        val sniff = """<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">"""
        assertEquals(ImportFormat.GPX, LocationImporter.detectFormat(sniff))
    }

    @Test
    fun `detectFormat identifies KML by root element`() {
        val sniff = """<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2">"""
        assertEquals(ImportFormat.KML, LocationImporter.detectFormat(sniff))
    }

    @Test
    fun `detectFormat identifies CSV by header with lat lon and time columns`() {
        val sniff = "id,timestamp,iso_time,latitude,longitude,accuracy\n0,1704110400,2024-01-01T12:00:00Z,52.5,13.4,5"
        assertEquals(ImportFormat.CSV, LocationImporter.detectFormat(sniff))
    }

    @Test
    fun `detectFormat rejects CSV without recognisable header columns`() {
        val sniff = "id,name,description\n0,foo,bar"
        assertNull(LocationImporter.detectFormat(sniff))
    }

    @Test
    fun `dedupKey rounds to 6 decimals so identical samples collide`() {
        val a = LocationImporter.dedupKey(1000L, 52.5000001, 13.4000001)
        val b = LocationImporter.dedupKey(1000L, 52.500000, 13.400000)
        assertEquals(a, b)
    }

    @Test
    fun `dedupKey separates samples with different timestamps`() {
        val a = LocationImporter.dedupKey(1000L, 52.5, 13.4)
        val b = LocationImporter.dedupKey(1001L, 52.5, 13.4)
        assertTrue(a != b)
    }

    @Test
    fun `commit writes rows with sent equals one so they do not re-upload`() {
        val rows = listOf(
            ImportRow(1_700_000_000L, 52.5, 13.4, 5, 30, 2, null, 80),
        )
        val inserted = db.bulkInsertImportedLocations(rows)
        assertEquals(1, inserted)

        db.readableDatabase.rawQuery(
            "SELECT sent, latitude, longitude, timestamp, accuracy FROM ${DatabaseHelper.TABLE_LOCATIONS}",
            null,
        ).use { c ->
            assertTrue(c.moveToFirst())
            assertEquals(1, c.getInt(0))
            assertEquals(52.5, c.getDouble(1), 1e-9)
            assertEquals(13.4, c.getDouble(2), 1e-9)
            assertEquals(1_700_000_000L, c.getLong(3))
            assertEquals(5, c.getInt(4))
        }
    }

    @Test
    fun `bulk insert commits the full batch in one transaction`() {
        val rows = (0 until 100).map { i ->
            ImportRow(
                timestamp = 1_700_000_000L + i,
                latitude = 52.5 + i * 0.001,
                longitude = 13.4 + i * 0.001,
                accuracy = 5,
                altitude = null,
                speed = null,
                bearing = null,
                battery = null,
            )
        }
        val inserted = db.bulkInsertImportedLocations(rows)
        assertEquals(100, inserted)
        assertEquals(100, db.getStats().total)
    }

    @Test
    fun `forEachLocationKeyInRange streams only rows in the timestamp window`() {
        db.bulkInsertImportedLocations(listOf(
            ImportRow(1_000L, 1.0, 1.0, null, null, null, null, null),
            ImportRow(2_000L, 2.0, 2.0, null, null, null, null, null),
            ImportRow(3_000L, 3.0, 3.0, null, null, null, null, null),
        ))

        val seen = mutableListOf<Long>()
        db.forEachLocationKeyInRange(1_500L, 2_500L) { ts, _, _ -> seen.add(ts) }
        assertEquals(listOf(2_000L), seen)
    }

    @Test
    fun `dedup analysis skips rows already present in DB across same date range`() {
        db.bulkInsertImportedLocations(listOf(
            ImportRow(1_700_000_000L, 52.5, 13.4, null, null, null, null, null),
        ))

        val incomingKey = LocationImporter.dedupKey(1_700_000_000L, 52.5, 13.4)
        val existing = HashSet<DedupKey>()
        db.forEachLocationKeyInRange(1_700_000_000L, 1_700_000_000L) { ts, lat, lon ->
            existing.add(LocationImporter.dedupKey(ts, lat, lon))
        }
        assertTrue("seeded row must be in existing set", existing.contains(incomingKey))
    }

    @Test
    fun `commit returns inserted count and stats reflect new rows`() {
        val rows = listOf(
            ImportRow(1_700_000_001L, 52.5, 13.4, 5, null, null, null, null),
            ImportRow(1_700_000_002L, 52.6, 13.5, 5, null, null, null, null),
        )
        val inserted = LocationImporter.commit(db, rows)
        assertEquals(2, inserted)
        val stats = db.getStats()
        assertEquals(2, stats.total)
        // Imported rows are sent=1 so they are not counted as queued.
        assertEquals(2, stats.sent)
        assertEquals(0, stats.queued)
    }

    @Test
    fun `empty commit is a no-op`() {
        assertEquals(0, LocationImporter.commit(db, emptyList()))
        assertEquals(0, db.getStats().total)
    }

    @Test
    fun `commit with asQueued=true writes sent=0 plus paired queue rows in one transaction`() {
        val rows = listOf(
            ImportRow(1_700_000_001L, 52.5, 13.4, 5, 30, 2, null, 80),
            ImportRow(1_700_000_002L, 52.6, 13.5, 7, null, null, null, null),
        )
        val options = com.Colota.importer.CommitOptions(
            asQueued = true,
            endpoint = "https://my-backend.example.com/locations",
            isOfflineMode = false,
            fieldMap = mapOf("lat" to "lat", "lon" to "lon", "acc" to "acc", "tst" to "tst", "batt" to "batt", "bs" to "bs"),
            customFields = emptyMap(),
            apiFormat = com.Colota.sync.ApiFormat.FIELD_MAPPED,
        )

        val inserted = LocationImporter.commit(db, rows, options)

        assertEquals(2, inserted)
        val stats = db.getStats()
        assertEquals(2, stats.total)
        assertEquals(0, stats.sent)
        assertEquals(2, stats.queued)

        db.readableDatabase.rawQuery(
            "SELECT payload FROM ${DatabaseHelper.TABLE_QUEUE} ORDER BY id ASC", null,
        ).use { c ->
            assertTrue(c.moveToFirst())
            val payload = org.json.JSONObject(c.getString(0))
            assertEquals(52.5, payload.getDouble("lat"), 1e-9)
            assertEquals(13.4, payload.getDouble("lon"), 1e-9)
            assertEquals(1_700_000_001L, payload.getLong("tst"))
        }
    }

    @Test
    fun `commit with asQueued=true rejects when endpoint is blank`() {
        // Fail loud rather than silently downgrade to sent=1, which would mask the misconfig.
        val rows = listOf(ImportRow(1_700_000_001L, 52.5, 13.4, 5, null, null, null, null))
        try {
            LocationImporter.commit(
                db,
                rows,
                com.Colota.importer.CommitOptions(asQueued = true, endpoint = ""),
            )
            throw AssertionError("expected IllegalArgumentException for blank endpoint")
        } catch (_: IllegalArgumentException) {
            // expected
        }
        assertEquals("no rows should have been written", 0, db.getStats().total)
    }

    @Test
    fun `commit with asQueued=true rejects when offline mode is on`() {
        val rows = listOf(ImportRow(1_700_000_001L, 52.5, 13.4, 5, null, null, null, null))
        try {
            LocationImporter.commit(
                db,
                rows,
                com.Colota.importer.CommitOptions(
                    asQueued = true,
                    endpoint = "https://my-backend.example.com",
                    isOfflineMode = true,
                ),
            )
            throw AssertionError("expected IllegalArgumentException for offline mode")
        } catch (_: IllegalArgumentException) {
            // expected
        }
        assertEquals("no rows should have been written", 0, db.getStats().total)
    }

    @Test
    fun `preview folds adjacent file-internal duplicates`() {
        val geojson = """
            {
              "type": "FeatureCollection",
              "features": [
                { "type": "Feature", "geometry": { "type": "Point", "coordinates": [13.4, 52.5] },
                  "properties": { "time": "2024-01-01T12:00:00.000Z" } },
                { "type": "Feature", "geometry": { "type": "Point", "coordinates": [13.4, 52.5] },
                  "properties": { "time": "2024-01-01T12:00:00.000Z" } }
              ]
            }
        """.trimIndent()

        val uri = writeFixture("dup.geojson", geojson)
        val resolver = ApplicationProvider.getApplicationContext<android.content.Context>().contentResolver

        val preview = LocationImporter.preview(
            contentResolver = resolver,
            uri = uri,
            db = db,
            cancelled = AtomicBoolean(false),
            nowSec = 1_750_000_000L,
        )

        assertEquals(2, preview.totalParsed)
        assertEquals(1, preview.duplicates)
        assertEquals(1, preview.rowsToCommit.size)
    }

    @Test
    fun `file-internal duplicate that also matches a DB row is fully deduplicated`() {
        // Naive merge-walk would emit the second copy as new; pre-fold prevents that.
        db.bulkInsertImportedLocations(listOf(
            ImportRow(1_704_110_400L, 52.5, 13.4, null, null, null, null, null),
        ))

        val geojson = """
            {
              "type": "FeatureCollection",
              "features": [
                { "type": "Feature", "geometry": { "type": "Point", "coordinates": [13.4, 52.5] },
                  "properties": { "time": "2024-01-01T12:00:00.000Z" } },
                { "type": "Feature", "geometry": { "type": "Point", "coordinates": [13.4, 52.5] },
                  "properties": { "time": "2024-01-01T12:00:00.000Z" } }
              ]
            }
        """.trimIndent()

        val uri = writeFixture("dup-in-file-and-db.geojson", geojson)
        val resolver = ApplicationProvider.getApplicationContext<android.content.Context>().contentResolver

        val preview = LocationImporter.preview(
            contentResolver = resolver,
            uri = uri,
            db = db,
            cancelled = AtomicBoolean(false),
            nowSec = 1_750_000_000L,
        )

        assertEquals(2, preview.totalParsed)
        assertEquals(2, preview.duplicates)
        assertEquals(0, preview.rowsToCommit.size)
    }

    @Test
    fun `preview merge-walk handles unsorted source by sorting first`() {
        db.bulkInsertImportedLocations(listOf(
            ImportRow(1_704_110_500L, 52.51, 13.41, null, null, null, null, null),
        ))

        val geojson = """
            {
              "type": "FeatureCollection",
              "features": [
                { "type": "Feature", "geometry": { "type": "Point", "coordinates": [13.41, 52.51] },
                  "properties": { "time": "2024-01-01T12:01:40.000Z" } },
                { "type": "Feature", "geometry": { "type": "Point", "coordinates": [13.40, 52.50] },
                  "properties": { "time": "2024-01-01T12:00:00.000Z" } }
              ]
            }
        """.trimIndent()

        val uri = writeFixture("unsorted.geojson", geojson)
        val resolver = ApplicationProvider.getApplicationContext<android.content.Context>().contentResolver

        val preview = LocationImporter.preview(
            contentResolver = resolver,
            uri = uri,
            db = db,
            cancelled = AtomicBoolean(false),
            nowSec = 1_750_000_000L,
        )

        // Second feature (12:01:40) collides with the seeded DB row; first feature is new.
        assertEquals(2, preview.totalParsed)
        assertEquals(1, preview.duplicates)
        assertEquals(1, preview.rowsToCommit.size)
        // The surviving row is the 12:00:00 one.
        assertEquals(1_704_110_400L, preview.rowsToCommit[0].timestamp)
    }

    @Test
    fun `bulkInsertImportedLocations rejects mismatched payloads length`() {
        // Length mismatch is a caller bug; failing the require keeps the DB clean.
        val rows = listOf(
            ImportRow(1L, 1.0, 1.0, null, null, null, null, null),
            ImportRow(2L, 2.0, 2.0, null, null, null, null, null),
        )
        try {
            db.bulkInsertImportedLocations(rows, payloads = listOf("only one payload"))
            throw AssertionError("expected IllegalArgumentException for length mismatch")
        } catch (_: IllegalArgumentException) {
            // expected
        }
        assertEquals(0, db.getStats().total)
    }

    @Test
    fun `preview parses Colota GeoJSON, dedups against DB, returns staged rows`() {
        // Seed one existing point that will collide with the second feature in the import.
        db.bulkInsertImportedLocations(listOf(
            ImportRow(1_704_110_500L, 52.51, 13.41, null, null, null, null, null),
        ))

        val geojson = """
            {
              "type": "FeatureCollection",
              "features": [
                {
                  "type": "Feature",
                  "geometry": { "type": "Point", "coordinates": [13.40, 52.50] },
                  "properties": { "time": "2024-01-01T12:00:00.000Z" }
                },
                {
                  "type": "Feature",
                  "geometry": { "type": "Point", "coordinates": [13.41, 52.51] },
                  "properties": { "time": "2024-01-01T12:01:40.000Z" }
                }
              ]
            }
        """.trimIndent()

        val uri = writeFixture("colota-export.geojson", geojson)
        val resolver = ApplicationProvider.getApplicationContext<android.content.Context>().contentResolver

        val preview = LocationImporter.preview(
            contentResolver = resolver,
            uri = uri,
            db = db,
            cancelled = AtomicBoolean(false),
            nowSec = 1_750_000_000L,
        )

        assertEquals(ImportFormat.GEOJSON, preview.format)
        assertEquals(2, preview.totalParsed)
        assertEquals(0, preview.invalid)
        assertEquals(1, preview.duplicates)
        assertEquals(1, preview.rowsToCommit.size)
        assertNotNull(preview.dateRangeStartSec)
        assertEquals(1_704_110_400L, preview.dateRangeStartSec)
        assertEquals(1_704_110_500L, preview.dateRangeEndSec)
    }

    private fun writeFixture(name: String, content: String): android.net.Uri {
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val file = java.io.File(ctx.cacheDir, name)
        file.writeText(content, Charsets.UTF_8)
        return android.net.Uri.fromFile(file)
    }
}
