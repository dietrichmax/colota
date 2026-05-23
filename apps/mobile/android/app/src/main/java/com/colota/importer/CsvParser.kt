/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.importer

import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.util.concurrent.atomic.AtomicBoolean

/** Streaming CSV parser. Column order is driven by the header; lat/lon plus one of
 *  the timestamp aliases are required, the rest are optional. */
object CsvParser {

    private val LAT_ALIASES = setOf("latitude", "lat")
    private val LON_ALIASES = setOf("longitude", "lon", "lng", "long")
    private val TS_NUMERIC_ALIASES = setOf("timestamp", "ts")
    private val TS_ISO_ALIASES = setOf("iso_time", "time", "datetime", "date_time")
    private val ACCURACY_ALIASES = setOf("accuracy", "acc")
    private val ALTITUDE_ALIASES = setOf("altitude", "alt", "elevation", "ele")
    private val SPEED_ALIASES = setOf("speed", "velocity", "vel")
    private val BEARING_ALIASES = setOf("bearing", "heading", "course", "bear")
    private val BATTERY_ALIASES = setOf("battery", "batt")

    fun parse(
        input: InputStream,
        cancelled: AtomicBoolean,
        nowSec: Long,
    ): ParseResult {
        val rows = ArrayList<ImportRow>()
        var invalid = 0

        BufferedReader(InputStreamReader(input, Charsets.UTF_8)).use { reader ->
            val headerLine = reader.readLine()
                ?: return ParseResult(rows, invalid)
            val cols = parseHeader(headerLine)
            if (cols.lat < 0 || cols.lon < 0 || (cols.tsNumeric < 0 && cols.tsIso < 0)) {
                throw UnsupportedFormatException("CSV header lacks required columns: latitude, longitude, and a timestamp column")
            }

            var line = reader.readLine()
            while (line != null) {
                if (cancelled.get()) throw InterruptedException("Import cancelled")
                if (line.isBlank()) { line = reader.readLine(); continue }
                val row = readDataRow(line, cols, nowSec)
                if (row != null) rows.add(row) else invalid++
                line = reader.readLine()
            }
        }

        return ParseResult(rows, invalid)
    }

    // Column indices into the parsed header row; -1 means "absent".
    internal data class HeaderCols(
        val lat: Int,
        val lon: Int,
        val tsNumeric: Int,
        val tsIso: Int,
        val accuracy: Int,
        val altitude: Int,
        val speed: Int,
        val bearing: Int,
        val battery: Int,
    )

    internal fun parseHeader(line: String): HeaderCols {
        val parts = splitCsvLine(line).map { it.lowercase().trim() }
        fun indexOfAny(aliases: Set<String>): Int = parts.indexOfFirst { it in aliases }
        return HeaderCols(
            lat = indexOfAny(LAT_ALIASES),
            lon = indexOfAny(LON_ALIASES),
            tsNumeric = indexOfAny(TS_NUMERIC_ALIASES),
            tsIso = indexOfAny(TS_ISO_ALIASES),
            accuracy = indexOfAny(ACCURACY_ALIASES),
            altitude = indexOfAny(ALTITUDE_ALIASES),
            speed = indexOfAny(SPEED_ALIASES),
            bearing = indexOfAny(BEARING_ALIASES),
            battery = indexOfAny(BATTERY_ALIASES),
        )
    }

    private fun readDataRow(line: String, cols: HeaderCols, nowSec: Long): ImportRow? {
        val parts = splitCsvLine(line)
        // Leftover `"` means a quoted field had an unescaped comma; column alignment is
        // unsafe, drop the row rather than risk shifted lat/lon.
        if (parts.any { it.contains('"') }) return null
        fun field(idx: Int): String? = if (idx >= 0 && idx < parts.size) parts[idx].trim().takeIf { it.isNotEmpty() } else null

        val lat = field(cols.lat)?.toDoubleOrNull() ?: return null
        val lon = field(cols.lon)?.toDoubleOrNull() ?: return null

        val ts = field(cols.tsNumeric)?.let { v ->
            val n = v.toDoubleOrNull() ?: return@let null
            // Tolerate foreign CSVs that write milliseconds; Colota's own export is seconds.
            if (n > 1e12) (n / 1000).toLong() else n.toLong()
        } ?: field(cols.tsIso)?.let { parseIso8601Seconds(it) } ?: return null

        if (!isValidLocation(lat, lon, ts, nowSec)) return null

        return ImportRow(
            timestamp = ts,
            latitude = lat,
            longitude = lon,
            accuracy = field(cols.accuracy)?.toDoubleOrNull()?.toInt(),
            altitude = field(cols.altitude)?.toDoubleOrNull()?.toInt(),
            speed = field(cols.speed)?.toDoubleOrNull()?.toInt(),
            bearing = field(cols.bearing)?.toDoubleOrNull(),
            battery = field(cols.battery)?.toDoubleOrNull()?.toInt(),
        )
    }

    // Single-layer quote stripping. Embedded commas in quoted fields aren't supported.
    internal fun splitCsvLine(line: String): List<String> {
        return line.split(",").map { field ->
            val trimmed = field.trim()
            if (trimmed.length >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
                trimmed.substring(1, trimmed.length - 1)
            } else {
                trimmed
            }
        }
    }
}
