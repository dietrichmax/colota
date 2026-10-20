/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync

/** When the periodic sync loop next ticks, and how long it waits after failed passes. */
class SyncSchedule(private val clock: () -> Long) {
    companion object {
        fun backoffSeconds(consecutiveFailures: Int): Long = when (consecutiveFailures) {
            1 -> 30L
            2 -> 60L
            3 -> 300L
            else -> 900L
        }
    }

    @Volatile private var lastSyncTime: Long = 0
    @Volatile private var syncInitialized = false

    /** Measured from when the running wait began, so a changed interval applies to it. */
    fun nextPeriodicDelaySeconds(syncIntervalSeconds: Int, resumingWait: Boolean): Long {
        val now = clock()
        if (!syncInitialized) {
            lastSyncTime = now
            syncInitialized = true
            return syncIntervalSeconds.toLong()
        }

        val elapsedSeconds = (now - lastSyncTime) / 1000
        val remaining = syncIntervalSeconds - elapsedSeconds

        return when {
            remaining > 0 -> remaining
            resumingWait -> 0L
            else -> {
                lastSyncTime = now
                syncIntervalSeconds.toLong()
            }
        }
    }
}
