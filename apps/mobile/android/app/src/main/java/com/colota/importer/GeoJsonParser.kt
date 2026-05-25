/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.importer

import android.util.JsonReader
import android.util.JsonToken
import java.io.InputStream
import java.util.concurrent.atomic.AtomicBoolean

/** Streaming GeoJSON parser. Reads FeatureCollection of Point features; non-Point
 *  features are counted invalid and skipped. */
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
                            val row = readFeature(reader, nowSec)
                            if (row != null) rows.add(row) else invalid++
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

    private fun readFeature(reader: JsonReader, nowSec: Long): ImportRow? {
        var lat: Double? = null
        var lon: Double? = null
        var ts: Long? = null
        var accuracy: Int? = null
        var altitude: Int? = null
        var speed: Int? = null
        var bearing: Double? = null
        var battery: Int? = null
        var geometryType: String? = null

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
                                    val coords = readCoordinates(reader)
                                    if (coords != null) {
                                        lon = coords.first
                                        lat = coords.second
                                    }
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
                            "time", "timestamp" -> ts = readTimestamp(reader)
                            "accuracy" -> accuracy = reader.readNullableInt()
                            "altitude", "elevation", "ele" -> altitude = reader.readNullableInt()
                            "speed", "velocity" -> speed = reader.readNullableInt()
                            "bearing", "heading" -> bearing = reader.readNullableDouble()
                            "battery" -> battery = reader.readNullableInt()
                            else -> reader.skipValue()
                        }
                    }
                    reader.endObject()
                }
                else -> reader.skipValue()
            }
        }
        reader.endObject()

        if (geometryType != "Point") return null
        val tsVal = ts ?: return null
        val latVal = lat ?: return null
        val lonVal = lon ?: return null
        if (!isValidLocation(latVal, lonVal, tsVal, nowSec)) return null

        return ImportRow(
            timestamp = tsVal,
            latitude = latVal,
            longitude = lonVal,
            accuracy = accuracy,
            altitude = altitude,
            speed = speed,
            bearing = bearing,
            battery = battery,
        )
    }

    // Returns null on non-Point shapes; still consumes the array to keep the reader aligned.
    private fun readCoordinates(reader: JsonReader): Pair<Double, Double>? {
        reader.beginArray()
        if (!reader.hasNext() || reader.peek() != JsonToken.NUMBER) {
            while (reader.hasNext()) reader.skipValue()
            reader.endArray()
            return null
        }
        val first = reader.nextDouble()
        if (!reader.hasNext() || reader.peek() != JsonToken.NUMBER) {
            while (reader.hasNext()) reader.skipValue()
            reader.endArray()
            return null
        }
        val second = reader.nextDouble()
        while (reader.hasNext()) reader.skipValue()
        reader.endArray()
        return first to second
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
