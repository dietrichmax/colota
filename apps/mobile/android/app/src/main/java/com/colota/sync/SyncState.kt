/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync

/**
 * What the last sync passes learned, readable from the bridge without a handle on the service's
 * SyncManager: the time of the last success and the masked message of the last failure that
 * crossed the consecutive-failure gate, cleared on the next success.
 */
object SyncState {
    @Volatile var lastSuccessTime: Long = 0L
        private set

    @Volatile var lastSyncError: String = ""
        private set

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
    }
}
