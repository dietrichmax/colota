/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.importer

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
