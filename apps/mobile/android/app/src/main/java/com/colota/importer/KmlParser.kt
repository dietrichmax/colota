/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.importer

import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.InputStream
import java.util.concurrent.atomic.AtomicBoolean

/** Streaming KML parser. Placemark/Point/TimeStamp only; LineString tracks have no
 *  per-vertex timestamps so they're counted as invalid rather than fabricated. */
object KmlParser {

    fun parse(
        input: InputStream,
        cancelled: AtomicBoolean,
        nowSec: Long,
    ): ParseResult {
        val rows = ArrayList<ImportRow>()
        var invalid = 0

        val parser = Xml.newPullParser().apply {
            setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, true)
            setInput(input, null)
        }

        var event = parser.eventType
        while (event != XmlPullParser.END_DOCUMENT) {
            if (cancelled.get()) throw InterruptedException("Import cancelled")
            if (event == XmlPullParser.START_TAG && parser.name == "Placemark") {
                val (added, badRows) = readPlacemark(parser, nowSec)
                rows.addAll(added)
                invalid += badRows
            }
            event = parser.next()
        }

        return ParseResult(rows, invalid)
    }

    private fun readPlacemark(parser: XmlPullParser, nowSec: Long): Pair<List<ImportRow>, Int> {
        val rows = ArrayList<ImportRow>()
        var pointCoord: Pair<Double, Double>? = null
        var pointAltitude: Int? = null
        var lineCoords: List<Triple<Double, Double, Int?>>? = null
        var ts: Long? = null

        var event = parser.next()
        while (!(event == XmlPullParser.END_TAG && parser.name == "Placemark")) {
            if (event == XmlPullParser.START_TAG) {
                when (parser.name) {
                    "Point" -> {
                        val parsed = readGeometryCoordinates(parser, "Point")
                        if (parsed.isNotEmpty()) {
                            pointCoord = parsed[0].first to parsed[0].second
                            pointAltitude = parsed[0].third
                        }
                    }
                    "LineString" -> {
                        lineCoords = readGeometryCoordinates(parser, "LineString")
                    }
                    "TimeStamp" -> ts = readTimeStampWhen(parser)
                    "TimeSpan" -> ts = ts ?: readTimeSpanBegin(parser)
                    else -> parser.skipElement()
                }
            }
            event = parser.next()
        }

        var invalid = 0
        if (pointCoord != null) {
            val tsVal = ts
            if (tsVal == null) {
                invalid++
            } else if (isValidLocation(pointCoord.first, pointCoord.second, tsVal, nowSec)) {
                rows.add(
                    ImportRow(
                        timestamp = tsVal,
                        latitude = pointCoord.first,
                        longitude = pointCoord.second,
                        accuracy = null,
                        altitude = pointAltitude,
                        speed = null,
                        bearing = null,
                        battery = null,
                    )
                )
            } else {
                invalid++
            }
        }
        // No per-vertex timestamps in KML LineString; count the vertices as invalid.
        if (lineCoords != null && pointCoord == null && lineCoords.isNotEmpty()) {
            invalid += lineCoords.size
        }
        return rows to invalid
    }

    // KML coordinates are `lon,lat[,alt]` tuples - lon first, opposite of the usual order.
    private fun readGeometryCoordinates(
        parser: XmlPullParser,
        containerName: String,
    ): List<Triple<Double, Double, Int?>> {
        val result = ArrayList<Triple<Double, Double, Int?>>()
        var event = parser.next()
        while (!(event == XmlPullParser.END_TAG && parser.name == containerName)) {
            if (event == XmlPullParser.START_TAG) {
                if (parser.name == "coordinates") {
                    val text = parser.readTextOrNull()
                    if (text != null) {
                        result.addAll(parseCoordinatesText(text))
                    }
                } else {
                    parser.skipElement()
                }
            }
            event = parser.next()
        }
        return result
    }

    internal fun parseCoordinatesText(text: String): List<Triple<Double, Double, Int?>> {
        return text.trim().split(Regex("\\s+")).mapNotNull { tuple ->
            val parts = tuple.split(",")
            if (parts.size < 2) return@mapNotNull null
            val lon = parts[0].trim().toDoubleOrNull() ?: return@mapNotNull null
            val lat = parts[1].trim().toDoubleOrNull() ?: return@mapNotNull null
            val alt = if (parts.size >= 3) parts[2].trim().toDoubleOrNull()?.toInt() else null
            Triple(lat, lon, alt)
        }
    }

    private fun readTimeStampWhen(parser: XmlPullParser): Long? {
        var ts: Long? = null
        var event = parser.next()
        while (!(event == XmlPullParser.END_TAG && parser.name == "TimeStamp")) {
            if (event == XmlPullParser.START_TAG) {
                if (parser.name == "when") {
                    val text = parser.readTextOrNull()
                    if (text != null) ts = parseIso8601Seconds(text)
                } else {
                    parser.skipElement()
                }
            }
            event = parser.next()
        }
        return ts
    }

    private fun readTimeSpanBegin(parser: XmlPullParser): Long? {
        var ts: Long? = null
        var event = parser.next()
        while (!(event == XmlPullParser.END_TAG && parser.name == "TimeSpan")) {
            if (event == XmlPullParser.START_TAG) {
                if (parser.name == "begin" && ts == null) {
                    val text = parser.readTextOrNull()
                    if (text != null) ts = parseIso8601Seconds(text)
                } else {
                    parser.skipElement()
                }
            }
            event = parser.next()
        }
        return ts
    }
}
