/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.util

/**
 * Single source of truth for Colota's compressed battery-status taxonomy.
 *
 * DeviceInfoHelper maps Android's raw BatteryManager.BATTERY_STATUS_* values into these
 * four ints, which are then persisted as the `bs` field on every queued location and
 * re-encoded for each backend's wire format (Traccar's `is_charging` boolean, Overland's
 * `battery_state` string, etc).
 */
object BatteryStatus {
    const val UNKNOWN = 0
    const val DISCHARGING = 1
    const val CHARGING = 2
    const val FULL = 3

    fun isPluggedIn(bs: Int): Boolean = bs == CHARGING || bs == FULL

    /** Maps to the Overland-iOS `battery_state` string convention. */
    fun toOverlandString(bs: Int): String = when (bs) {
        DISCHARGING -> "unplugged"
        CHARGING -> "charging"
        FULL -> "full"
        else -> "unknown"
    }

    /** Human-readable label for UI / log output. */
    fun toDisplayString(bs: Int): String = when (bs) {
        UNKNOWN -> "Unknown"
        DISCHARGING -> "Unplugged/Discharging"
        CHARGING -> "Charging"
        FULL -> "Full"
        else -> "Unknown ($bs)"
    }
}
