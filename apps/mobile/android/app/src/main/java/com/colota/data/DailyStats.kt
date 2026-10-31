/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.data

import com.Colota.data.DatabaseHelper.Companion.BOUNDARY_ACTION_SPLIT
import com.Colota.data.DatabaseHelper.Companion.TABLE_LOCATIONS
import com.Colota.util.AppLogger
import com.Colota.util.geo.haversineDistance

private const val TAG = "LocationDB"
private const val TRIP_GAP_SECONDS = 900L // 15 min, matches JS segmentTrips
private const val MIN_TRIP_EXTENT_METERS = 100.0 // bbox diagonal, matches JS segmentTrips

/**
 * Returns per-day aggregated stats for a date range in a single query.
 * Computes distance (haversine) and trip count (15-min gap threshold) inline
 * to avoid nested cursors.
 */
fun DatabaseHelper.getDailyStats(startTimestamp: Long, endTimestamp: Long): List<Map<String, Any>> {
    val stats = mutableListOf<Map<String, Any>>()
    // Kept out of the block below: failing to read manual edits should fall back to plain
    // automatic segmentation, not blank the caller's whole calendar month.
    val overrides = try {
        getBoundaryOverrides().associate { (before, after, action) -> (before to after) to action }
    } catch (e: Exception) {
        AppLogger.e(TAG, "Error loading trip boundary overrides", e)
        emptyMap()
    }
    try {
        readableDatabase.rawQuery(
            """
            SELECT
                strftime('%Y-%m-%d', timestamp, 'unixepoch', 'localtime') as day,
                latitude, longitude, timestamp
            FROM $TABLE_LOCATIONS
            WHERE timestamp >= ? AND timestamp <= ?
            ORDER BY day ASC, timestamp ASC, id ASC
            """.trimIndent(),
            arrayOf(startTimestamp.toString(), endTimestamp.toString())
        ).use { cursor ->
            var currentDay: String? = null
            var count = 0
            var startTime = 0L
            var endTime = 0L
            var distance = 0.0
            var tripCount = 0
            var prevLat = 0.0
            var prevLon = 0.0
            var prevTs = 0L

            // Distance is buffered until the segment qualifies as a trip
            var segMinLat = 0.0
            var segMaxLat = 0.0
            var segMinLon = 0.0
            var segMaxLon = 0.0
            var segDistance = 0.0
            var segCounted = false
            var segForced = false
            var segPoints = 0

            fun countSegment() {
                tripCount++
                segCounted = true
                distance += segDistance
                segDistance = 0.0
            }

            fun startSegment(lat: Double, lon: Double, forced: Boolean = false) {
                segMinLat = lat
                segMaxLat = lat
                segMinLon = lon
                segMaxLon = lon
                segDistance = 0.0
                segCounted = false
                segForced = forced
                segPoints = 1
            }

            fun emitDay() {
                if (currentDay != null) {
                    stats.add(mapOf(
                        "day" to currentDay!!,
                        "count" to count,
                        "startTime" to startTime,
                        "endTime" to endTime,
                        "distanceMeters" to distance,
                        "tripCount" to tripCount
                    ))
                }
            }

            while (cursor.moveToNext()) {
                val day = cursor.getString(0)
                val lat = cursor.getDouble(1)
                val lon = cursor.getDouble(2)
                val ts = cursor.getLong(3)

                if (day != currentDay) {
                    emitDay()
                    currentDay = day
                    count = 1
                    startTime = ts
                    endTime = ts
                    distance = 0.0
                    tripCount = 0
                    startSegment(lat, lon)
                    prevLat = lat
                    prevLon = lon
                    prevTs = ts
                } else {
                    count++
                    endTime = ts
                    val override = overrides[prevTs to ts]
                    val forcedSplit = override == BOUNDARY_ACTION_SPLIT
                    if (forcedSplit || (override == null && ts - prevTs >= TRIP_GAP_SECONDS)) {
                        // The segment ending here abuts the split, so it is exempt from the
                        // extent filter too - but a lone point is still not a trip.
                        if (forcedSplit && !segCounted && segPoints >= 2) countSegment()
                        startSegment(lat, lon, forcedSplit)
                    } else {
                        segPoints++
                        segDistance += haversineDistance(prevLat, prevLon, lat, lon)
                        if (lat < segMinLat) segMinLat = lat
                        if (lat > segMaxLat) segMaxLat = lat
                        if (lon < segMinLon) segMinLon = lon
                        if (lon > segMaxLon) segMaxLon = lon
                        // Counting a forced segment is deferred to here, its second point, so a
                        // split left dangling by a later delete cannot conjure a one-point trip.
                        if (!segCounted &&
                            (segForced ||
                                haversineDistance(segMinLat, segMinLon, segMaxLat, segMaxLon) >= MIN_TRIP_EXTENT_METERS)
                        ) {
                            countSegment()
                        }
                        if (segCounted) {
                            distance += segDistance
                            segDistance = 0.0
                        }
                    }
                }
                prevLat = lat
                prevLon = lon
                prevTs = ts
            }
            emitDay()
        }
    } catch (e: Exception) {
        AppLogger.e(TAG, "Error getting daily stats", e)
    }
    return stats
}
