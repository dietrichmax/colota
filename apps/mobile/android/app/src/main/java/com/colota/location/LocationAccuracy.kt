/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.location

/**
 * Positioning accuracy of the continuous location stream.
 *
 * [HIGH] lets the provider keep GNSS engaged. [BALANCED]
 * trades precision for battery by letting the provider prefer network / lower-power fixes.
 *
 * There is deliberately no `LOW_POWER` mode: its cell-tower, city-level fixes (~10 km) zigzag the track.
 */
enum class LocationAccuracy(val wireName: String) {
    HIGH("high"),
    BALANCED("balanced");

    companion object {
        /** Parses the stored/wire value, falling back to [HIGH] for anything unknown or absent. */
        fun fromWire(value: String?): LocationAccuracy {
            val name = value?.trim()
            return entries.firstOrNull { it.wireName.equals(name, ignoreCase = true) } ?: HIGH
        }
    }
}
