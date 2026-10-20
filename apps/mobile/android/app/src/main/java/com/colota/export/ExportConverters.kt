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
import java.util.Locale

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

    private data class ExportRow(
        val ts: Long,
        val lat: Double,
        val lon: Double,
        val altitude: Any?,
        val accuracy: Any?,
        val speed: Any?,
        val bearing: Any?,
        val battery: Any?,
        val batteryStatus: Any?,
        val note: String?,
    ) {
        companion object {
            fun from(row: Map<String, Any?>): ExportRow = ExportRow(
                ts = (row["timestamp"] as? Long) ?: (System.currentTimeMillis() / 1000),
                lat = (row["latitude"] as? Double) ?: 0.0,
                lon = (row["longitude"] as? Double) ?: 0.0,
                altitude = row["altitude"],
                accuracy = row["accuracy"],
                speed = row["speed"],
                bearing = row["bearing"],
                battery = row["battery"],
                batteryStatus = row["battery_status"],
                note = row["note"] as? String,
            )
        }
    }

    private sealed class FormatWriter(val extension: String, val mimeType: String) {
        abstract fun writeHeader(w: Writer)
        abstract fun writeRow(w: Writer, row: ExportRow, globalIndex: Int, sink: AutoCloseable?)
        abstract fun writeFooter(w: Writer, sink: AutoCloseable?)
        /** Disk side channel for formats that spool (KML coords, GeoJSON columns); null otherwise. */
        open fun newSideChannel(cacheDir: File): AutoCloseable? = null

        fun writeRows(w: Writer, rows: List<ExportRow>, globalOffset: Int, sink: AutoCloseable?) {
            rows.forEachIndexed { i, row -> writeRow(w, row, globalOffset + i, sink) }
        }
    }

    private object CsvFormat : FormatWriter(".csv", "text/csv") {
        override fun writeHeader(w: Writer) {
            w.write("id,timestamp,iso_time,latitude,longitude,accuracy,altitude,speed,bearing,battery,battery_status,note\n")
        }
        override fun writeRow(w: Writer, row: ExportRow, globalIndex: Int, sink: AutoCloseable?) {
            w.write(listOf(
                globalIndex, row.ts, isoTime(row.ts), jsNum(row.lat), jsNum(row.lon),
                numOrZero(row.accuracy), numOrZero(row.altitude), numOrZero(row.speed), numOrZero(row.bearing), numOrZero(row.battery),
                batteryStatusLabel(row.batteryStatus) ?: "", csvField(row.note)
            ).joinToString(","))
            w.write("\n")
        }
        override fun writeFooter(w: Writer, sink: AutoCloseable?) {}
    }

    /**
     * One Point feature per location, which is what every GIS reads. The whole export used to be a
     * single MultiPoint feature with the properties as parallel arrays: legal GeoJSON, but only
     * Colota's own parser understood it. GDAL reports such a file as one feature with every
     * attribute an opaque JSON string, and refuses it outright past `OGR_GEOJSON_MAX_OBJ_SIZE`,
     * which defaults to 200 MB and a full database exceeds.
     *
     * A self-contained feature also streams more simply than the columnar shape did: nothing has to
     * spool to disk and splice in at the footer, and memory stays O(1) without a side channel.
     */
    private object GeoJsonFormat : FormatWriter(".geojson", "application/geo+json") {
        override fun writeHeader(w: Writer) {
            w.write("{\n  \"type\": \"FeatureCollection\",\n  \"features\": [")
        }
        override fun writeRow(w: Writer, row: ExportRow, globalIndex: Int, sink: AutoCloseable?) {
            if (globalIndex > 0) w.write(",")
            w.write("\n    {\n      \"type\": \"Feature\",\n      \"geometry\": {\n        \"type\": \"Point\",")
            w.write("\n        \"coordinates\": [${jsNum(row.lon)}, ${jsNum(row.lat)}]\n      },")
            w.write("\n      \"properties\": {")
            // A null property is omitted rather than written, so a reader gets no field instead of a
            // null one, and the file loses the columns that are empty for most rows.
            val props = mutableListOf<String>()
            fun put(key: String, value: String) {
                if (value != "null") props.add("\"$key\": $value")
            }
            put("time", "\"${isoTime(row.ts)}\"")
            put("accuracy", jsonValue(row.accuracy))
            put("altitude", jsonValue(row.altitude))
            put("speed", jsonValue(row.speed))
            put("bearing", jsonValue(row.bearing))
            put("battery", jsonValue(row.battery))
            put("battery_status", jsonValue(batteryStatusLabel(row.batteryStatus)))
            put("note", jsonValue(row.note))
            w.write(props.joinToString(", ", "\n        ", "\n      }\n    }"))
        }
        override fun writeFooter(w: Writer, sink: AutoCloseable?) {
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
        override fun writeRow(w: Writer, row: ExportRow, globalIndex: Int, sink: AutoCloseable?) {
            val lat = String.format(Locale.US, "%.6f", row.lat)
            val lon = String.format(Locale.US, "%.6f", row.lon)
            w.write("""      <trkpt lat="$lat" lon="$lon">
        <ele>${numOrZero(row.altitude)}</ele>
        <time>${isoTime(row.ts)}</time>
        <extensions>
          <accuracy>${numOrZero(row.accuracy)}</accuracy>
          <speed>${numOrZero(row.speed)}</speed>
          <bearing>${numOrZero(row.bearing)}</bearing>
          <battery>${numOrZero(row.battery)}</battery>
          <battery_status>${batteryStatusLabel(row.batteryStatus) ?: ""}</battery_status>
          <note>${row.note?.let { xmlEscape(it) } ?: ""}</note>
        </extensions>
      </trkpt>
""")
        }
        override fun writeFooter(w: Writer, sink: AutoCloseable?) {
            w.write("""    </trkseg>
  </trk>
</gpx>
""")
        }
    }

    private object KmlFormat : FormatWriter(".kml", "application/vnd.google-earth.kml+xml") {
        override fun newSideChannel(cacheDir: File): AutoCloseable = KmlCoordsCollector(cacheDir)
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
        override fun writeRow(w: Writer, row: ExportRow, globalIndex: Int, sink: AutoCloseable?) {
            (sink as? KmlCoordsCollector)?.add("${jsNum(row.lon)},${jsNum(row.lat)},${numOrZero(row.altitude)}")
            w.write("""    <Placemark>
      <TimeStamp><when>${isoTime(row.ts)}</when></TimeStamp>
      <description>Accuracy: ${numOrZero(row.accuracy)}m, Speed: ${numOrZero(row.speed)}m/s</description>
      <ExtendedData>
        <Data name="accuracy"><value>${numOrZero(row.accuracy)}</value></Data>
        <Data name="altitude"><value>${numOrZero(row.altitude)}</value></Data>
        <Data name="speed"><value>${numOrZero(row.speed)}</value></Data>
        <Data name="bearing"><value>${numOrZero(row.bearing)}</value></Data>
        <Data name="battery"><value>${numOrZero(row.battery)}</value></Data>
        <Data name="battery_status"><value>${batteryStatusLabel(row.batteryStatus) ?: ""}</value></Data>
        <Data name="note"><value>${row.note?.let { xmlEscape(it) } ?: ""}</value></Data>
      </ExtendedData>
      <Point>
        <coordinates>${jsNum(row.lon)},${jsNum(row.lat)},${numOrZero(row.altitude)}</coordinates>
      </Point>
    </Placemark>
""")
        }
        override fun writeFooter(w: Writer, sink: AutoCloseable?) {
            w.write("""    <Placemark>
      <name>Track Path</name>
      <styleUrl>#pathStyle</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
          """)
            (sink as? KmlCoordsCollector)?.writeTo(w)
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
     * caller's job. A page read that throws deletes the file and propagates, so
     * a failed export never looks complete.
     */
    fun exportToFile(
        format: String,
        outputFile: File,
        pageSize: Int = PAGE_SIZE,
        shouldCancel: () -> Boolean = { false },
        fetchPage: (limit: Int, offset: Int) -> List<Map<String, Any?>>
    ): Int {
        val writer = forFormat(format)
        val sink = writer.newSideChannel(outputFile.parentFile!!)
        var totalRows = 0
        var offset = 0
        var cancelled = false

        try {
            sink.use {
                OutputStreamWriter(outputFile.outputStream(), Charsets.UTF_8).use { w ->
                    writer.writeHeader(w)

                    while (true) {
                        if (shouldCancel()) { cancelled = true; break }
                        val page = fetchPage(pageSize, offset)
                        if (page.isEmpty()) break
                        writer.writeRows(w, page.map(ExportRow::from), offset, sink)
                        totalRows += page.size
                        offset += pageSize
                    }

                    if (!cancelled) writer.writeFooter(w, sink)
                }
            }
        } catch (e: Exception) {
            outputFile.delete()
            throw e
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

    /** Opens the disk side channel for [format]; null for formats that don't spool. */
    fun newSideChannel(format: String, cacheDir: File): AutoCloseable? =
        forFormat(format).newSideChannel(cacheDir)

    /** `sink` comes from [newSideChannel]; null for formats that don't spool. */
    fun writeRows(
        writer: Writer,
        format: String,
        rows: List<Map<String, Any?>>,
        globalOffset: Int,
        sink: AutoCloseable?
    ) {
        forFormat(format).writeRows(writer, rows.map(ExportRow::from), globalOffset, sink)
    }

    fun writeFooter(writer: Writer, format: String, sink: AutoCloseable?) {
        forFormat(format).writeFooter(writer, sink)
    }

    fun convert(format: String, rows: List<Map<String, Any?>>): String {
        val writer = forFormat(format)
        val sw = java.io.StringWriter()
        val sink = writer.newSideChannel(java.io.File(System.getProperty("java.io.tmpdir")!!))

        sink.use {
            writer.writeHeader(sw)
            writer.writeRows(sw, rows.map(ExportRow::from), 0, sink)
            writer.writeFooter(sw, sink)
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
