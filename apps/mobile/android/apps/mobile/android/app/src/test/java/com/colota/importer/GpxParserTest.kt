/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.importer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.concurrent.atomic.AtomicBoolean

@RunWith(RobolectricTestRunner::class)
class GpxParserTest {

    private val cancelled = AtomicBoolean(false)
    private val nowSec = 1_750_000_000L

    @Test
    fun `parses Colota GPX export with track-points and extensions`() {
        // Mirrors apps/mobile/android/app/src/main/java/com/colota/export/ExportConverters.kt
        // GpxFormat output: trkpt with ele/time/extensions for accuracy/speed/battery.
        val gpx = """
            <?xml version="1.0" encoding="UTF-8"?>
            <gpx version="1.1" creator="Colota">
              <trk>
                <name>Test</name>
                <trkseg>
                  <trkpt lat="52.500000" lon="13.400000">
                    <ele>30</ele>
                    <time>2024-01-01T12:00:00.000Z</time>
                    <extensions>
                      <accuracy>5</accuracy>
                      <speed>2</speed>
                      <battery>80</battery>
                    </extensions>
                  </trkpt>
                </trkseg>
              </trk>
            </gpx>
        """.trimIndent()

        val result = GpxParser.parse(gpx.byteInputStream(), cancelled, nowSec)
        assertEquals(0, result.invalid)
        assertEquals(1, result.rows.size)
        val row = result.rows[0]
        assertEquals(52.5, row.latitude, 1e-9)
        assertEquals(13.4, row.longitude, 1e-9)
        assertEquals(1_704_110_400L, row.timestamp)
        assertEquals(30, row.altitude)
        assertEquals(5, row.accuracy)
        assertEquals(2, row.speed)
        assertEquals(80, row.battery)
    }

    @Test
    fun `parses GPX waypoints and track-points together`() {
        // Real GPX files mix wpt (standalone), rte/rtept, trk/trkseg/trkpt. The semantic
        // distinction (planned route vs recorded track) doesn't survive into the flat
        // locations table - we collect them all.
        val gpx = """
            <?xml version="1.0" encoding="UTF-8"?>
            <gpx version="1.1">
              <wpt lat="52.5" lon="13.4">
                <time>2024-01-01T12:00:00Z</time>
              </wpt>
              <trk>
                <trkseg>
                  <trkpt lat="52.6" lon="13.5">
                    <time>2024-01-01T12:01:00Z</time>
                  </trkpt>
                </trkseg>
              </trk>
            </gpx>
        """.trimIndent()

        val result = GpxParser.parse(gpx.byteInputStream(), cancelled, nowSec)
        assertEquals(2, result.rows.size)
        assertEquals(52.5, result.rows[0].latitude, 1e-9)
        assertEquals(52.6, result.rows[1].latitude, 1e-9)
    }

    @Test
    fun `parses Garmin TrackPointExtension nested namespaced extensions`() {
        // Sport watches commonly use the GPX 1.1 TrackPointExtension wrapper - the
        // parser must recurse into it to find leaf elements like <gpxtpx:speed>.
        val gpx = """
            <?xml version="1.0" encoding="UTF-8"?>
            <gpx version="1.1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
              <trk><trkseg>
                <trkpt lat="52.5" lon="13.4">
                  <time>2024-01-01T12:00:00Z</time>
                  <extensions>
                    <gpxtpx:TrackPointExtension>
                      <gpxtpx:speed>3.5</gpxtpx:speed>
                      <gpxtpx:course>180.0</gpxtpx:course>
                    </gpxtpx:TrackPointExtension>
                  </extensions>
                </trkpt>
              </trkseg></trk>
            </gpx>
        """.trimIndent()

        val result = GpxParser.parse(gpx.byteInputStream(), cancelled, nowSec)
        assertEquals(1, result.rows.size)
        assertEquals(3, result.rows[0].speed)
        assertEquals(180.0, result.rows[0].bearing!!, 1e-9)
    }

    @Test
    fun `drops trkpt without time as invalid`() {
        // Time is required for the locations table; a trkpt missing it is unusable.
        val gpx = """
            <?xml version="1.0" encoding="UTF-8"?>
            <gpx version="1.1">
              <trk><trkseg>
                <trkpt lat="52.5" lon="13.4"><ele>30</ele></trkpt>
              </trkseg></trk>
            </gpx>
        """.trimIndent()

        val result = GpxParser.parse(gpx.byteInputStream(), cancelled, nowSec)
        assertEquals(1, result.invalid)
        assertTrue(result.rows.isEmpty())
    }

    @Test
    fun `cancellation flag interrupts parse`() {
        val gpx = "<?xml version=\"1.0\"?><gpx><trk><trkseg>" +
            "<trkpt lat=\"1\" lon=\"1\"><time>2024-01-01T00:00:00Z</time></trkpt>".repeat(1000) +
            "</trkseg></trk></gpx>"
        try {
            GpxParser.parse(gpx.byteInputStream(), AtomicBoolean(true), nowSec)
        } catch (_: InterruptedException) {
            return
        }
        throw AssertionError("expected InterruptedException")
    }
}
