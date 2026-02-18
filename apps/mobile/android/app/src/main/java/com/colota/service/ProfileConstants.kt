/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

object ProfileConstants {
    const val CONDITION_CHARGING = "charging"
    const val CONDITION_ANDROID_AUTO = "android_auto"
    const val CONDITION_SPEED_ABOVE = "speed_above"
    const val CONDITION_SPEED_BELOW = "speed_below"

    const val CACHE_TTL_MS = 30_000L
    const val SPEED_BUFFER_SIZE = 5
    const val MIN_INTERVAL_MS = 1000L
}
