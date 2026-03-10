/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.export

import com.Colota.data.DatabaseHelper
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.File
import java.io.FileReader
import java.io.FileWriter
import java.io.OutputStreamWriter
import java.io.Writer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Native export converters for location data.
 * Used by AutoExportWorker (background) and manual export (via bridge).
 *
 * Streaming API (writeHeader/writeRows/writeFooter) for memory-efficient
 * chunked export. The in-memory convert() delegates to the streaming API.
 */
/**
 * File-backed collector for KML LineString coordinates.
 * Writes coordinates to a temp file instead of accumulating in memory,
 * preventing OOM on large exports.
 */
class KmlCoordsCollector(cacheDir: File) : AutoCloseable {
    private val tempFile = File(cacheDir, "kml_coords_temp.txt")
    private val writer = BufferedWriter(FileWriter(tempFile))

    fun add(coord: String) {
        writer.write(coord)
        writer.newLine()
    }

    fun writeTo(writer: Writer) {
        this.writer.close()
        BufferedReader(FileReader(tempFile)).use { reader ->
            var first = true
            reader.forEachLine { line ->
                if (!first) writer.write("\n          ")
                writer.write(line)
                first = false
            }
        }
    }

    override fun close() {
        try { writer.close() } catch (_: Exception) {}
        tempFile.delete()
    }
}

object ExportConverters {

    private const val PAGE_SIZE = 10_000

    private fun isoTime(unixSeconds: Long): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date(unixSeconds * 1000))
    }

    /** Formats a value as a valid JSON value (null-safe, properly escaped). */
    private fun jsonValue(value: Any?): String = when (value) {
        null -> "null"
        is String -> "\"${escapeJson(value)}\""
        else -> value.toString()
    }

    /** Escapes special characters for JSON string values. */
    private fun escapeJson(s: String): String = buildString(s.length) {
        for (c in s) {
            when (c) {
                '"' -> append("\\\"")
                '\\' -> append("\\\\")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                '\b' -> append("\\b")
                '\u000C' -> append("\\f")
                else -> if (c < ' ') append("\\u${c.code.toString(16).padStart(4, '0')}") else append(c)
            }
        }
    }

    // -- Shared chunked export to file --

    /**
     * Exports all locations from the database to a file using streaming chunks.
     * Shared between AutoExportWorker and the manual export bridge method.
     *
     * @return Number of rows exported
     */
    fun exportToFile(db: DatabaseHelper, format: String, outputFile: File, pageSize: Int = PAGE_SIZE): Int {
        val coordsCollector = if (format == "kml") KmlCoordsCollector(outputFile.parentFile!!) else null
        var totalRows = 0
        var offset = 0

        coordsCollector.use {
            OutputStreamWriter(outputFile.outputStream(), Charsets.UTF_8).use { writer ->
                writeHeader(writer, format)

                while (true) {
                    val page = db.getLocationsChronological(pageSize, offset)
                    if (page.isEmpty()) break
                    writeRows(writer, format, page, offset, coordsCollector)
                    totalRows += page.size
                    offset += pageSize
                }

                writeFooter(writer, format, coordsCollector)
            }
        }
        return totalRows
    }

    // -- Streaming interface for chunked export --

    fun writeHeader(writer: Writer, format: String) {
        when (format) {
            "csv" -> writer.write("id,timestamp,iso_time,latitude,longitude,accuracy,altitude,speed,battery\n")
            "geojson" -> writer.write("{\n  \"type\": \"FeatureCollection\",\n  \"features\": [\n")
            "gpx" -> writer.write("""<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Colota" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Colota Location Export</name>
    <time>${isoTime(System.currentTimeMillis() / 1000)}</time>
  </metadata>
  <trk>
    <name>Colota Track Export</name>
    <trkseg>
""")
            "kml" -> writer.write("""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Colota Location Export</name>
    <description>Exported tracks from Colota Tracking</description>
    <Style id="pathStyle">
      <LineStyle>
        <color>ff0000ff</color>
        <width>4</width>
      </LineStyle>
    </Style>
""")
            else -> throw IllegalArgumentException("Unknown export format: $format")
        }
    }

    /**
     * Write a chunk of rows. For KML, coordsCollector writes LineString
     * coordinates to a temp file to avoid unbounded memory growth.
     */
    fun writeRows(
        writer: Writer,
        format: String,
        rows: List<Map<String, Any?>>,
        globalOffset: Int,
        coordsCollector: KmlCoordsCollector?
    ) {
        when (format) {
            "csv" -> {
                rows.forEachIndexed { i, row ->
                    val ts = (row["timestamp"] as? Long) ?: (System.currentTimeMillis() / 1000)
                    writer.write(listOf(
                        globalOffset + i,
                        ts,
                        isoTime(ts),
                        row["latitude"] ?: 0.0,
                        row["longitude"] ?: 0.0,
                        row["accuracy"] ?: 0,
                        row["altitude"] ?: 0,
                        row["speed"] ?: 0,
                        row["battery"] ?: 0
                    ).joinToString(","))
                    writer.write("\n")
                }
            }
            "geojson" -> {
                rows.forEachIndexed { i, row ->
                    if (globalOffset + i > 0) writer.write(",\n")
                    val ts = (row["timestamp"] as? Long) ?: (System.currentTimeMillis() / 1000)
                    val lon = row["longitude"] ?: 0.0
                    val lat = row["latitude"] ?: 0.0
                    writer.write("""    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [$lon, $lat]
      },
      "properties": {
        "id": ${globalOffset + i},
        "accuracy": ${jsonValue(row["accuracy"])},
        "altitude": ${jsonValue(row["altitude"])},
        "speed": ${jsonValue(row["speed"])},
        "battery": ${jsonValue(row["battery"])},
        "time": "${isoTime(ts)}"
      }
    }""")
                }
            }
            "gpx" -> {
                for (row in rows) {
                    val ts = (row["timestamp"] as? Long) ?: (System.currentTimeMillis() / 1000)
                    val lat = (row["latitude"] as? Double)?.let { String.format(Locale.US, "%.6f", it) } ?: "0.000000"
                    val lon = (row["longitude"] as? Double)?.let { String.format(Locale.US, "%.6f", it) } ?: "0.000000"
                    writer.write("""      <trkpt lat="$lat" lon="$lon">
        <ele>${row["altitude"] ?: 0}</ele>
        <time>${isoTime(ts)}</time>
        <extensions>
          <accuracy>${row["accuracy"] ?: 0}</accuracy>
          <speed>${row["speed"] ?: 0}</speed>
          <battery>${row["battery"] ?: 0}</battery>
        </extensions>
      </trkpt>
""")
                }
            }
            "kml" -> {
                for (row in rows) {
                    coordsCollector?.add("${row["longitude"] ?: 0},${row["latitude"] ?: 0},${row["altitude"] ?: 0}")
                    val ts = (row["timestamp"] as? Long) ?: (System.currentTimeMillis() / 1000)
                    writer.write("""    <Placemark>
      <TimeStamp><when>${isoTime(ts)}</when></TimeStamp>
      <description>Accuracy: ${row["accuracy"] ?: 0}m, Speed: ${row["speed"] ?: 0}m/s</description>
      <Point>
        <coordinates>${row["longitude"] ?: 0},${row["latitude"] ?: 0},${row["altitude"] ?: 0}</coordinates>
      </Point>
    </Placemark>
""")
                }
            }
        }
    }

    fun writeFooter(writer: Writer, format: String, coordsCollector: KmlCoordsCollector?) {
        when (format) {
            "csv" -> { /* no footer */ }
            "geojson" -> writer.write("\n  ]\n}\n")
            "gpx" -> writer.write("""    </trkseg>
  </trk>
</gpx>
""")
            "kml" -> {
                writer.write("""    <Placemark>
      <name>Track Path</name>
      <styleUrl>#pathStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          """)
                coordsCollector?.writeTo(writer)
                writer.write("""
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>
""")
            }
        }
    }

    /**
     * Converts rows to the given format using the streaming API with a StringWriter.
     * Single source of truth for all format output.
     */
    fun convert(format: String, rows: List<Map<String, Any?>>): String {
        val sw = java.io.StringWriter()
        val coordsCollector = if (format == "kml") {
            // In-memory: use a temp list to collect coords (small datasets only)
            KmlCoordsCollector(java.io.File(System.getProperty("java.io.tmpdir")!!))
        } else null

        coordsCollector.use {
            writeHeader(sw, format)
            writeRows(sw, format, rows, 0, coordsCollector)
            writeFooter(sw, format, coordsCollector)
        }
        return sw.toString()
    }

    fun extensionFor(format: String): String = when (format) {
        "csv" -> ".csv"
        "geojson" -> ".geojson"
        "gpx" -> ".gpx"
        "kml" -> ".kml"
        else -> ".txt"
    }

    fun mimeTypeFor(format: String): String = when (format) {
        "csv" -> "text/csv"
        "geojson" -> "application/json"
        "gpx" -> "application/gpx+xml"
        "kml" -> "application/vnd.google-earth.kml+xml"
        else -> "text/plain"
    }
}
