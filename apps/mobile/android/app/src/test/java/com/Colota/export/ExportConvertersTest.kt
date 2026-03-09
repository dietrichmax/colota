package com.Colota.export

import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.StringWriter

class ExportConvertersTest {

    @get:Rule
    val tempFolder = TemporaryFolder()

    private val sampleRows: List<Map<String, Any?>> = listOf(
        mapOf("latitude" to 52.52, "longitude" to 13.405, "accuracy" to 10, "altitude" to 34, "speed" to 1.2, "battery" to 85, "timestamp" to 1700000000L),
        mapOf("latitude" to 48.8566, "longitude" to 2.3522, "accuracy" to 15, "altitude" to 40, "speed" to 0.5, "battery" to 72, "timestamp" to 1700003600L)
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
        assertEquals("id,timestamp,iso_time,latitude,longitude,accuracy,altitude,speed,battery", lines[0])
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
        assertEquals("id,timestamp,iso_time,latitude,longitude,accuracy,altitude,speed,battery", lines[0])
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
}
