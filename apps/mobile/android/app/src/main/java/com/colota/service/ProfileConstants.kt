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

    /**
     * A run of fixes survives two consecutive missed ones; the third breaks it. Measured against the
     * most recent gap rather than the configured interval, which Doze and the provider ignore.
     */
    const val STATIONARY_GAP_TOLERANCE_FACTOR = 3

    /** Floor on that tolerance, for a run with no gap yet to measure against. */
    const val STATIONARY_MIN_GAP_TOLERANCE_MS = 60_000L

    /**
     * Ceiling on it, however sparse the last gap was. Sized off the app's own sparsest real cadence
     * (allow-while-idle alarms batch to roughly 9 minutes), not off what a stalled timer can reach.
     */
    const val STATIONARY_MAX_GAP_TOLERANCE_MS = 900_000L
}
