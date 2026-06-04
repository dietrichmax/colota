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
        abstract fun writeRow(w: Writer, row: ExportRow, globalIndex: Int, kml: KmlCoordsCollector?)
        abstract fun writeFooter(w: Writer, kml: KmlCoordsCollector?)
        open val usesKmlCoords: Boolean = false

        fun writeRows(w: Writer, rows: List<ExportRow>, globalOffset: Int, kml: KmlCoordsCollector?) {
            rows.forEachIndexed { i, row -> writeRow(w, row, globalOffset + i, kml) }
        }
    }

    private object CsvFormat : FormatWriter(".csv", "text/csv") {
        override fun writeHeader(w: Writer) {
            w.write("id,timestamp,iso_time,latitude,longitude,accuracy,altitude,speed,bearing,battery,battery_status,note\n")
        }
        override fun writeRow(w: Writer, row: ExportRow, globalIndex: Int, kml: KmlCoordsCollector?) {
            w.write(listOf(
                globalIndex, row.ts, isoTime(row.ts), jsNum(row.lat), jsNum(row.lon),
                numOrZero(row.accuracy), numOrZero(row.altitude), numOrZero(row.speed), numOrZero(row.bearing), numOrZero(row.battery),
                batteryStatusLabel(row.batteryStatus) ?: "", csvField(row.note)
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
        "coordinates": [${jsNum(row.lon)}, ${jsNum(row.lat)}]
      },
      "properties": {
        "id": $globalIndex,
        "accuracy": ${jsonValue(row.accuracy)},
        "altitude": ${jsonValue(row.altitude)},
        "speed": ${jsonValue(row.speed)},
        "bearing": ${jsonValue(row.bearing)},
        "battery": ${jsonValue(row.battery)},
        "battery_status": ${jsonValue(batteryStatusLabel(row.batteryStatus))},
        "note": ${jsonValue(row.note)},
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
            kml?.add("${jsNum(row.lon)},${jsNum(row.lat)},${numOrZero(row.altitude)}")
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

    private fun tripsToGeoJson(trips: List<TripExport>): String {
        val features = ArrayList<String>()
        for (trip in trips) {
            trip.rows.forEachIndexed { i, row ->
                val ts = rowTs(row)
                features.add(
                    "    {\n" +
                    "      \"type\": \"Feature\",\n" +
                    "      \"geometry\": {\n" +
                    "        \"type\": \"Point\",\n" +
                    "        \"coordinates\": [\n" +
                    "          ${numOrZero(row["longitude"])},\n" +
                    "          ${numOrZero(row["latitude"])}\n" +
                    "        ]\n" +
                    "      },\n" +
                    "      \"properties\": {\n" +
                    "        \"trip\": ${trip.index},\n" +
                    "        \"id\": $i,\n" +
                    "        \"accuracy\": ${jsonNum(row["accuracy"])},\n" +
                    "        \"altitude\": ${jsonNum(row["altitude"])},\n" +
                    "        \"speed\": ${jsonNum(row["speed"])},\n" +
                    "        \"bearing\": ${jsonNum(row["bearing"])},\n" +
                    "        \"battery\": ${jsonNum(row["battery"])},\n" +
                    "        \"battery_status\": ${jsonValue(batteryStatusLabel(row["battery_status"]))},\n" +
                    "        \"note\": ${jsonValue(row["note"])},\n" +
                    "        \"time\": \"${isoTime(ts)}\"\n" +
                    "      }\n" +
                    "    }"
                )
            }
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
