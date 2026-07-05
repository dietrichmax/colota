/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.importer

import android.util.JsonReader
import android.util.JsonToken
import java.io.InputStream
import java.util.concurrent.atomic.AtomicBoolean

/** Streaming GeoJSON parser. Reads Point (scalar props) or MultiPoint (columnar, parallel-array
 *  props) features from a FeatureCollection; other geometries are counted invalid and skipped. */
object GeoJsonParser {

    fun parse(
        input: InputStream,
        cancelled: AtomicBoolean,
        nowSec: Long,
    ): ParseResult {
        val rows = ArrayList<ImportRow>()
        var invalid = 0

        JsonReader(input.reader(Charsets.UTF_8)).use { reader ->
            reader.beginObject()
            while (reader.hasNext()) {
                if (cancelled.get()) throw InterruptedException("Import cancelled")
                when (reader.nextName()) {
                    "features" -> {
                        reader.beginArray()
                        while (reader.hasNext()) {
                            if (cancelled.get()) throw InterruptedException("Import cancelled")
                            val result = readFeature(reader, nowSec)
                            rows.addAll(result.rows)
                            invalid += result.invalid
                        }
                        reader.endArray()
                    }
                    else -> reader.skipValue()
                }
            }
            reader.endObject()
        }

        return ParseResult(rows = rows, invalid = invalid)
    }

    private class FeatureResult(val rows: List<ImportRow>, val invalid: Int)

    private fun readFeature(reader: JsonReader, nowSec: Long): FeatureResult {
        var geometryType: String? = null
        var rawCoords: Coords? = null
        // Read as columns: a scalar becomes a single-element list so Point and MultiPoint share one
        // zip-by-index path below. Null = property absent.
        var times: List<Long?>? = null
        var accuracy: List<Int?>? = null
        var altitude: List<Int?>? = null
        var speed: List<Int?>? = null
        var bearing: List<Double?>? = null
        var battery: List<Int?>? = null
        var batteryStatus: List<Int?>? = null
        var note: List<String?>? = null

        reader.beginObject()
        while (reader.hasNext()) {
            when (reader.nextName()) {
                "geometry" -> {
                    if (reader.peek() == JsonToken.NULL) {
                        reader.nextNull()
                        continue
                    }
                    reader.beginObject()
                    while (reader.hasNext()) {
                        when (reader.nextName()) {
                            "type" -> geometryType = reader.nextString()
                            "coordinates" -> {
                                if (reader.peek() == JsonToken.NULL) {
                                    reader.nextNull()
                                } else {
                                    rawCoords = readCoords(reader)
                                }
                            }
                            else -> reader.skipValue()
                        }
                    }
                    reader.endObject()
                }
                "properties" -> {
                    if (reader.peek() == JsonToken.NULL) {
                        reader.nextNull()
                        continue
                    }
                    reader.beginObject()
                    while (reader.hasNext()) {
                        when (reader.nextName()) {
                            "time", "timestamp" -> times = readList(reader) { readTimestamp(it) }
                            "accuracy" -> accuracy = readList(reader) { it.readNullableInt() }
                            "altitude", "elevation", "ele" -> altitude = readList(reader) { it.readNullableInt() }
                            "speed", "velocity" -> speed = readList(reader) { it.readNullableInt() }
                            "bearing", "heading" -> bearing = readList(reader) { it.readNullableDouble() }
                            "battery" -> battery = readList(reader) { it.readNullableInt() }
                            "battery_status" -> batteryStatus = readList(reader) { readBatteryStatus(it) }
                            "note" -> note = readList(reader) { readNullableString(it) }
                            else -> reader.skipValue()
                        }
                    }
                    reader.endObject()
                }
                else -> reader.skipValue()
            }
        }
        reader.endObject()

        // Coordinates and type may appear in any key order, so resolve the point list only now.
        val points: List<Pair<Double, Double>>? = when (geometryType) {
            "Point" -> (rawCoords as? Coords.Single)?.let { listOf(it.lon to it.lat) }
            "MultiPoint" -> (rawCoords as? Coords.Multi)?.points
            else -> null
        }
        // Wrong geometry, or coords malformed for the declared type: one invalid feature.
        if (points == null) return FeatureResult(emptyList(), 1)

        val out = ArrayList<ImportRow>(points.size)
        var invalid = 0
        for (i in points.indices) {
            val (lon, lat) = points[i]
            val ts = times?.getOrNull(i)
            if (ts == null || !isValidLocation(lat, lon, ts, nowSec)) {
                invalid++
                continue
            }
            out.add(
                ImportRow(
                    timestamp = ts,
                    latitude = lat,
                    longitude = lon,
                    accuracy = accuracy?.getOrNull(i),
                    altitude = altitude?.getOrNull(i),
                    speed = speed?.getOrNull(i),
                    bearing = bearing?.getOrNull(i),
                    battery = battery?.getOrNull(i),
                    note = note?.getOrNull(i),
                    batteryStatus = batteryStatus?.getOrNull(i),
                )
            )
        }
        return FeatureResult(out, invalid)
    }

    private sealed class Coords {
        object Invalid : Coords()
        data class Single(val lon: Double, val lat: Double) : Coords()
        data class Multi(val points: List<Pair<Double, Double>>) : Coords()
    }

    // Flat [lon,lat] -> Single, nested [[lon,lat],...] -> Multi. Type decides Point vs MultiPoint,
    // since MultiPoint and LineString have the same coordinate nesting.
    private fun readCoords(reader: JsonReader): Coords {
        reader.beginArray()
        if (!reader.hasNext()) {
            reader.endArray()
            return Coords.Multi(emptyList())
        }
        return when (reader.peek()) {
            JsonToken.NUMBER -> {
                val lon = reader.nextDouble()
                if (!reader.hasNext() || reader.peek() != JsonToken.NUMBER) {
                    drainArray(reader)
                    return Coords.Invalid
                }
                val lat = reader.nextDouble()
                drainArray(reader)
                Coords.Single(lon, lat)
            }
            JsonToken.BEGIN_ARRAY -> {
                val points = ArrayList<Pair<Double, Double>>()
                while (reader.hasNext()) {
                    val pair = readInnerPair(reader)
                    if (pair != null) points.add(pair)
                }
                reader.endArray()
                Coords.Multi(points)
            }
            else -> {
                drainArray(reader)
                Coords.Invalid
            }
        }
    }

    // One [lon,lat,...] sub-array; null if it's not a coord pair (e.g. deeper nesting).
    private fun readInnerPair(reader: JsonReader): Pair<Double, Double>? {
        if (reader.peek() != JsonToken.BEGIN_ARRAY) {
            reader.skipValue()
            return null
        }
        reader.beginArray()
        if (!reader.hasNext() || reader.peek() != JsonToken.NUMBER) {
            drainArray(reader)
            return null
        }
        val lon = reader.nextDouble()
        if (!reader.hasNext() || reader.peek() != JsonToken.NUMBER) {
            drainArray(reader)
            return null
        }
        val lat = reader.nextDouble()
        drainArray(reader)
        return lon to lat
    }

    private fun drainArray(reader: JsonReader) {
        while (reader.hasNext()) reader.skipValue()
        reader.endArray()
    }

    // Array -> one entry per element; scalar -> single-element list. Short arrays null-fill via getOrNull.
    private inline fun <T> readList(reader: JsonReader, readOne: (JsonReader) -> T?): List<T?> {
        if (reader.peek() != JsonToken.BEGIN_ARRAY) return listOf(readOne(reader))
        val out = ArrayList<T?>()
        reader.beginArray()
        while (reader.hasNext()) out.add(readOne(reader))
        reader.endArray()
        return out
    }

    private fun readTimestamp(reader: JsonReader): Long? {
        return when (reader.peek()) {
            JsonToken.NULL -> { reader.nextNull(); null }
            JsonToken.NUMBER -> {
                val n = reader.nextDouble()
                if (n > 1e12) (n / 1000).toLong() else n.toLong()
            }
            JsonToken.STRING -> {
                val s = reader.nextString()
                parseIso8601Seconds(s)
            }
            else -> { reader.skipValue(); null }
        }
    }

    private fun readNullableString(reader: JsonReader): String? = when (reader.peek()) {
        JsonToken.NULL -> { reader.nextNull(); null }
        JsonToken.STRING -> reader.nextString()
        else -> { reader.skipValue(); null }
    }

    // Accepts Colota's exported labels and Overland-style strings, or a raw numeric code.
    private fun readBatteryStatus(reader: JsonReader): Int? = when (reader.peek()) {
        JsonToken.NULL -> { reader.nextNull(); null }
        JsonToken.NUMBER -> reader.nextDouble().toInt()
        JsonToken.STRING -> batteryStatusCode(reader.nextString())
        else -> { reader.skipValue(); null }
    }

    private fun batteryStatusCode(label: String): Int? = when (label.lowercase()) {
        "charging" -> 2
        "full" -> 3
        "unplugged/discharging", "unplugged", "discharging" -> 1
        "unknown" -> 0
        else -> null
    }
}

internal fun isValidLocation(lat: Double, lon: Double, tsSec: Long, nowSec: Long): Boolean {
    if (lat.isNaN() || lon.isNaN()) return false
    if (lat < -90.0 || lat > 90.0) return false
    if (lon < -180.0 || lon > 180.0) return false
    if (tsSec <= 0) return false
    // 5-minute clock-skew tolerance; further into the future is treated as corrupt.
    if (tsSec > nowSec + 5 * 60) return false
    return true
}

data class ParseResult(
    val rows: List<ImportRow>,
    val invalid: Int,
)
