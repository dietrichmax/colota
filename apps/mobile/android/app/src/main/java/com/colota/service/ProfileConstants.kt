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
    const val CONDITION_STATIONARY = "stationary"

    /**
     * Conditions whose re-evaluation depends on a fresh stream of location fixes.
     * When any enabled profile uses one of these, the OS-level distance filter
     * must be bypassed so fixes continue to arrive even within the configured
     * movement threshold.
     */
    val LOCATION_DEPENDENT_CONDITIONS: Set<String> = setOf(
        CONDITION_SPEED_ABOVE,
        CONDITION_SPEED_BELOW,
        CONDITION_STATIONARY,
    )

    const val CACHE_TTL_MS = 30_000L
    const val SPEED_BUFFER_SIZE = 5
    const val MIN_INTERVAL_MS = 1000L
    const val STATIONARY_SPEED_THRESHOLD = 0.3f
    const val STATIONARY_TIMEOUT_MS = 60_000L
}
