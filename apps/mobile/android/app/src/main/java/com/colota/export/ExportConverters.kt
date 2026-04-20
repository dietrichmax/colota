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

/** Spools KML LineString coords to a temp file to avoid OOM on large exports. */
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

    const val PAGE_SIZE = 10_000

    private fun isoTime(unixSeconds: Long): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date(unixSeconds * 1000))
    }

    private fun jsonValue(value: Any?): String = when (value) {
        null -> "null"
        is String -> "\"${escapeJson(value)}\""
        else -> value.toString()
    }

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

    private data class ExportRow(
        val ts: Long,
        val lat: Double,
        val lon: Double,
        val altitude: Any?,
        val accuracy: Any?,
        val speed: Any?,
        val battery: Any?,
    ) {
        companion object {
            fun from(row: Map<String, Any?>): ExportRow = ExportRow(
                ts = (row["timestamp"] as? Long) ?: (System.currentTimeMillis() / 1000),
                lat = (row["latitude"] as? Double) ?: 0.0,
                lon = (row["longitude"] as? Double) ?: 0.0,
                altitude = row["altitude"],
                accuracy = row["accuracy"],
                speed = row["speed"],
                battery = row["battery"],
            )
        }
    }

    private sealed class FormatWriter(val extension: String, val mimeType: String) {
        abstract fun writeHeader(w: Writer)
        abstract fun writeRow(w: Writer, row: ExportRow, globalIndex: Int, kml: KmlCoordsCollector?)
        abstract fun writeFooter(w: Writer, kml: KmlCoordsCollector?)
        open val usesKmlCoords: Boolean = false

        fun writeRows(w: Writer, rows: List<ExportRow>, globalOffset: Int, kml: KmlCoordsCollector?) {
            rows.forEachIndexed { i, row -> writeRow(w, row, globalOffset + i, kml) }
        }
    }

    private object CsvFormat : FormatWriter(".csv", "text/csv") {
        override fun writeHeader(w: Writer) {
            w.write("id,timestamp,iso_time,latitude,longitude,accuracy,altitude,speed,battery\n")
        }
        override fun writeRow(w: Writer, row: ExportRow, globalIndex: Int, kml: KmlCoordsCollector?) {
            w.write(listOf(
                globalIndex, row.ts, isoTime(row.ts), row.lat, row.lon,
                row.accuracy ?: 0, row.altitude ?: 0, row.speed ?: 0, row.battery ?: 0
            ).joinToString(","))
            w.write("\n")
        }
        override fun writeFooter(w: Writer, kml: KmlCoordsCollector?) {}
    }

    private object GeoJsonFormat : FormatWriter(".geojson", "application/json") {
        override fun writeHeader(w: Writer) {
            w.write("{\n  \"type\": \"FeatureCollection\",\n  \"features\": [\n")
        }
        override fun writeRow(w: Writer, row: ExportRow, globalIndex: Int, kml: KmlCoordsCollector?) {
            if (globalIndex > 0) w.write(",\n")
            w.write("""    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [${row.lon}, ${row.lat}]
      },
      "properties": {
        "id": $globalIndex,
        "accuracy": ${jsonValue(row.accuracy)},
        "altitude": ${jsonValue(row.altitude)},
        "speed": ${jsonValue(row.speed)},
        "battery": ${jsonValue(row.battery)},
        "time": "${isoTime(row.ts)}"
      }
    }""")
        }
        override fun writeFooter(w: Writer, kml: KmlCoordsCollector?) {
            w.write("\n  ]\n}\n")
        }
    }

    private object GpxFormat : FormatWriter(".gpx", "application/gpx+xml") {
        override fun writeHeader(w: Writer) {
            w.write("""<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Colota" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Colota Location Export</name>
    <time>${isoTime(System.currentTimeMillis() / 1000)}</time>
  </metadata>
  <trk>
    <name>Colota Track Export</name>
    <trkseg>
""")
        }
        override fun writeRow(w: Writer, row: ExportRow, globalIndex: Int, kml: KmlCoordsCollector?) {
            val lat = String.format(Locale.US, "%.6f", row.lat)
            val lon = String.format(Locale.US, "%.6f", row.lon)
            w.write("""      <trkpt lat="$lat" lon="$lon">
        <ele>${row.altitude ?: 0}</ele>
        <time>${isoTime(row.ts)}</time>
        <extensions>
          <accuracy>${row.accuracy ?: 0}</accuracy>
          <speed>${row.speed ?: 0}</speed>
          <battery>${row.battery ?: 0}</battery>
        </extensions>
      </trkpt>
""")
        }
        override fun writeFooter(w: Writer, kml: KmlCoordsCollector?) {
            w.write("""    </trkseg>
  </trk>
</gpx>
""")
        }
    }

    private object KmlFormat : FormatWriter(".kml", "application/vnd.google-earth.kml+xml") {
        override val usesKmlCoords: Boolean = true
        override fun writeHeader(w: Writer) {
            w.write("""<?xml version="1.0" encoding="UTF-8"?>
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
        }
        override fun writeRow(w: Writer, row: ExportRow, globalIndex: Int, kml: KmlCoordsCollector?) {
            kml?.add("${row.lon},${row.lat},${row.altitude ?: 0}")
            w.write("""    <Placemark>
      <TimeStamp><when>${isoTime(row.ts)}</when></TimeStamp>
      <description>Accuracy: ${row.accuracy ?: 0}m, Speed: ${row.speed ?: 0}m/s</description>
      <Point>
        <coordinates>${row.lon},${row.lat},${row.altitude ?: 0}</coordinates>
      </Point>
    </Placemark>
""")
        }
        override fun writeFooter(w: Writer, kml: KmlCoordsCollector?) {
            w.write("""    <Placemark>
      <name>Track Path</name>
      <styleUrl>#pathStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          """)
            kml?.writeTo(w)
            w.write("""
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>
""")
        }
    }

    private fun forFormat(format: String): FormatWriter = when (format) {
        "csv" -> CsvFormat
        "geojson" -> GeoJsonFormat
        "gpx" -> GpxFormat
        "kml" -> KmlFormat
        else -> throw IllegalArgumentException("Unknown export format: $format")
    }

    /**
     * Streams a paginated export to file. On cancellation mid-write the footer
     * is skipped and the partial row count is returned; file cleanup is the
     * caller's job.
     */
    fun exportToFile(
        format: String,
        outputFile: File,
        pageSize: Int = PAGE_SIZE,
        shouldCancel: () -> Boolean = { false },
        fetchPage: (limit: Int, offset: Int) -> List<Map<String, Any?>>
    ): Int {
        val writer = forFormat(format)
        val coordsCollector = if (writer.usesKmlCoords) KmlCoordsCollector(outputFile.parentFile!!) else null
        var totalRows = 0
        var offset = 0
        var cancelled = false

        coordsCollector.use {
            OutputStreamWriter(outputFile.outputStream(), Charsets.UTF_8).use { w ->
                writer.writeHeader(w)

                while (true) {
                    if (shouldCancel()) { cancelled = true; break }
                    val page = fetchPage(pageSize, offset)
                    if (page.isEmpty()) break
                    writer.writeRows(w, page.map(ExportRow::from), offset, coordsCollector)
                    totalRows += page.size
                    offset += pageSize
                }

                if (!cancelled) writer.writeFooter(w, coordsCollector)
            }
        }
        return totalRows
    }

    fun exportToFile(db: DatabaseHelper, format: String, outputFile: File, pageSize: Int = PAGE_SIZE): Int =
        exportToFile(format, outputFile, pageSize) { limit, offset ->
            db.getLocationsChronological(limit, offset)
        }

    fun writeHeader(writer: Writer, format: String) {
        forFormat(format).writeHeader(writer)
    }

    /** `coordsCollector` is required for KML (spills LineString coords to disk). */
    fun writeRows(
        writer: Writer,
        format: String,
        rows: List<Map<String, Any?>>,
        globalOffset: Int,
        coordsCollector: KmlCoordsCollector?
    ) {
        forFormat(format).writeRows(writer, rows.map(ExportRow::from), globalOffset, coordsCollector)
    }

    fun writeFooter(writer: Writer, format: String, coordsCollector: KmlCoordsCollector?) {
        forFormat(format).writeFooter(writer, coordsCollector)
    }

    fun convert(format: String, rows: List<Map<String, Any?>>): String {
        val writer = forFormat(format)
        val sw = java.io.StringWriter()
        val coordsCollector = if (writer.usesKmlCoords) {
            KmlCoordsCollector(java.io.File(System.getProperty("java.io.tmpdir")!!))
        } else null

        coordsCollector.use {
            writer.writeHeader(sw)
            writer.writeRows(sw, rows.map(ExportRow::from), 0, coordsCollector)
            writer.writeFooter(sw, coordsCollector)
        }
        return sw.toString()
    }

    fun extensionFor(format: String): String = when (format) {
        "csv", "geojson", "gpx", "kml" -> forFormat(format).extension
        else -> ".txt"
    }

    fun mimeTypeFor(format: String): String = when (format) {
        "csv", "geojson", "gpx", "kml" -> forFormat(format).mimeType
        else -> "text/plain"
    }
}
