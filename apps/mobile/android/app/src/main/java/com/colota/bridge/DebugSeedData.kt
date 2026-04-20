/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.bridge

import com.Colota.data.DatabaseHelper

/**
 * Debug-only DB seed: 7 days of plausible Berlin tracks
 * (home -> supermarket -> gym -> home, plus an occasional evening walk)
 * so the UI has something to render in development builds.
 */
object DebugSeedData {

    // Home: Boxhagener Platz, Friedrichshain
    // Supermarket: REWE on Warschauer Str (~1.2 km south)
    // Gym: FitX Ostkreuz (~1.5 km SE of supermarket)
    // Columns: lat, lon, alt, speed, accuracy
    private val TRIP_HOME_TO_SUPERMARKET = arrayOf(
        doubleArrayOf(52.51420, 13.45830, 38.0, 0.2, 4.0),
        doubleArrayOf(52.51390, 13.45780, 37.0, 3.5, 5.0),
        doubleArrayOf(52.51310, 13.45650, 36.0, 8.2, 4.0),
        doubleArrayOf(52.51220, 13.45490, 35.0, 11.5, 3.5),
        doubleArrayOf(52.51120, 13.45340, 35.0, 12.8, 3.0),
        doubleArrayOf(52.50980, 13.45220, 34.0, 10.1, 4.0),
        doubleArrayOf(52.50870, 13.45100, 34.0, 8.7, 3.5),
        doubleArrayOf(52.50760, 13.44950, 33.0, 11.3, 3.0),
        doubleArrayOf(52.50650, 13.44820, 33.0, 9.4, 4.0),
        doubleArrayOf(52.50560, 13.44710, 33.0, 6.2, 4.5),
        doubleArrayOf(52.50490, 13.44650, 32.0, 2.1, 5.0),
        doubleArrayOf(52.50460, 13.44630, 32.0, 0.3, 4.0),
    )

    private val TRIP_SUPERMARKET_TO_GYM = arrayOf(
        doubleArrayOf(52.50460, 13.44630, 32.0, 0.5, 4.0),
        doubleArrayOf(52.50430, 13.44700, 32.0, 5.8, 4.5),
        doubleArrayOf(52.50380, 13.44890, 33.0, 10.2, 3.5),
        doubleArrayOf(52.50340, 13.45120, 33.0, 12.5, 3.0),
        doubleArrayOf(52.50310, 13.45380, 34.0, 11.8, 3.5),
        doubleArrayOf(52.50270, 13.45640, 34.0, 9.6, 4.0),
        doubleArrayOf(52.50230, 13.45900, 35.0, 8.3, 4.0),
        doubleArrayOf(52.50180, 13.46100, 35.0, 5.1, 4.5),
        doubleArrayOf(52.50150, 13.46250, 35.0, 2.4, 5.0),
        doubleArrayOf(52.50140, 13.46280, 35.0, 0.2, 4.0),
    )

    private val TRIP_GYM_TO_HOME = arrayOf(
        doubleArrayOf(52.50140, 13.46280, 35.0, 0.4, 4.0),
        doubleArrayOf(52.50190, 13.46180, 35.0, 4.2, 4.5),
        doubleArrayOf(52.50280, 13.45980, 34.0, 9.7, 3.5),
        doubleArrayOf(52.50390, 13.45820, 34.0, 11.4, 3.0),
        doubleArrayOf(52.50510, 13.45700, 33.0, 12.1, 3.5),
        doubleArrayOf(52.50630, 13.45590, 33.0, 10.5, 4.0),
        doubleArrayOf(52.50740, 13.45480, 34.0, 8.9, 3.5),
        doubleArrayOf(52.50860, 13.45360, 34.0, 11.0, 3.0),
        doubleArrayOf(52.50970, 13.45280, 35.0, 9.3, 4.0),
        doubleArrayOf(52.51080, 13.45370, 36.0, 10.8, 3.5),
        doubleArrayOf(52.51190, 13.45490, 37.0, 8.2, 4.0),
        doubleArrayOf(52.51290, 13.45620, 37.0, 6.5, 4.5),
        doubleArrayOf(52.51370, 13.45740, 38.0, 3.1, 5.0),
        doubleArrayOf(52.51420, 13.45830, 38.0, 0.2, 4.0),
    )

    private val EVENING_WALK = arrayOf(
        doubleArrayOf(52.51420, 13.45830, 38.0, 1.2, 6.0),
        doubleArrayOf(52.51450, 13.45900, 38.0, 1.4, 5.5),
        doubleArrayOf(52.51480, 13.45970, 38.0, 1.3, 5.0),
        doubleArrayOf(52.51500, 13.46050, 38.0, 1.5, 5.5),
        doubleArrayOf(52.51480, 13.46130, 38.0, 1.4, 6.0),
        doubleArrayOf(52.51450, 13.46080, 38.0, 1.3, 5.5),
        doubleArrayOf(52.51430, 13.45970, 38.0, 1.2, 5.0),
        doubleArrayOf(52.51420, 13.45830, 38.0, 0.3, 6.0),
    )

    fun insertDummyData(db: DatabaseHelper): Int {
        val now = System.currentTimeMillis() / 1000
        var count = 0

        for (dayOffset in 6 downTo 0) {
            val dayMidnight = now - (now % 86400) - (dayOffset * 86400L)
            val battery = 92 - (dayOffset * 3)

            count += insertTrip(db, TRIP_HOME_TO_SUPERMARKET, dayMidnight + 9 * 3600 + 1800, 30L, battery, 0, 1, now)
            count += insertTrip(db, TRIP_SUPERMARKET_TO_GYM, dayMidnight + 10 * 3600 + 1200, 30L, battery, 15, 2, now)
            count += insertTrip(db, TRIP_GYM_TO_HOME, dayMidnight + 12 * 3600, 30L, battery, 30, 1, now)

            if (dayOffset % 2 == 0) continue
            count += insertTrip(db, EVENING_WALK, dayMidnight + 18 * 3600, 75L, battery, 45, 1, now)
        }
        return count
    }

    private fun insertTrip(
        db: DatabaseHelper,
        trip: Array<DoubleArray>,
        startTs: Long,
        stepSeconds: Long,
        batteryBase: Int,
        batteryOffset: Int,
        profileId: Int,
        nowCeiling: Long,
    ): Int {
        var inserted = 0
        for ((i, wp) in trip.withIndex()) {
            val ts = startTs + (i * stepSeconds)
            if (ts > nowCeiling) break
            db.saveLocation(
                wp[0], wp[1],
                wp[4], wp[2].toInt(), wp[3],
                null, batteryBase - batteryOffset - i, profileId, ts,
            )
            inserted++
        }
        return inserted
    }
}
