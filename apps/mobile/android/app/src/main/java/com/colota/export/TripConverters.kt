/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.export

import java.util.Locale

/** color is a #RRGGBB hex supplied by JS (getTripColor), not computed here. */
data class TripExport(val index: Int, val color: String, val rows: List<Map<String, Any?>>)

/** Trip-segmented export, one track or folder per trip. The golden files in `golden/export/` pin the output. */
object TripConverters {

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

    /** One Point feature per location, carrying its trip number, so a GIS can colour or filter by trip. */
    private fun tripsToGeoJson(trips: List<TripExport>): String {
        val features = ArrayList<String>()
        for (trip in trips) {
            for (row in trip.rows) {
                val props = mutableListOf("\"trip\": ${trip.index}", "\"time\": \"${isoTime(rowTs(row))}\"")
                fun put(key: String, value: String) {
                    if (value != "null") props.add("\"$key\": $value")
                }
                put("accuracy", jsonNum(row["accuracy"]))
                put("altitude", jsonNum(row["altitude"]))
                put("speed", jsonNum(row["speed"]))
                put("bearing", jsonNum(row["bearing"]))
                put("battery", jsonNum(row["battery"]))
                put("battery_status", jsonValue(batteryStatusLabel(row["battery_status"])))
                put("note", jsonValue(row["note"]))
                features.add(
                    "    {\n" +
                    "      \"type\": \"Feature\",\n" +
                    "      \"geometry\": {\n" +
                    "        \"type\": \"Point\",\n" +
                    "        \"coordinates\": [${numOrZero(row["longitude"])}, ${numOrZero(row["latitude"])}]\n" +
                    "      },\n" +
                    "      \"properties\": {\n" +
                    "        ${props.joinToString(", ")}\n" +
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
