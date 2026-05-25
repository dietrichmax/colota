/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.importer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.concurrent.atomic.AtomicBoolean

@RunWith(RobolectricTestRunner::class)
class KmlParserTest {

    private val cancelled = AtomicBoolean(false)
    private val nowSec = 1_750_000_000L

    @Test
    fun `parses Colota KML export Point Placemark with TimeStamp`() {
        // Mirrors apps/mobile/android/app/src/main/java/com/colota/export/ExportConverters.kt
        // KmlFormat output: each track sample is a Placemark with Point + TimeStamp/when.
        val kml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <kml xmlns="http://www.opengis.net/kml/2.2">
              <Document>
                <Placemark>
                  <TimeStamp><when>2024-01-01T12:00:00.000Z</when></TimeStamp>
                  <Point>
                    <coordinates>13.4,52.5,30</coordinates>
                  </Point>
                </Placemark>
              </Document>
            </kml>
        """.trimIndent()

        val result = KmlParser.parse(kml.byteInputStream(), cancelled, nowSec)
        assertEquals(0, result.invalid)
        assertEquals(1, result.rows.size)
        val row = result.rows[0]
        // KML coordinate order is lon,lat - the parser must flip it back.
        assertEquals(52.5, row.latitude, 1e-9)
        assertEquals(13.4, row.longitude, 1e-9)
        assertEquals(30, row.altitude)
        assertEquals(1_704_110_400L, row.timestamp)
    }

    @Test
    fun `skips style-only Placemarks without counting them as invalid`() {
        // Colota's KML export includes a final LineString-only Placemark for the
        // rendered track path. It has no per-point timestamp and no Point geometry;
        // dropping it shouldn't pollute the invalid counter (which the UI shows).
        val kml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <kml xmlns="http://www.opengis.net/kml/2.2">
              <Document>
                <Style id="pathStyle"><LineStyle><color>ff0000ff</color></LineStyle></Style>
                <Placemark>
                  <TimeStamp><when>2024-01-01T12:00:00Z</when></TimeStamp>
                  <Point><coordinates>13.4,52.5</coordinates></Point>
                </Placemark>
                <Placemark>
                  <name>Track Path</name>
                  <styleUrl>#pathStyle</styleUrl>
                </Placemark>
              </Document>
            </kml>
        """.trimIndent()

        val result = KmlParser.parse(kml.byteInputStream(), cancelled, nowSec)
        assertEquals(1, result.rows.size)
        assertEquals("metadata-only Placemark shouldn't count as invalid", 0, result.invalid)
    }

    @Test
    fun `drops LineString-only Placemark since vertices have no per-point time`() {
        // KML LineStrings carry a whole-line TimeSpan at best; vertex-level timestamps
        // aren't a thing in the schema. Importing the vertices would invent timestamps,
        // so we drop them. They count as invalid so the user knows data was skipped.
        val kml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <kml xmlns="http://www.opengis.net/kml/2.2">
              <Document>
                <Placemark>
                  <LineString>
                    <coordinates>13.4,52.5 13.5,52.6 13.6,52.7</coordinates>
                  </LineString>
                </Placemark>
              </Document>
            </kml>
        """.trimIndent()

        val result = KmlParser.parse(kml.byteInputStream(), cancelled, nowSec)
        assertTrue(result.rows.isEmpty())
        assertEquals("three skipped vertices counted as invalid", 3, result.invalid)
    }

    @Test
    fun `parseCoordinatesText handles whitespace-separated tuples`() {
        // KML LineString coords are whitespace-separated tuples; the spec allows
        // newlines and tab indentation between them.
        val text = """
            13.4,52.5,30
            13.5,52.6
            13.6,52.7,40
        """.trimIndent()
        val parsed = KmlParser.parseCoordinatesText(text)
        assertEquals(3, parsed.size)
        // tuples are (lat, lon, alt?) after the flip
        assertEquals(52.5 to 13.4, parsed[0].first to parsed[0].second)
        assertEquals(30, parsed[0].third)
        // missing altitude -> null
        assertEquals(52.6 to 13.5, parsed[1].first to parsed[1].second)
        assertNotNull("alt 30 should round-trip", parsed[0].third)
    }

    @Test
    fun `cancellation flag interrupts parse`() {
        val kml = """<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>""" +
            ("<Placemark><TimeStamp><when>2024-01-01T12:00:00Z</when></TimeStamp>" +
                "<Point><coordinates>13.4,52.5</coordinates></Point></Placemark>").repeat(1000) +
            "</Document></kml>"
        try {
            KmlParser.parse(kml.byteInputStream(), AtomicBoolean(true), nowSec)
        } catch (_: InterruptedException) {
            return
        }
        throw AssertionError("expected InterruptedException")
    }
}
