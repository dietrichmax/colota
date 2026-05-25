/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.importer

import android.util.Xml
import org.xmlpull.v1.XmlPullParser
import java.io.InputStream
import java.util.concurrent.atomic.AtomicBoolean

/** Streaming GPX parser. wpt, rtept, trkpt are all collected into the flat locations table. */
object GpxParser {

    private val POINT_ELEMENTS = setOf("wpt", "rtept", "trkpt")

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
            if (event == XmlPullParser.START_TAG && parser.name in POINT_ELEMENTS) {
                val row = readPoint(parser, nowSec)
                if (row != null) rows.add(row) else invalid++
            }
            event = parser.next()
        }

        return ParseResult(rows, invalid)
    }

    private fun readPoint(parser: XmlPullParser, nowSec: Long): ImportRow? {
        val pointName = parser.name
        val lat = parser.getAttributeValue(null, "lat")?.toDoubleOrNull()
        val lon = parser.getAttributeValue(null, "lon")?.toDoubleOrNull()

        var ts: Long? = null
        var altitude: Int? = null
        var accuracy: Int? = null
        var speed: Int? = null
        var bearing: Double? = null
        var battery: Int? = null

        var event = parser.next()
        while (!(event == XmlPullParser.END_TAG && parser.name == pointName)) {
            if (event == XmlPullParser.START_TAG) {
                when (parser.name) {
                    "ele" -> altitude = parser.readTextOrNull()?.toDoubleOrNull()?.toInt()
                    "time" -> ts = parser.readTextOrNull()?.let { parseIso8601Seconds(it) }
                    "extensions" -> readExtensions(parser) { extName, value ->
                        when (extName.lowercase()) {
                            "accuracy" -> accuracy = value.toDoubleOrNull()?.toInt()
                            "speed" -> speed = value.toDoubleOrNull()?.toInt()
                            "bearing", "heading", "course" -> bearing = value.toDoubleOrNull()
                            "battery" -> battery = value.toDoubleOrNull()?.toInt()
                        }
                    }
                    else -> parser.skipElement()
                }
            }
            event = parser.next()
        }

        if (lat == null || lon == null || ts == null) return null
        if (!isValidLocation(lat, lon, ts, nowSec)) return null
        return ImportRow(
            timestamp = ts,
            latitude = lat,
            longitude = lon,
            accuracy = accuracy,
            altitude = altitude,
            speed = speed,
            bearing = bearing,
            battery = battery,
        )
    }

    // Recurses one level into namespaced wrappers like <gpxtpx:TrackPointExtension>
    // so leaf children (speed, course, ...) are picked up.
    private fun readExtensions(parser: XmlPullParser, onValue: (String, String) -> Unit) {
        var event = parser.next()
        while (!(event == XmlPullParser.END_TAG && parser.name == "extensions")) {
            if (event == XmlPullParser.START_TAG) {
                val name = parser.name
                val text = parser.readTextOrNull()
                if (text != null) {
                    onValue(name, text)
                } else {
                    readNestedExtensionContainer(parser, name, onValue)
                }
            }
            event = parser.next()
        }
    }

    private fun readNestedExtensionContainer(
        parser: XmlPullParser,
        containerName: String,
        onValue: (String, String) -> Unit,
    ) {
        var event = parser.eventType
        while (!(event == XmlPullParser.END_TAG && parser.name == containerName)) {
            if (event == XmlPullParser.START_TAG) {
                val leafName = parser.name
                val text = parser.readTextOrNull()
                if (text != null) onValue(leafName, text) else parser.skipElement()
            }
            event = parser.next()
        }
    }
}
