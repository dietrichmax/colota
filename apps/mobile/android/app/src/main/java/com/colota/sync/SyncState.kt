/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync

/**
 * What the last sync passes learned, readable from the bridge without a handle on the service's
 * SyncManager: the time of the last success and the masked message of the last failure that
 * crossed the consecutive-failure gate, cleared on the next success. The rate-limit wait lives here
 * too, because a Sync now while tracking is off runs on a service that stops after the pass.
 */
object SyncState {
    const val DEFAULT_RATE_LIMIT_WAIT_SECONDS = 60L
    const val MAX_RATE_LIMIT_WAIT_SECONDS = 900L

    @Volatile var lastSuccessTime: Long = 0L
        private set

    @Volatile var lastSyncError: String = ""
        private set

    @Volatile var rateLimitedUntil: Long = 0L
        private set

    /** Capped so a bad `Retry-After` cannot hold the queue for a day; a later, shorter one must not cut a longer wait. */
    @Synchronized
    fun holdFor(retryAfterSeconds: Long?, nowMs: Long): Long {
        val wait = (retryAfterSeconds ?: DEFAULT_RATE_LIMIT_WAIT_SECONDS).coerceIn(1, MAX_RATE_LIMIT_WAIT_SECONDS)
        val untilMs = nowMs + wait * 1000
        if (untilMs > rateLimitedUntil) rateLimitedUntil = untilMs
        return wait
    }

    /** Clamped to the cap, because the wall clock can be set back. */
    fun rateLimitWaitSeconds(nowMs: Long): Long {
        val left = (rateLimitedUntil - nowMs).coerceAtMost(MAX_RATE_LIMIT_WAIT_SECONDS * 1000)
        return if (left > 0) (left + 999) / 1000 else 0
    }

    fun recordSuccess(timeMs: Long) {
        lastSuccessTime = timeMs
        lastSyncError = ""
    }

    fun recordError(message: String) {
        lastSyncError = message
    }

    fun reset() {
        lastSuccessTime = 0L
        lastSyncError = ""
        rateLimitedUntil = 0L
    }
}
