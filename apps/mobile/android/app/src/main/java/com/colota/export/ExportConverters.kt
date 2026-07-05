/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.export

import com.Colota.data.DatabaseHelper
import com.Colota.util.BatteryStatus
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

/** Spools the property columns to temp files (they trail the coords in the JSON) so large exports stay O(1) memory, like [KmlCoordsCollector]. */
class GeoJsonColumnSpooler(cacheDir: File, private val columns: List<String>) : AutoCloseable {
    // Per-instance name so two exports in the same dir don't share temp files.
    private val files = columns.associateWith { File(cacheDir, "geojson_col_${System.identityHashCode(this)}_$it.txt") }
    private val writers = files.mapValues { BufferedWriter(FileWriter(it.value)) }
    var count = 0
        private set

    /** `tokens`: pre-formatted JSON values, one per column in [columns] order. */
    fun addRow(tokens: List<String>) {
        columns.forEachIndexed { i, name ->
            val w = writers.getValue(name)
            w.write(tokens[i])
            w.newLine()
        }
        count++
    }

    fun writeProperties(w: Writer) {
        writers.values.forEach { it.close() }
        columns.forEachIndexed { idx, name ->
            // Stream each token straight to the output (like KmlCoordsCollector.writeTo) rather than
            // building the whole column string first, so peak memory is one token, not one column.
            w.write("        \"$name\": [")
            var first = true
            BufferedReader(FileReader(files.getValue(name))).use { reader ->
                reader.forEachLine { line ->
                    if (!first) w.write(", ")
                    w.write(line)
                    first = false
                }
            }
            w.write("]")
            w.write(if (idx < columns.size - 1) ",\n" else "\n")
        }
    }

    override fun close() {
        writers.values.forEach { try { it.close() } catch (_: Exception) {} }
        files.values.forEach { it.delete() }
    }
}

object ExportConverters {

    const val PAGE_SIZE = 10_000

    /** Filename-safe stamp for export files (e.g. `2026-05-28_1430`). */
    fun exportFilenameStamp(): String =
        SimpleDateFormat("yyyy-MM-dd_HHmm", Locale.US).format(Date())

    private fun isoTime(unixSeconds: Long): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date(unixSeconds * 1000))
    }

    private fun jsonValue(value: Any?): String = when (value) {
        null -> "null"
        is String -> "\"${escapeJson(value)}\""
        is Double, is Float -> jsNum(value)
        else -> value.toString()
    }

    /** Human-readable battery-status label for exports; null if not recorded. */
    private fun batteryStatusLabel(v: Any?): String? = when (v) {
        is Long -> BatteryStatus.toDisplayString(v.toInt())
        is Int -> BatteryStatus.toDisplayString(v)
        is Double -> BatteryStatus.toDisplayString(v.toInt())
        else -> null
    }

    /** Escape free text for XML element content (GPX/KML notes). */
    private fun xmlEscape(s: String): String = buildString(s.length) {
        for (c in s) {
            when (c) {
                '&' -> append("&amp;")
                '<' -> append("&lt;")
                '>' -> append("&gt;")
                '"' -> append("&quot;")
                '\'' -> append("&apos;")
                else -> append(c)
            }
        }
    }

    /** RFC-4180 CSV field: quote+double-escape only when the value contains a delimiter. */
    private fun csvField(value: Any?): String {
        val s = value?.toString() ?: return ""
        return if (s.any { it == ',' || it == '"' || it == '\n' || it == '\r' }) {
            "\"" + s.replace("\"", "\"\"") + "\""
        } else {
            s
        }
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

    // The whole export is one MultiPoint feature: coords stream inline while the property columns
    // (parallel arrays, index-aligned to coords) spool to disk and splice in at the footer, keeping memory O(1).
    private object GeoJsonFormat : FormatWriter(".geojson", "application/json") {
        private val COLUMNS = listOf("accuracy", "altitude", "speed", "bearing", "battery", "battery_status", "note", "time")

        override fun newSideChannel(cacheDir: File): AutoCloseable = GeoJsonColumnSpooler(cacheDir, COLUMNS)

        override fun writeHeader(w: Writer) {
            w.write("{\n  \"type\": \"FeatureCollection\",\n  \"features\": [")
        }
        override fun writeRow(w: Writer, row: ExportRow, globalIndex: Int, sink: AutoCloseable?) {
            val coord = "[${jsNum(row.lon)}, ${jsNum(row.lat)}]"
            if (globalIndex == 0) {
                w.write("\n    {\n      \"type\": \"Feature\",\n      \"geometry\": {\n        \"type\": \"MultiPoint\",\n        \"coordinates\": [\n          $coord")
            } else {
                w.write(",\n          $coord")
            }
            // Order must match COLUMNS.
            (sink as? GeoJsonColumnSpooler)?.addRow(listOf(
                jsonValue(row.accuracy),
                jsonValue(row.altitude),
                jsonValue(row.speed),
                jsonValue(row.bearing),
                jsonValue(row.battery),
                jsonValue(batteryStatusLabel(row.batteryStatus)),
                jsonValue(row.note),
                "\"${isoTime(row.ts)}\"",
            ))
        }
        override fun writeFooter(w: Writer, sink: AutoCloseable?) {
            val spool = sink as? GeoJsonColumnSpooler
            if (spool == null || spool.count == 0) {
                // No points: keep it a valid, empty FeatureCollection rather than an empty MultiPoint.
                w.write("]\n}\n")
                return
            }
            w.write("\n        ]\n      },\n      \"properties\": {\n")
            spool.writeProperties(w)
            w.write("      }\n    }\n  ]\n}\n")
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
        val sink = writer.newSideChannel(outputFile.parentFile!!)
        var totalRows = 0
        var offset = 0
        var cancelled = false

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

    // Trip-segmented export (one track/folder per trip), separate from the flat
    // FormatWriter above. Ports the former JS TRIP_CONVERTERS; parity pinned by golden tests.

    /** color is a #RRGGBB hex supplied by JS (getTripColor), not computed here. */
    data class TripExport(val index: Int, val color: String, val rows: List<Map<String, Any?>>)

    /** Match JS number formatting: whole-valued doubles drop the trailing ".0". */
    private fun jsNum(v: Any): String = when (v) {
        is Double -> if (v.isFinite() && v == Math.floor(v) && kotlin.math.abs(v) < 1e15) v.toLong().toString() else v.toString()
        is Float -> jsNum(v.toDouble())
        else -> v.toString()
    }

    /** Numeric field with a `0` default for null (mirrors JS `?? 0` / `|| 0`). */
    private fun numOrZero(v: Any?): String = if (v == null) "0" else jsNum(v)

    /** GeoJSON property value: `null` stays `null` (JSON), otherwise JS-formatted number. */
    private fun jsonNum(v: Any?): String = if (v == null) "null" else jsNum(v)

    private fun asDouble(v: Any?): Double = when (v) {
        is Double -> v
        is Float -> v.toDouble()
        is Long -> v.toDouble()
        is Int -> v.toDouble()
        else -> 0.0
    }

    /** Hex RGB (#RRGGBB) -> KML ABGR (ffBBGGRR). */
    private fun hexToKmlColor(hex: String): String {
        val h = hex.removePrefix("#")
        if (h.length < 6) return "ff0000ff"
        return "ff${h.substring(4, 6)}${h.substring(2, 4)}${h.substring(0, 2)}"
    }

    private fun rowTs(row: Map<String, Any?>): Long =
        (row["timestamp"] as? Long) ?: (System.currentTimeMillis() / 1000)

    fun convertTrips(format: String, trips: List<TripExport>): String = when (format) {
        "csv" -> tripsToCsv(trips)
        "geojson" -> tripsToGeoJson(trips)
        "gpx" -> tripsToGpx(trips)
        "kml" -> tripsToKml(trips)
        else -> throw IllegalArgumentException("Unknown export format: $format")
    }

    private fun tripsToCsv(trips: List<TripExport>): String {
        val sb = StringBuilder("trip,id,timestamp,iso_time,latitude,longitude,accuracy,altitude,speed,bearing,battery,battery_status,note\n")
        val rows = ArrayList<String>()
        for (trip in trips) {
            trip.rows.forEachIndexed { i, row ->
                val ts = rowTs(row)
                rows.add(
                    listOf(
                        trip.index.toString(), i.toString(), ts.toString(), isoTime(ts),
                        numOrZero(row["latitude"]), numOrZero(row["longitude"]),
                        numOrZero(row["accuracy"]), numOrZero(row["altitude"]),
                        numOrZero(row["speed"]), numOrZero(row["bearing"]), numOrZero(row["battery"]),
                        batteryStatusLabel(row["battery_status"]) ?: "", csvField(row["note"])
                    ).joinToString(",")
                )
            }
        }
        sb.append(rows.joinToString("\n"))
        return sb.toString()
    }

    // One MultiPoint feature per trip. In-memory (not spooled like the flat export) is fine - trips are day-sized.
    private fun tripsToGeoJson(trips: List<TripExport>): String {
        val features = ArrayList<String>()
        for (trip in trips) {
            if (trip.rows.isEmpty()) continue
            val coords = trip.rows.joinToString(",\n          ") {
                "[${numOrZero(it["longitude"])}, ${numOrZero(it["latitude"])}]"
            }
            fun col(transform: (Map<String, Any?>) -> String) = trip.rows.joinToString(", ", transform = transform)
            features.add(
                "    {\n" +
                "      \"type\": \"Feature\",\n" +
                "      \"geometry\": {\n" +
                "        \"type\": \"MultiPoint\",\n" +
                "        \"coordinates\": [\n" +
                "          $coords\n" +
                "        ]\n" +
                "      },\n" +
                "      \"properties\": {\n" +
                "        \"trip\": ${trip.index},\n" +
                "        \"accuracy\": [${col { jsonNum(it["accuracy"]) }}],\n" +
                "        \"altitude\": [${col { jsonNum(it["altitude"]) }}],\n" +
                "        \"speed\": [${col { jsonNum(it["speed"]) }}],\n" +
                "        \"bearing\": [${col { jsonNum(it["bearing"]) }}],\n" +
                "        \"battery\": [${col { jsonNum(it["battery"]) }}],\n" +
                "        \"battery_status\": [${col { jsonValue(batteryStatusLabel(it["battery_status"])) }}],\n" +
                "        \"note\": [${col { jsonValue(it["note"]) }}],\n" +
                "        \"time\": [${col { "\"${isoTime(rowTs(it))}\"" }}]\n" +
                "      }\n" +
                "    }"
            )
        }
        val featuresBlock = if (features.isEmpty()) "[]" else "[\n${features.joinToString(",\n")}\n  ]"
        return "{\n  \"type\": \"FeatureCollection\",\n  \"features\": $featuresBlock\n}"
    }

    private fun tripsToGpx(trips: List<TripExport>): String {
        val sb = StringBuilder()
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
        sb.append("<gpx version=\"1.1\" creator=\"Colota\" xmlns=\"http://www.topografix.com/GPX/1/1\">\n")
        sb.append("  <metadata>\n")
        sb.append("    <name>Colota Trip Export</name>\n")
        sb.append("    <time>${isoTime(System.currentTimeMillis() / 1000)}</time>\n")
        sb.append("  </metadata>")
        for (trip in trips) {
            sb.append("\n  <trk>\n    <name>Trip ${trip.index}</name>\n    <trkseg>")
            for (row in trip.rows) {
                val ts = rowTs(row)
                val lat = String.format(Locale.US, "%.6f", asDouble(row["latitude"]))
                val lon = String.format(Locale.US, "%.6f", asDouble(row["longitude"]))
                sb.append("\n      <trkpt lat=\"$lat\" lon=\"$lon\">")
                sb.append("\n        <ele>${numOrZero(row["altitude"])}</ele>")
                sb.append("\n        <time>${isoTime(ts)}</time>")
                sb.append("\n        <extensions>")
                sb.append("\n          <accuracy>${numOrZero(row["accuracy"])}</accuracy>")
                sb.append("\n          <speed>${numOrZero(row["speed"])}</speed>")
                sb.append("\n          <bearing>${numOrZero(row["bearing"])}</bearing>")
                sb.append("\n          <battery>${numOrZero(row["battery"])}</battery>")
                sb.append("\n          <battery_status>${batteryStatusLabel(row["battery_status"]) ?: ""}</battery_status>")
                sb.append("\n          <note>${(row["note"] as? String)?.let { xmlEscape(it) } ?: ""}</note>")
                sb.append("\n        </extensions>")
                sb.append("\n      </trkpt>")
            }
            sb.append("\n    </trkseg>\n  </trk>")
        }
        sb.append("\n</gpx>")
        return sb.toString()
    }

    private fun tripsToKml(trips: List<TripExport>): String {
        val sb = StringBuilder()
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
        sb.append("<kml xmlns=\"http://www.opengis.net/kml/2.2\">\n")
        sb.append("  <Document>\n")
        sb.append("    <name>Colota Trip Export</name>\n")
        sb.append("    <description>Exported trips from Colota</description>")
        for (trip in trips) {
            val styleId = "tripStyle${trip.index}"
            val coords = trip.rows.joinToString("\n            ") {
                "${numOrZero(it["longitude"])},${numOrZero(it["latitude"])},${numOrZero(it["altitude"])}"
            }
            sb.append("\n    <Style id=\"$styleId\">")
            sb.append("\n      <LineStyle>")
            sb.append("\n        <color>${hexToKmlColor(trip.color)}</color>")
            sb.append("\n        <width>4</width>")
            sb.append("\n      </LineStyle>")
            sb.append("\n    </Style>")
            sb.append("\n    <Folder>")
            sb.append("\n      <name>Trip ${trip.index}</name>")
            sb.append("\n      <Placemark>")
            sb.append("\n        <name>Trip ${trip.index} Path</name>")
            sb.append("\n        <styleUrl>#$styleId</styleUrl>")
            sb.append("\n        <LineString>")
            sb.append("\n          <tessellate>1</tessellate>")
            sb.append("\n          <coordinates>")
            sb.append("\n            $coords")
            sb.append("\n          </coordinates>")
            sb.append("\n        </LineString>")
            sb.append("\n      </Placemark>")
            for (row in trip.rows) {
                val ts = rowTs(row)
                sb.append("\n      <Placemark>")
                sb.append("\n        <TimeStamp><when>${isoTime(ts)}</when></TimeStamp>")
                sb.append("\n        <description>Trip ${trip.index} - Accuracy: ${numOrZero(row["accuracy"])}m, Speed: ${numOrZero(row["speed"])}m/s</description>")
                sb.append("\n        <ExtendedData>")
                sb.append("\n          <Data name=\"accuracy\"><value>${numOrZero(row["accuracy"])}</value></Data>")
                sb.append("\n          <Data name=\"altitude\"><value>${numOrZero(row["altitude"])}</value></Data>")
                sb.append("\n          <Data name=\"speed\"><value>${numOrZero(row["speed"])}</value></Data>")
                sb.append("\n          <Data name=\"bearing\"><value>${numOrZero(row["bearing"])}</value></Data>")
                sb.append("\n          <Data name=\"battery\"><value>${numOrZero(row["battery"])}</value></Data>")
                sb.append("\n          <Data name=\"battery_status\"><value>${batteryStatusLabel(row["battery_status"]) ?: ""}</value></Data>")
                sb.append("\n          <Data name=\"note\"><value>${(row["note"] as? String)?.let { xmlEscape(it) } ?: ""}</value></Data>")
                sb.append("\n        </ExtendedData>")
                sb.append("\n        <Point>")
                sb.append("\n          <coordinates>${numOrZero(row["longitude"])},${numOrZero(row["latitude"])},${numOrZero(row["altitude"])}</coordinates>")
                sb.append("\n        </Point>")
                sb.append("\n      </Placemark>")
            }
            sb.append("\n    </Folder>")
        }
        sb.append("\n  </Document>\n</kml>")
        return sb.toString()
    }
}
