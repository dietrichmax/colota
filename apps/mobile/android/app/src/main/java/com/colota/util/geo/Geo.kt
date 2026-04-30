/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.util.geo

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

const val EARTH_RADIUS_METERS = 6371000.0

/** Haversine great-circle distance in meters. Accurate at any distance on Earth. */
fun haversineDistance(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val dLat = Math.toRadians(lat2 - lat1)
    val dLon = Math.toRadians(lon2 - lon1)
    val a = sin(dLat / 2).pow(2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2)
    return EARTH_RADIUS_METERS * 2 * atan2(sqrt(a), sqrt(1 - a))
}

/** Fast bounding-box rejection followed by haversine check. */
fun isWithinRadius(lat1: Double, lon1: Double, lat2: Double, lon2: Double, radius: Double): Boolean {
    val maxLatDeg = radius / 111000.0
    val maxLonDeg = radius / (111000.0 * cos(Math.toRadians(lat1)))
    if (Math.abs(lat1 - lat2) > maxLatDeg || Math.abs(lon1 - lon2) > maxLonDeg) return false
    return haversineDistance(lat1, lon1, lat2, lon2) <= radius
}
