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
import java.util.concurrent.atomic.AtomicBoolean

@RunWith(RobolectricTestRunner::class)
class GoogleTimelineParserTest {

    private val cancelled = AtomicBoolean(false)
    private val nowSec = 1_750_000_000L

    @Test
    fun `parses legacy Takeout Records dot json`() {
        val json = """
            {
              "locations": [
                {
                  "latitudeE7": 525000000,
                  "longitudeE7": 134000000,
                  "timestampMs": "1704110400000",
                  "accuracy": 10,
                  "altitude": 30,
                  "velocity": 2
                }
              ]
            }
        """.trimIndent()

        val result = GoogleTimelineParser.parse(json.byteInputStream(), cancelled, nowSec)
        assertEquals(1, result.rows.size)
        val row = result.rows[0]
        assertEquals(52.5, row.latitude, 1e-7)
        assertEquals(13.4, row.longitude, 1e-7)
        assertEquals(1_704_110_400L, row.timestamp)
        assertEquals(10, row.accuracy)
        assertEquals(30, row.altitude)
        assertEquals(2, row.speed)
    }

    @Test
    fun `legacy parser tolerates timestamp as ISO string field`() {
        val json = """
            {
              "locations": [
                {
                  "latitudeE7": 525000000,
                  "longitudeE7": 134000000,
                  "timestamp": "2024-01-01T12:00:00Z"
                }
              ]
            }
        """.trimIndent()

        val result = GoogleTimelineParser.parse(json.byteInputStream(), cancelled, nowSec)
        assertEquals(1, result.rows.size)
        assertEquals(1_704_110_400L, result.rows[0].timestamp)
    }

    @Test
    fun `parses new on-device timeline rawSignals`() {
        val json = """
            {
              "rawSignals": [
                {
                  "position": {
                    "LatLng": "52.500000°,13.400000°",
                    "accuracyMeters": 8,
                    "altitudeMeters": 25,
                    "source": "WIFI",
                    "timestamp": "2024-01-01T12:00:00.000Z"
                  }
                }
              ]
            }
        """.trimIndent()

        val result = GoogleTimelineParser.parse(json.byteInputStream(), cancelled, nowSec)
        assertEquals(1, result.rows.size)
        val row = result.rows[0]
        assertEquals(52.5, row.latitude, 1e-7)
        assertEquals(13.4, row.longitude, 1e-7)
        assertEquals(8, row.accuracy)
        assertEquals(25, row.altitude)
        assertEquals(1_704_110_400L, row.timestamp)
    }

    @Test
    fun `rawSignals position captures speedMetersPerSecond`() {
        val json = """
            {
              "rawSignals": [
                {
                  "position": {
                    "LatLng": "52.5°,13.4°",
                    "timestamp": "2024-01-01T12:00:00Z",
                    "speedMetersPerSecond": 7.2
                  }
                }
              ]
            }
        """.trimIndent()

        val result = GoogleTimelineParser.parse(json.byteInputStream(), cancelled, nowSec)
        assertEquals(1, result.rows.size)
        assertEquals(7, result.rows[0].speed)
    }

    @Test
    fun `parses new timeline semanticSegments timelinePath waypoints`() {
        // semanticSegments also carries `visit` / `activity` blocks; walk past them.
        val json = """
            {
              "semanticSegments": [
                {
                  "startTime": "2024-01-01T00:00:00Z",
                  "endTime": "2024-01-01T01:00:00Z",
                  "timelinePath": [
                    { "point": "52.5°,13.4°", "time": "2024-01-01T00:30:00Z" },
                    { "point": "52.51°,13.41°", "time": "2024-01-01T00:45:00Z" }
                  ]
                },
                {
                  "startTime": "2024-01-01T02:00:00Z",
                  "endTime": "2024-01-01T03:00:00Z",
                  "visit": { "topCandidate": { "placeLocation": { "latLng": "52.5°,13.4°" } } }
                }
              ]
            }
        """.trimIndent()

        val result = GoogleTimelineParser.parse(json.byteInputStream(), cancelled, nowSec)
        assertEquals(2, result.rows.size)
        assertEquals(52.5, result.rows[0].latitude, 1e-7)
        assertEquals(52.51, result.rows[1].latitude, 1e-7)
    }

    @Test
    fun `parseLatLngString handles degree suffixes and whitespace`() {
        assertEquals(52.5 to 13.4, GoogleTimelineParser.parseLatLngString("52.5°,13.4°"))
        assertEquals(52.5 to 13.4, GoogleTimelineParser.parseLatLngString("52.5 , 13.4"))
        assertEquals(-33.86 to 151.21, GoogleTimelineParser.parseLatLngString("-33.86°, 151.21°"))
        assertNull(GoogleTimelineParser.parseLatLngString("not coordinates"))
        assertNull(GoogleTimelineParser.parseLatLngString("52.5"))
    }

    @Test
    fun `legacy parser drops malformed entries but continues`() {
        val json = """
            {
              "locations": [
                { "latitudeE7": 525000000, "longitudeE7": 134000000, "timestampMs": "1704110400000" },
                { "latitudeE7": 525000000 },
                { "latitudeE7": 525000000, "longitudeE7": 134000000, "timestampMs": "1704110500000" }
              ]
            }
        """.trimIndent()

        val result = GoogleTimelineParser.parse(json.byteInputStream(), cancelled, nowSec)
        assertEquals(2, result.rows.size)
        assertEquals(1, result.invalid)
    }

    @Test
    fun `cancellation interrupts mid-array`() {
        val json = buildString {
            append("{\"locations\":[")
            for (i in 0 until 1000) {
                if (i > 0) append(",")
                append("""{"latitudeE7":525000000,"longitudeE7":134000000,"timestampMs":"1704110400000"}""")
            }
            append("]}")
        }
        val flag = AtomicBoolean(true)
        try {
            GoogleTimelineParser.parse(json.byteInputStream(), flag, nowSec)
        } catch (e: InterruptedException) {
            assertNotNull(e.message)
            return
        }
        throw AssertionError("expected InterruptedException")
    }
}
