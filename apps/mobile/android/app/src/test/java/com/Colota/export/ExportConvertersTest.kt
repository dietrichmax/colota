package com.Colota.export

import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.StringWriter

class ExportConvertersTest {

    @get:Rule
    val tempFolder = TemporaryFolder()

    // Doubles for REAL columns / Long for INTEGER columns, mirroring real DB cursor types
    // so the tests exercise the JS-style number formatting (whole doubles drop ".0").
    private val sampleRows: List<Map<String, Any?>> = listOf(
        mapOf("latitude" to 52.52, "longitude" to 13.405, "accuracy" to 10.0, "altitude" to 34.0, "speed" to 1.2, "bearing" to 180.0, "battery" to 85L, "battery_status" to 2L, "timestamp" to 1700000000L),
        mapOf("latitude" to 48.8566, "longitude" to 2.3522, "accuracy" to 15.0, "altitude" to 40.0, "speed" to 0.5, "bearing" to 90.0, "battery" to 72L, "battery_status" to 1L, "timestamp" to 1700003600L)
    )

    // --- extensionFor ---

    @Test
    fun `extensionFor returns correct extensions`() {
        assertEquals(".csv", ExportConverters.extensionFor("csv"))
        assertEquals(".geojson", ExportConverters.extensionFor("geojson"))
        assertEquals(".gpx", ExportConverters.extensionFor("gpx"))
        assertEquals(".kml", ExportConverters.extensionFor("kml"))
        assertEquals(".txt", ExportConverters.extensionFor("unknown"))
    }

    // --- mimeTypeFor ---

    @Test
    fun `mimeTypeFor returns correct mime types`() {
        assertEquals("text/csv", ExportConverters.mimeTypeFor("csv"))
        assertEquals("application/json", ExportConverters.mimeTypeFor("geojson"))
        assertEquals("application/gpx+xml", ExportConverters.mimeTypeFor("gpx"))
        assertEquals("application/vnd.google-earth.kml+xml", ExportConverters.mimeTypeFor("kml"))
        assertEquals("text/plain", ExportConverters.mimeTypeFor("unknown"))
    }

    // --- convert (delegates to streaming API) ---

    @Test
    fun `convert dispatches to correct format`() {
        val csv = ExportConverters.convert("csv", sampleRows)
        assertTrue(csv.startsWith("id,timestamp,"))

        val geojson = ExportConverters.convert("geojson", sampleRows)
        assertTrue(geojson.contains("FeatureCollection"))

        val gpx = ExportConverters.convert("gpx", sampleRows)
        assertTrue(gpx.contains("<gpx"))

        val kml = ExportConverters.convert("kml", sampleRows)
        assertTrue(kml.contains("<kml"))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `convert throws for unknown format`() {
        ExportConverters.convert("xml", sampleRows)
    }

    // --- CSV ---

    @Test
    fun `convert CSV contains header row`() {
        val csv = ExportConverters.convert("csv", sampleRows)
        val lines = csv.lines()
        assertEquals("id,timestamp,iso_time,latitude,longitude,accuracy,altitude,speed,bearing,battery,battery_status,note", lines[0])
    }

    @Test
    fun `convert CSV contains correct data rows`() {
        val csv = ExportConverters.convert("csv", sampleRows)
        val lines = csv.lines().filter { it.isNotBlank() }
        assertEquals(3, lines.size) // header + 2 data rows
        assertTrue(lines[1].startsWith("0,1700000000,"))
        assertTrue(lines[1].contains("52.52"))
        assertTrue(lines[1].contains("13.405"))
    }

    @Test
    fun `convert CSV handles empty input`() {
        val csv = ExportConverters.convert("csv", emptyList())
        val lines = csv.lines().filter { it.isNotBlank() }
        assertEquals(1, lines.size) // header only
    }

    // --- GeoJSON ---

    @Test
    fun `convert GeoJSON produces valid structure`() {
        val json = ExportConverters.convert("geojson", sampleRows)
        assertTrue(json.contains("\"type\": \"FeatureCollection\""))
        assertTrue(json.contains("\"type\": \"Feature\""))
        assertTrue(json.contains("\"type\": \"Point\""))
    }

    @Test
    fun `convert GeoJSON contains coordinates in lon-lat order`() {
        val json = ExportConverters.convert("geojson", sampleRows)
        assertTrue(json.contains("[13.405, 52.52]"))
    }

    @Test
    fun `convert GeoJSON contains properties`() {
        val json = ExportConverters.convert("geojson", sampleRows)
        assertTrue(json.contains("\"accuracy\": 10"))
        assertTrue(json.contains("\"speed\": 1.2"))
        assertTrue(json.contains("\"battery\": 85"))
    }

    // --- GPX ---

    @Test
    fun `convert GPX contains XML header and gpx root`() {
        val gpx = ExportConverters.convert("gpx", sampleRows)
        assertTrue(gpx.startsWith("<?xml version=\"1.0\""))
        assertTrue(gpx.contains("<gpx version=\"1.1\""))
    }

    @Test
    fun `convert GPX contains track points with coordinates`() {
        val gpx = ExportConverters.convert("gpx", sampleRows)
        assertTrue(gpx.contains("<trkpt lat=\"52.520000\" lon=\"13.405000\">"))
        assertTrue(gpx.contains("<trkpt lat=\"48.856600\" lon=\"2.352200\">"))
    }

    @Test
    fun `convert GPX contains elevation and time`() {
        val gpx = ExportConverters.convert("gpx", sampleRows)
        assertTrue(gpx.contains("<ele>34</ele>"))
        assertTrue(gpx.contains("<time>"))
    }

    // --- KML ---

    @Test
    fun `convert KML contains XML header and kml root`() {
        val kml = ExportConverters.convert("kml", sampleRows)
        assertTrue(kml.startsWith("<?xml version=\"1.0\""))
        assertTrue(kml.contains("<kml xmlns="))
    }

    @Test
    fun `convert KML contains LineString coordinates`() {
        val kml = ExportConverters.convert("kml", sampleRows)
        assertTrue(kml.contains("<LineString>"))
        assertTrue(kml.contains("13.405,52.52,34"))
        assertTrue(kml.contains("2.3522,48.8566,40"))
    }

    @Test
    fun `convert KML contains individual placemarks`() {
        val kml = ExportConverters.convert("kml", sampleRows)
        val placemarkCount = Regex("<Placemark>").findAll(kml).count()
        assertEquals(3, placemarkCount) // 1 track + 2 point placemarks
    }

    // --- Note annotation (#257) ---

    // A note with every char that needs escaping in some format (comma, quotes, angle brackets,
    // ampersand, newline), so a dropped-escaping regression fails here instead of corrupting exports.
    private val noteRows = listOf(
        mapOf(
            "latitude" to 52.52, "longitude" to 13.405, "timestamp" to 1700000000L,
            "note" to "deer, \"big\" <antlers> & a\nnewline"
        ),
        mapOf("latitude" to 48.8566, "longitude" to 2.3522, "timestamp" to 1700003600L)
    )

    @Test
    fun `CSV quotes a note containing commas quotes and newlines`() {
        val csv = ExportConverters.convert("csv", noteRows)
        assertTrue(csv.contains("\"deer, \"\"big\"\" <antlers> & a\nnewline\""))
    }

    @Test
    fun `GeoJSON JSON-escapes the note and emits null when absent`() {
        val json = ExportConverters.convert("geojson", noteRows)
        assertTrue(json.contains("\\\"big\\\""))
        assertTrue(json.contains("\"note\": null")) // the second point has no note
    }

    @Test
    fun `GPX writes an XML-escaped note in extensions, empty when absent`() {
        val gpx = ExportConverters.convert("gpx", noteRows)
        assertTrue(gpx.contains("<note>deer, &quot;big&quot; &lt;antlers&gt; &amp; a\nnewline</note>"))
        assertTrue(gpx.contains("<note></note>")) // empty for the point without a note
        assertEquals(2, Regex("<note>").findAll(gpx).count()) // one per point, like the other extensions
    }

    @Test
    fun `KML writes an escaped note Data entry, empty when absent`() {
        val kml = ExportConverters.convert("kml", noteRows)
        assertTrue(kml.contains("&lt;antlers&gt;"))
        // note Data sits in the existing per-point ExtendedData, like battery_status
        assertEquals(2, Regex("<Data name=\"note\">").findAll(kml).count())
    }

    // --- JSON escaping ---

    @Test
    fun `convert GeoJSON escapes quotes in string values`() {
        val rows = listOf(mapOf<String, Any?>(
            "latitude" to 52.0, "longitude" to 13.0, "timestamp" to 1700000000L,
            "accuracy" to "test\"quoted\"value"
        ))
        val json = ExportConverters.convert("geojson", rows)
        assertTrue(json.contains("test\\\"quoted\\\"value"))
    }

    @Test
    fun `convert GeoJSON escapes backslashes`() {
        val rows = listOf(mapOf<String, Any?>(
            "latitude" to 52.0, "longitude" to 13.0, "timestamp" to 1700000000L,
            "accuracy" to "path\\to\\file"
        ))
        val json = ExportConverters.convert("geojson", rows)
        assertTrue(json.contains("path\\\\to\\\\file"))
    }

    @Test
    fun `convert GeoJSON escapes newlines and control characters`() {
        val rows = listOf(mapOf<String, Any?>(
            "latitude" to 52.0, "longitude" to 13.0, "timestamp" to 1700000000L,
            "accuracy" to "line1\nline2\ttab"
        ))
        val json = ExportConverters.convert("geojson", rows)
        assertTrue(json.contains("line1\\nline2\\ttab"))
    }

    // --- Number formatting (jsNum parity) ---

    @Test
    fun `whole doubles strip trailing dot-zero and fractional values round-trip`() {
        // Whole doubles must strip ".0" exactly (deterministic). Fractional values only need to
        // round-trip; byte-identity with JS for arbitrary doubles is best-effort (Double.toString,
        // not separately verified on ART).
        val csv = ExportConverters.convert("csv", listOf(mapOf<String, Any?>(
            "latitude" to 48.137154123, "longitude" to 11.5761249, "timestamp" to 1700000000L,
            "accuracy" to 5.0, "altitude" to 100.0, "speed" to 12.0, "bearing" to 359.9,
            "battery" to 80L, "battery_status" to 2L
        )))
        val cols = csv.lines()[1].split(",")
        // id,timestamp,iso_time,latitude,longitude,accuracy,altitude,speed,bearing,battery,battery_status
        assertEquals("5", cols[5])    // accuracy 5.0  -> no ".0"
        assertEquals("100", cols[6])  // altitude 100.0 -> no ".0"
        assertEquals("12", cols[7])   // speed 12.0    -> no ".0"
        assertEquals(48.137154123, cols[3].toDouble(), 0.0)  // messy lat round-trips
        assertEquals(11.5761249, cols[4].toDouble(), 0.0)    // messy lon round-trips
        assertEquals(359.9, cols[8].toDouble(), 0.0)         // fractional bearing round-trips
    }

    // --- Null handling ---

    @Test
    fun `convert handles missing fields gracefully`() {
        val sparse = listOf(mapOf<String, Any?>("latitude" to 52.0, "longitude" to 13.0, "timestamp" to 1700000000L))

        // Should not throw
        for (format in listOf("csv", "geojson", "gpx", "kml")) {
            ExportConverters.convert(format, sparse)
        }
    }

    // --- Streaming interface ---

    private fun streamToString(format: String, rows: List<Map<String, Any?>>, chunks: List<List<Map<String, Any?>>>? = null): String {
        val writer = StringWriter()
        val coordsCollector = if (format == "kml") KmlCoordsCollector(tempFolder.root) else null
        coordsCollector.use {
            ExportConverters.writeHeader(writer, format)
            if (chunks != null) {
                var offset = 0
                for (chunk in chunks) {
                    ExportConverters.writeRows(writer, format, chunk, offset, coordsCollector)
                    offset += chunk.size
                }
            } else {
                ExportConverters.writeRows(writer, format, rows, 0, coordsCollector)
            }
            ExportConverters.writeFooter(writer, format, coordsCollector)
        }
        return writer.toString()
    }

    @Test
    fun `streaming CSV produces header and data rows`() {
        val result = streamToString("csv", sampleRows)
        val lines = result.lines().filter { it.isNotBlank() }
        assertEquals("id,timestamp,iso_time,latitude,longitude,accuracy,altitude,speed,bearing,battery,battery_status,note", lines[0])
        assertEquals(3, lines.size)
        assertTrue(lines[1].startsWith("0,1700000000,"))
        assertTrue(lines[1].contains("52.52"))
    }

    @Test
    fun `streaming GeoJSON produces valid structure`() {
        val result = streamToString("geojson", sampleRows)
        assertTrue(result.contains("\"type\": \"FeatureCollection\""))
        assertTrue(result.contains("\"type\": \"Feature\""))
        assertTrue(result.contains("[13.405, 52.52]"))
    }

    @Test
    fun `streaming GPX produces valid XML`() {
        val result = streamToString("gpx", sampleRows)
        assertTrue(result.contains("<?xml version=\"1.0\""))
        assertTrue(result.contains("<trkpt lat=\"52.520000\" lon=\"13.405000\">"))
        assertTrue(result.contains("</trkseg>"))
        assertTrue(result.trimEnd().endsWith("</gpx>"))
    }

    @Test
    fun `streaming KML collects coords and writes LineString in footer`() {
        val result = streamToString("kml", sampleRows)
        assertTrue(result.contains("<kml xmlns="))
        assertTrue(result.contains("<LineString>"))
        assertTrue(result.contains("13.405,52.52,34"))
        // Point placemarks written inline
        val placemarkCount = Regex("<Placemark>").findAll(result).count()
        assertEquals(3, placemarkCount) // 2 point placemarks + 1 LineString placemark
        assertTrue(result.trimEnd().endsWith("</kml>"))
    }

    @Test
    fun `streaming with multiple chunks produces correct output`() {
        val chunk1 = listOf(sampleRows[0])
        val chunk2 = listOf(sampleRows[1])

        val csvResult = streamToString("csv", emptyList(), chunks = listOf(chunk1, chunk2))
        val csvLines = csvResult.lines().filter { it.isNotBlank() }
        assertEquals(3, csvLines.size)
        assertTrue(csvLines[1].startsWith("0,"))
        assertTrue(csvLines[2].startsWith("1,"))

        val geojsonResult = streamToString("geojson", emptyList(), chunks = listOf(chunk1, chunk2))
        assertTrue(geojsonResult.contains("\"id\": 0"))
        assertTrue(geojsonResult.contains("\"id\": 1"))

        val gpxResult = streamToString("gpx", emptyList(), chunks = listOf(chunk1, chunk2))
        assertTrue(gpxResult.contains("lat=\"52.520000\""))
        assertTrue(gpxResult.contains("lat=\"48.856600\""))

        val kmlResult = streamToString("kml", emptyList(), chunks = listOf(chunk1, chunk2))
        assertTrue(kmlResult.contains("13.405,52.52,34"))
        assertTrue(kmlResult.contains("2.3522,48.8566,40"))
    }

    @Test
    fun `streaming with empty rows produces valid structure`() {
        for (format in listOf("csv", "geojson", "gpx", "kml")) {
            val result = streamToString(format, emptyList())
            assertTrue("$format should produce non-empty output", result.isNotBlank())
        }

        val csvResult = streamToString("csv", emptyList())
        val csvLines = csvResult.lines().filter { it.isNotBlank() }
        assertEquals(1, csvLines.size) // header only

        val geojsonResult = streamToString("geojson", emptyList())
        assertTrue(geojsonResult.contains("FeatureCollection"))
    }

    @Test
    fun `streaming handles missing fields gracefully`() {
        val sparse = listOf(mapOf<String, Any?>("latitude" to 52.0, "longitude" to 13.0, "timestamp" to 1700000000L))
        for (format in listOf("csv", "geojson", "gpx", "kml")) {
            // Should not throw
            streamToString(format, sparse)
        }
    }

    @Test(expected = IllegalArgumentException::class)
    fun `writeHeader throws for unknown format`() {
        ExportConverters.writeHeader(StringWriter(), "xml")
    }

    @Test
    fun `convert includes bearing and battery_status across formats`() {
        val csv = ExportConverters.convert("csv", sampleRows)
        assertTrue(csv.lines()[1].endsWith(",Charging,")) // battery_status label, then empty note (last column)
        val gj = ExportConverters.convert("geojson", sampleRows)
        assertTrue(gj.contains("\"bearing\": 180")) // whole double -> no trailing ".0"
        assertTrue(gj.contains("\"battery_status\": \"Charging\""))
        val gpx = ExportConverters.convert("gpx", sampleRows)
        assertTrue(gpx.contains("<bearing>180</bearing>"))
        assertTrue(gpx.contains("<battery_status>Charging</battery_status>"))
        val kml = ExportConverters.convert("kml", sampleRows)
        assertTrue(kml.contains("<Data name=\"bearing\"><value>180</value></Data>"))
        assertTrue(kml.contains("<Data name=\"battery_status\"><value>Charging</value></Data>"))
    }

    // Golden files in src/test/resources/golden/export/ pin the trip output. Structure/formatting
    // was captured from the JS serializer before the port; battery_status and KML <ExtendedData>
    // were added by hand afterwards (PR F) - the JS never emitted those. So: JS-derived-then-
    // extended, not raw JS output. convertTrips must reproduce them.

    /** Mirrors the original JS golden-capture fixture, plus battery_status. */
    private val tripFixture = listOf(
        ExportConverters.TripExport(1, "#3B82F6", listOf(
            mapOf("latitude" to 48.137154, "longitude" to 11.576124, "timestamp" to 1700000000L, "accuracy" to 8.5, "altitude" to 520.2, "speed" to 1.4, "bearing" to 270.5, "battery" to 91L, "battery_status" to 2L),
            mapOf("latitude" to 48.138001, "longitude" to 11.577003, "timestamp" to 1700000060L, "accuracy" to 12.0, "altitude" to 525.0, "speed" to 2.0, "bearing" to 275.0, "battery" to 90L, "battery_status" to 3L)
        )),
        ExportConverters.TripExport(2, "#10B981", listOf(
            mapOf("latitude" to 48.14, "longitude" to 11.58, "timestamp" to 1700001000L, "accuracy" to 5.0, "altitude" to 530.0, "speed" to 3.0, "bearing" to 10.0, "battery" to 88L, "battery_status" to 1L),
            mapOf("latitude" to 48.1405, "longitude" to 11.5811, "timestamp" to 1700001060L, "accuracy" to 6.2, "altitude" to 0.0, "speed" to 0.0, "bearing" to 0.0, "battery" to 87L, "battery_status" to 0L)
        ))
    )

    private fun golden(name: String): String =
        javaClass.getResource("/golden/export/$name")!!.readText()

    /** Normalize CRLF and the non-deterministic GPX <metadata> export time. */
    private fun norm(s: String): String =
        s.replace("\r\n", "\n").replace(Regex("(?s)(<metadata>.*?<time>).*?(</time>)"), "$1NORM$2")

    @Test
    fun `convertTrips csv matches JS golden`() {
        assertEquals(norm(golden("trip.csv")), norm(ExportConverters.convertTrips("csv", tripFixture)))
    }

    @Test
    fun `convertTrips geojson matches JS golden`() {
        assertEquals(norm(golden("trip.geojson")), norm(ExportConverters.convertTrips("geojson", tripFixture)))
    }

    @Test
    fun `convertTrips gpx matches JS golden`() {
        assertEquals(norm(golden("trip.gpx")), norm(ExportConverters.convertTrips("gpx", tripFixture)))
    }

    @Test
    fun `convertTrips kml matches JS golden`() {
        assertEquals(norm(golden("trip.kml")), norm(ExportConverters.convertTrips("kml", tripFixture)))
    }

    @Test
    fun `convertTrips writes the note in every format and escapes per format`() {
        // Trip serializers are separate from the flat writers and the golden fixture is note-free,
        // so cover note placement and per-format escaping here.
        val trips = listOf(ExportConverters.TripExport(1, "#3B82F6", listOf(
            mapOf("latitude" to 52.52, "longitude" to 13.405, "timestamp" to 1700000000L, "note" to "deer, \"big\" <antlers>"),
            mapOf("latitude" to 48.8566, "longitude" to 2.3522, "timestamp" to 1700003600L)
        )))
        val csv = ExportConverters.convertTrips("csv", trips)
        assertTrue(csv.contains("\"deer, \"\"big\"\" <antlers>\""))
        val gj = ExportConverters.convertTrips("geojson", trips)
        assertTrue(gj.contains("\\\"big\\\""))
        assertTrue(gj.contains("\"note\": null")) // the second point has no note
        val gpx = ExportConverters.convertTrips("gpx", trips)
        assertTrue(gpx.contains("<note>deer, &quot;big&quot; &lt;antlers&gt;</note>"))
        assertTrue(gpx.contains("<note></note>"))
        assertEquals(2, Regex("<note>").findAll(gpx).count())
        val kml = ExportConverters.convertTrips("kml", trips)
        assertTrue(kml.contains("&lt;antlers&gt;"))
        assertEquals(2, Regex("<Data name=\"note\">").findAll(kml).count())
    }

    // --- Trip-export edge cases (no trips / empty trip) ---

    @Test
    fun `convertTrips with no trips produces valid empty output`() {
        assertEquals(
            "trip,id,timestamp,iso_time,latitude,longitude,accuracy,altitude,speed,bearing,battery,battery_status,note",
            ExportConverters.convertTrips("csv", emptyList()).trim()
        )
        assertTrue(ExportConverters.convertTrips("geojson", emptyList()).contains("\"features\": []"))
        val gpx = ExportConverters.convertTrips("gpx", emptyList())
        assertTrue(gpx.startsWith("<?xml") && gpx.trimEnd().endsWith("</gpx>"))
        assertTrue(ExportConverters.convertTrips("kml", emptyList()).trimEnd().endsWith("</kml>"))
    }

    @Test
    fun `convertTrips with an empty trip emits no points and stays well-formed`() {
        val trips = listOf(ExportConverters.TripExport(1, "#3B82F6", emptyList()))
        assertEquals(1, ExportConverters.convertTrips("csv", trips).lines().filter { it.isNotBlank() }.size)
        assertTrue(ExportConverters.convertTrips("geojson", trips).contains("\"features\": []"))
        // GPX/KML still open the trip's track/folder with no points inside; just verify it stays well-formed
        val gpx = ExportConverters.convertTrips("gpx", trips)
        assertTrue(gpx.contains("<name>Trip 1</name>") && gpx.trimEnd().endsWith("</gpx>"))
        val kml = ExportConverters.convertTrips("kml", trips)
        assertTrue(kml.contains("<name>Trip 1</name>") && kml.trimEnd().endsWith("</kml>"))
    }
}
