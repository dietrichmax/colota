/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.importer

import com.Colota.export.ExportConverters
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.ByteArrayInputStream
import java.util.concurrent.atomic.AtomicBoolean

@RunWith(RobolectricTestRunner::class)
class GeoJsonParserTest {

    private val cancelled = AtomicBoolean(false)
    private val nowSec = 1_750_000_000L // fixed "now" so future-date rejection is deterministic

    @Test
    fun `parses Colota export round-trip shape`() {
        val json = """
            {
              "type": "FeatureCollection",
              "features": [
                {
                  "type": "Feature",
                  "geometry": { "type": "Point", "coordinates": [13.4, 52.5] },
                  "properties": {
                    "accuracy": 5,
                    "altitude": 30,
                    "speed": 2,
                    "battery": 80,
                    "time": "2024-01-01T12:00:00.000Z"
                  }
                }
              ]
            }
        """.trimIndent()

        val result = GeoJsonParser.parse(json.byteInputStream(), cancelled, nowSec)
        assertEquals(0, result.invalid)
        assertEquals(1, result.rows.size)
        val row = result.rows[0]
        assertEquals(52.5, row.latitude, 1e-9)
        assertEquals(13.4, row.longitude, 1e-9)
        assertEquals(5, row.accuracy)
        assertEquals(30, row.altitude)
        assertEquals(2, row.speed)
        assertEquals(80, row.battery)
        // 2024-01-01T12:00:00Z = 1704110400
        assertEquals(1_704_110_400L, row.timestamp)
    }

    @Test
    fun `imports note and battery_status from a Point feature`() {
        val json = """
            {
              "type": "FeatureCollection",
              "features": [
                {
                  "type": "Feature",
                  "geometry": { "type": "Point", "coordinates": [13.4, 52.5] },
                  "properties": {
                    "time": "2024-01-01T12:00:00.000Z",
                    "battery_status": "Charging",
                    "note": "deer crossing"
                  }
                }
              ]
            }
        """.trimIndent()

        val result = GeoJsonParser.parse(json.byteInputStream(), cancelled, nowSec)
        assertEquals(0, result.invalid)
        assertEquals(1, result.rows.size)
        assertEquals("deer crossing", result.rows[0].note)
        assertEquals(2, result.rows[0].batteryStatus) // "Charging" -> BatteryStatus.CHARGING
    }

    @Test
    fun `parses a columnar MultiPoint feature into one row per point`() {
        val json = """
            {
              "type": "FeatureCollection",
              "features": [
                {
                  "type": "Feature",
                  "geometry": {
                    "type": "MultiPoint",
                    "coordinates": [ [13.4, 52.5], [13.41, 52.51] ]
                  },
                  "properties": {
                    "accuracy": [5, 8],
                    "altitude": [30, 31],
                    "battery": [80, 79],
                    "battery_status": ["Charging", "Full"],
                    "note": ["start", null],
                    "time": ["2024-01-01T12:00:00.000Z", "2024-01-01T12:01:00.000Z"]
                  }
                }
              ]
            }
        """.trimIndent()

        val result = GeoJsonParser.parse(json.byteInputStream(), cancelled, nowSec)
        assertEquals(0, result.invalid)
        assertEquals(2, result.rows.size)

        val first = result.rows[0]
        assertEquals(52.5, first.latitude, 1e-9)
        assertEquals(13.4, first.longitude, 1e-9)
        assertEquals(5, first.accuracy)
        assertEquals(80, first.battery)
        assertEquals(2, first.batteryStatus)
        assertEquals("start", first.note)
        assertEquals(1_704_110_400L, first.timestamp)

        val second = result.rows[1]
        assertEquals(52.51, second.latitude, 1e-9)
        assertEquals(8, second.accuracy)
        assertEquals(3, second.batteryStatus) // "Full"
        assertNull(second.note) // null-filled
        assertEquals(1_704_110_460L, second.timestamp)
    }

    @Test
    fun `MultiPoint points without a paired time are counted invalid`() {
        // Two coordinates but only one time -> the second point can't be placed in time.
        val json = """
            {
              "type": "FeatureCollection",
              "features": [
                {
                  "type": "Feature",
                  "geometry": { "type": "MultiPoint", "coordinates": [ [13.4, 52.5], [13.41, 52.51] ] },
                  "properties": { "time": ["2024-01-01T12:00:00.000Z"] }
                }
              ]
            }
        """.trimIndent()

        val result = GeoJsonParser.parse(json.byteInputStream(), cancelled, nowSec)
        assertEquals(1, result.rows.size)
        assertEquals(1, result.invalid)
    }

    @Test
    fun `round-trips a multi-point export back into equal rows`() {
        // The feature's headline promise: export -> import must preserve every field, including note
        // and battery_status. Drives the real writer (ExportConverters) into the real parser.
        val rows = listOf(
            mapOf<String, Any?>(
                "latitude" to 52.5, "longitude" to 13.4, "timestamp" to 1_700_000_000L,
                "accuracy" to 5, "altitude" to 30, "speed" to 2, "bearing" to 180.0,
                "battery" to 80, "battery_status" to 2L, "note" to "deer, \"big\" <antlers>",
            ),
            mapOf<String, Any?>(
                "latitude" to 48.8566, "longitude" to 2.3522, "timestamp" to 1_700_003_600L,
                "accuracy" to 8, "altitude" to 40, "speed" to 3, "bearing" to 90.0,
                "battery" to 79, "battery_status" to 3L,
            ),
        )

        val json = ExportConverters.convert("geojson", rows)
        val result = GeoJsonParser.parse(json.byteInputStream(), cancelled, nowSec)

        assertEquals(0, result.invalid)
        assertEquals(2, result.rows.size)
        val a = result.rows[0]
        assertEquals(52.5, a.latitude, 1e-9)
        assertEquals(13.4, a.longitude, 1e-9)
        assertEquals(1_700_000_000L, a.timestamp)
        assertEquals(5, a.accuracy)
        assertEquals(30, a.altitude)
        assertEquals(2, a.speed)
        assertEquals(180.0, a.bearing!!, 1e-9)
        assertEquals(80, a.battery)
        assertEquals(2, a.batteryStatus) // "Charging" label survives the round-trip
        assertEquals("deer, \"big\" <antlers>", a.note) // JSON escaping round-trips
        val b = result.rows[1]
        assertEquals(3, b.batteryStatus) // "Full"
        assertNull(b.note) // absent note stays null
    }

    @Test
    fun `round-trips a single-point export (still a MultiPoint) back into one row`() {
        val rows = listOf(
            mapOf<String, Any?>(
                "latitude" to 40.0, "longitude" to -3.0, "timestamp" to 1_700_000_000L,
                "accuracy" to 12, "battery" to 55, "battery_status" to 1L, "note" to "solo",
            ),
        )

        val json = ExportConverters.convert("geojson", rows)
        assertTrue("a single point must still export as a MultiPoint", json.contains("\"MultiPoint\""))

        val result = GeoJsonParser.parse(json.byteInputStream(), cancelled, nowSec)
        assertEquals(0, result.invalid)
        assertEquals(1, result.rows.size)
        val r = result.rows[0]
        assertEquals(40.0, r.latitude, 1e-9)
        assertEquals(-3.0, r.longitude, 1e-9)
        assertEquals(12, r.accuracy)
        assertEquals(55, r.battery)
        assertEquals(1, r.batteryStatus) // "Unplugged/Discharging"
        assertEquals("solo", r.note)
    }

    @Test
    fun `maps every battery_status label, Overland alias and numeric code back to its code`() {
        // Colota labels (Unknown/Unplugged-Discharging/Charging/Full), an Overland-style alias, a raw
        // numeric code, and an unrecognised label (-> null). Exercises readBatteryStatus's leniency.
        val json = """
            {
              "type": "FeatureCollection",
              "features": [
                {
                  "type": "Feature",
                  "geometry": { "type": "MultiPoint", "coordinates": [ [1.0,1.0],[2.0,1.0],[3.0,1.0],[4.0,1.0],[5.0,1.0],[6.0,1.0],[7.0,1.0] ] },
                  "properties": {
                    "time": ["2024-01-01T12:00:00.000Z","2024-01-01T12:00:00.000Z","2024-01-01T12:00:00.000Z","2024-01-01T12:00:00.000Z","2024-01-01T12:00:00.000Z","2024-01-01T12:00:00.000Z","2024-01-01T12:00:00.000Z"],
                    "battery_status": ["Unknown","Unplugged/Discharging","Charging","Full","unplugged",1,"nonsense"]
                  }
                }
              ]
            }
        """.trimIndent()

        val result = GeoJsonParser.parse(json.byteInputStream(), cancelled, nowSec)
        assertEquals(0, result.invalid)
        assertEquals(listOf(0, 1, 2, 3, 1, 1, null), result.rows.map { it.batteryStatus })
    }

    @Test
    fun `rejects features without a recognised time`() {
        val json = """
            {
              "type": "FeatureCollection",
              "features": [
                {
                  "type": "Feature",
                  "geometry": { "type": "Point", "coordinates": [1.0, 2.0] },
                  "properties": {}
                }
              ]
            }
        """.trimIndent()

        val result = GeoJsonParser.parse(json.byteInputStream(), cancelled, nowSec)
        assertEquals(1, result.invalid)
        assertTrue(result.rows.isEmpty())
    }

    @Test
    fun `rejects non-Point geometries`() {
        val json = """
            {
              "type": "FeatureCollection",
              "features": [
                {
                  "type": "Feature",
                  "geometry": { "type": "LineString", "coordinates": [[1,2],[3,4]] },
                  "properties": { "time": "2024-01-01T00:00:00.000Z" }
                }
              ]
            }
        """.trimIndent()

        val result = GeoJsonParser.parse(json.byteInputStream(), cancelled, nowSec)
        assertEquals(1, result.invalid)
        assertTrue(result.rows.isEmpty())
    }

    @Test
    fun `rejects future-dated features beyond clock-skew window`() {
        val futureTs = nowSec + 24 * 60 * 60
        val json = """
            {
              "type": "FeatureCollection",
              "features": [
                {
                  "type": "Feature",
                  "geometry": { "type": "Point", "coordinates": [1.0, 2.0] },
                  "properties": { "time": $futureTs }
                }
              ]
            }
        """.trimIndent()

        val result = GeoJsonParser.parse(json.byteInputStream(), cancelled, nowSec)
        assertEquals("future-dated row must be invalid", 1, result.invalid)
        assertTrue(result.rows.isEmpty())
    }

    @Test
    fun `accepts timestamps within 5 minute clock-skew window`() {
        val nearFuture = nowSec + 60
        val json = """
            {
              "type": "FeatureCollection",
              "features": [
                {
                  "type": "Feature",
                  "geometry": { "type": "Point", "coordinates": [1.0, 2.0] },
                  "properties": { "time": $nearFuture }
                }
              ]
            }
        """.trimIndent()

        val result = GeoJsonParser.parse(json.byteInputStream(), cancelled, nowSec)
        assertEquals(0, result.invalid)
        assertEquals(1, result.rows.size)
    }

    @Test
    fun `tolerates extra top-level keys and unknown property fields`() {
        val json = """
            {
              "type": "FeatureCollection",
              "name": "exotic-export",
              "crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:EPSG::4326" } },
              "features": [
                {
                  "type": "Feature",
                  "id": 42,
                  "geometry": { "type": "Point", "coordinates": [1.0, 2.0, 100.0] },
                  "properties": {
                    "time": "2024-01-01T00:00:00.000Z",
                    "unrecognised": "value",
                    "nested": { "ignored": true }
                  }
                }
              ]
            }
        """.trimIndent()

        val result = GeoJsonParser.parse(json.byteInputStream(), cancelled, nowSec)
        assertEquals(0, result.invalid)
        assertEquals(1, result.rows.size)
    }

    @Test
    fun `parseIso8601Seconds handles fractional and non-fractional forms`() {
        assertEquals(1_704_110_400L, parseIso8601Seconds("2024-01-01T12:00:00.000Z"))
        assertEquals(1_704_110_400L, parseIso8601Seconds("2024-01-01T12:00:00Z"))
        assertNull(parseIso8601Seconds("not a date"))
    }

    @Test
    fun `cancellation flag interrupts parse`() {
        val json = buildString {
            append("{\"type\":\"FeatureCollection\",\"features\":[")
            for (i in 0 until 1000) {
                if (i > 0) append(",")
                append("""{"type":"Feature","geometry":{"type":"Point","coordinates":[1.0,2.0]},"properties":{"time":"2024-01-01T00:00:00.000Z"}}""")
            }
            append("]}")
        }
        val flag = AtomicBoolean(true) // pre-set to cancelled
        try {
            GeoJsonParser.parse(json.byteInputStream(), flag, nowSec)
        } catch (e: InterruptedException) {
            assertNotNull("cancellation must surface as InterruptedException", e.message)
            return
        }
        throw AssertionError("expected InterruptedException")
    }
}
