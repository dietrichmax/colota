/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.importer

import android.util.JsonReader
import android.util.JsonToken
import java.io.InputStream
import java.util.concurrent.atomic.AtomicBoolean

/** Streaming Google Timeline parser. Handles legacy Takeout `Records.json` and the
 *  on-device `semanticSegments` / `rawSignals` schema in one pass. */
object GoogleTimelineParser {

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
                    "locations" -> invalid += readLegacyLocations(reader, cancelled, rows, nowSec)
                    "semanticSegments" -> invalid += readSemanticSegments(reader, cancelled, rows, nowSec)
                    "rawSignals" -> invalid += readRawSignals(reader, cancelled, rows, nowSec)
                    else -> reader.skipValue()
                }
            }
            reader.endObject()
        }

        return ParseResult(rows, invalid)
    }

    private fun readLegacyLocations(
        reader: JsonReader,
        cancelled: AtomicBoolean,
        rows: ArrayList<ImportRow>,
        nowSec: Long,
    ): Int {
        var invalid = 0
        reader.beginArray()
        while (reader.hasNext()) {
            if (cancelled.get()) throw InterruptedException("Import cancelled")
            val row = readLegacyLocation(reader, nowSec)
            if (row != null) rows.add(row) else invalid++
        }
        reader.endArray()
        return invalid
    }

    private fun readLegacyLocation(reader: JsonReader, nowSec: Long): ImportRow? {
        var latE7: Long? = null
        var lonE7: Long? = null
        var ts: Long? = null
        var accuracy: Int? = null
        var altitude: Int? = null
        var speed: Int? = null

        reader.beginObject()
        while (reader.hasNext()) {
            when (reader.nextName()) {
                "latitudeE7" -> latE7 = reader.nextLong()
                "longitudeE7" -> lonE7 = reader.nextLong()
                "timestampMs" -> ts = when (reader.peek()) {
                    JsonToken.STRING -> reader.nextString().toLongOrNull()?.div(1000)
                    JsonToken.NUMBER -> reader.nextLong() / 1000
                    else -> { reader.skipValue(); null }
                }
                "timestamp" -> ts = when (reader.peek()) {
                    JsonToken.STRING -> parseIso8601Seconds(reader.nextString())
                    else -> { reader.skipValue(); null }
                }
                "accuracy" -> accuracy = reader.readNullableInt()
                "altitude" -> altitude = reader.readNullableInt()
                "velocity" -> speed = reader.readNullableInt()
                else -> reader.skipValue()
            }
        }
        reader.endObject()

        val lat = latE7?.let { it / 1e7 } ?: return null
        val lon = lonE7?.let { it / 1e7 } ?: return null
        val tsVal = ts ?: return null
        if (!isValidLocation(lat, lon, tsVal, nowSec)) return null

        return ImportRow(
            timestamp = tsVal,
            latitude = lat,
            longitude = lon,
            accuracy = accuracy,
            altitude = altitude,
            speed = speed,
            bearing = null,
            battery = null,
        )
    }

    // semanticSegments[] also carries `visit` / `activity` summaries - skip those, they're
    // higher-level inferences without per-sample fixes.
    private fun readSemanticSegments(
        reader: JsonReader,
        cancelled: AtomicBoolean,
        rows: ArrayList<ImportRow>,
        nowSec: Long,
    ): Int {
        var invalid = 0
        reader.beginArray()
        while (reader.hasNext()) {
            if (cancelled.get()) throw InterruptedException("Import cancelled")
            invalid += readSemanticSegment(reader, cancelled, rows, nowSec)
        }
        reader.endArray()
        return invalid
    }

    private fun readSemanticSegment(
        reader: JsonReader,
        cancelled: AtomicBoolean,
        rows: ArrayList<ImportRow>,
        nowSec: Long,
    ): Int {
        var invalid = 0
        reader.beginObject()
        while (reader.hasNext()) {
            when (reader.nextName()) {
                "timelinePath" -> invalid += readTimelinePath(reader, cancelled, rows, nowSec)
                else -> reader.skipValue()
            }
        }
        reader.endObject()
        return invalid
    }

    private fun readTimelinePath(
        reader: JsonReader,
        cancelled: AtomicBoolean,
        rows: ArrayList<ImportRow>,
        nowSec: Long,
    ): Int {
        var invalid = 0
        reader.beginArray()
        while (reader.hasNext()) {
            if (cancelled.get()) throw InterruptedException("Import cancelled")
            var pointStr: String? = null
            var timeStr: String? = null
            reader.beginObject()
            while (reader.hasNext()) {
                when (reader.nextName()) {
                    "point" -> pointStr = if (reader.peek() == JsonToken.STRING) reader.nextString() else { reader.skipValue(); null }
                    "time" -> timeStr = if (reader.peek() == JsonToken.STRING) reader.nextString() else { reader.skipValue(); null }
                    else -> reader.skipValue()
                }
            }
            reader.endObject()

            val coords = pointStr?.let(::parseLatLngString)
            val ts = timeStr?.let(::parseIso8601Seconds)
            if (coords != null && ts != null && isValidLocation(coords.first, coords.second, ts, nowSec)) {
                rows.add(
                    ImportRow(
                        timestamp = ts,
                        latitude = coords.first,
                        longitude = coords.second,
                        accuracy = null,
                        altitude = null,
                        speed = null,
                        bearing = null,
                        battery = null,
                    )
                )
            } else {
                invalid++
            }
        }
        reader.endArray()
        return invalid
    }

    private fun readRawSignals(
        reader: JsonReader,
        cancelled: AtomicBoolean,
        rows: ArrayList<ImportRow>,
        nowSec: Long,
    ): Int {
        var invalid = 0
        reader.beginArray()
        while (reader.hasNext()) {
            if (cancelled.get()) throw InterruptedException("Import cancelled")
            val row = readRawSignal(reader, nowSec)
            if (row != null) rows.add(row) else invalid++
        }
        reader.endArray()
        return invalid
    }

    private fun readRawSignal(reader: JsonReader, nowSec: Long): ImportRow? {
        var pos: PositionData? = null
        reader.beginObject()
        while (reader.hasNext()) {
            when (reader.nextName()) {
                "position" -> {
                    if (reader.peek() == JsonToken.NULL) {
                        reader.nextNull()
                    } else {
                        pos = readPosition(reader)
                    }
                }
                else -> reader.skipValue()
            }
        }
        reader.endObject()

        val p = pos ?: return null
        val coords = p.latLng?.let(::parseLatLngString) ?: return null
        val ts = p.timestamp ?: return null
        if (!isValidLocation(coords.first, coords.second, ts, nowSec)) return null

        return ImportRow(
            timestamp = ts,
            latitude = coords.first,
            longitude = coords.second,
            accuracy = p.accuracyMeters,
            altitude = p.altitudeMeters,
            speed = p.speedMetersPerSecond,
            bearing = null,
            battery = null,
        )
    }

    private data class PositionData(
        val latLng: String?,
        val accuracyMeters: Int?,
        val altitudeMeters: Int?,
        val speedMetersPerSecond: Int?,
        val timestamp: Long?,
    )

    private fun readPosition(reader: JsonReader): PositionData {
        var latLng: String? = null
        var accuracy: Int? = null
        var altitude: Int? = null
        var speed: Int? = null
        var ts: Long? = null
        reader.beginObject()
        while (reader.hasNext()) {
            when (reader.nextName()) {
                "LatLng", "latLng" -> latLng = if (reader.peek() == JsonToken.STRING) reader.nextString() else { reader.skipValue(); null }
                "accuracyMeters" -> accuracy = reader.readNullableInt()
                "altitudeMeters" -> altitude = reader.readNullableInt()
                "speedMetersPerSecond" -> speed = reader.readNullableInt()
                "timestamp" -> ts = if (reader.peek() == JsonToken.STRING) parseIso8601Seconds(reader.nextString()) else { reader.skipValue(); null }
                else -> reader.skipValue()
            }
        }
        reader.endObject()
        return PositionData(latLng, accuracy, altitude, speed, ts)
    }

    // New format encodes coords as e.g. "37.422065°,-122.084089°". The degree sign is
    // sometimes absent but the shape is always lat,lon comma-separated.
    internal fun parseLatLngString(s: String): Pair<Double, Double>? {
        val cleaned = s.replace("°", "").trim()
        val parts = cleaned.split(",")
        if (parts.size != 2) return null
        val lat = parts[0].trim().toDoubleOrNull() ?: return null
        val lon = parts[1].trim().toDoubleOrNull() ?: return null
        return lat to lon
    }

}
