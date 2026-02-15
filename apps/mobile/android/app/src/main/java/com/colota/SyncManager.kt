/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota

import android.util.Log
import kotlinx.coroutines.*
import org.json.JSONObject

/**
 * Manages location sync queue processing, batch uploads, and retry logic.
 * Extracted from LocationForegroundService for separation of concerns.
 */
class SyncManager(
    private val dbHelper: DatabaseHelper,
    private val networkManager: NetworkManager,
    private val scope: CoroutineScope
) {
    companion object {
        private const val TAG = "SyncManager"
    }

    // --- Config (set via updateConfig) ---
    private var endpoint: String = ""
    private var syncIntervalSeconds: Int = 0
    private var retryIntervalSeconds: Int = 300
    private var maxRetries: Int = 5
    private var isOfflineMode: Boolean = false
    private var authHeaders: Map<String, String> = emptyMap()

    // --- Sync state ---
    private var syncJob: Job? = null
    private var lastSyncTime: Long = 0
    var lastSuccessfulSyncTime: Long = 0
        private set
    private var syncInitialized = false
    private var consecutiveFailures = 0

    // --- Queue count cache ---
    private var cachedQueuedCount: Int = 0
    private var lastQueueCountCheck: Long = 0
    private val QUEUE_COUNT_CACHE_MS = 5000L

    // Batch limit to prevent infinite syncing
    private val MAX_BATCHES_PER_SYNC = 10 // Max 500 items per sync cycle

    fun updateConfig(
        endpoint: String,
        syncIntervalSeconds: Int,
        retryIntervalSeconds: Int,
        maxRetries: Int,
        isOfflineMode: Boolean,
        authHeaders: Map<String, String>
    ) {
        this.endpoint = endpoint
        this.syncIntervalSeconds = syncIntervalSeconds
        this.retryIntervalSeconds = retryIntervalSeconds
        this.maxRetries = maxRetries
        this.isOfflineMode = isOfflineMode
        this.authHeaders = authHeaders
    }

    // ========================================
    // PUBLIC API
    // ========================================

    fun startPeriodicSync() {
        syncJob = scope.launch {
            while (isActive) {
                val baseDelay = calculateNextSyncDelay()
                delay(baseDelay * 1000L)

                if (isOfflineMode || !networkManager.isNetworkAvailable()) {
                    continue
                }

                if (endpoint.isNotBlank() && getCachedQueuedCount() > 0) {
                    try {
                        val success = performSyncAndCheckSuccess()

                        if (success) {
                            if (consecutiveFailures > 0 && BuildConfig.DEBUG) {
                                Log.i(TAG, "Sync restored")
                            }
                            consecutiveFailures = 0
                        } else {
                            consecutiveFailures++
                            applyBackoffDelay()
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Sync error", e)
                        consecutiveFailures++
                        delay(30000)
                    }
                }
            }
        }
    }

    fun stopPeriodicSync() {
        syncJob?.cancel()
        syncJob = null
    }

    suspend fun manualFlush() {
        if (endpoint.isNotBlank()) {
            syncQueue()
        }
    }

    suspend fun queueAndSend(locationId: Long, payload: JSONObject) {
        val queueId = dbHelper.addToQueue(locationId, payload.toString())

        invalidateQueueCache()

        if (endpoint.isBlank() || isOfflineMode) {
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Queued location $locationId - ${if (isOfflineMode) "offline mode" else "no endpoint"}")
            }
            return
        }

        // Immediate send mode (syncInterval = 0)
        if (syncIntervalSeconds == 0 && networkManager.isNetworkAvailable()) {
            Log.d(TAG, "Instant send")
            val success = networkManager.sendToEndpoint(payload, endpoint, authHeaders)

            if (success) {
                dbHelper.removeFromQueueByLocationId(locationId)
                invalidateQueueCache()
                lastSuccessfulSyncTime = System.currentTimeMillis()
            } else {
                dbHelper.incrementRetryCount(queueId, "Send failed")
            }
        }
        // If syncInterval > 0, the periodic sync job will handle it
    }

    fun getCachedQueuedCount(): Int {
        val now = System.currentTimeMillis()

        if (now - lastQueueCountCheck > QUEUE_COUNT_CACHE_MS) {
            cachedQueuedCount = dbHelper.getQueuedCount()
            lastQueueCountCheck = now
        }

        return cachedQueuedCount
    }

    fun invalidateQueueCache() {
        lastQueueCountCheck = 0
    }

    // ========================================
    // INTERNAL SYNC LOGIC
    // ========================================

    private suspend fun performSyncAndCheckSuccess(): Boolean {
        val countBefore = dbHelper.getQueuedCount()
        syncQueue()
        val countAfter = dbHelper.getQueuedCount()

        invalidateQueueCache()

        val success = countAfter < countBefore || countAfter == 0
        if (success && countAfter == 0) {
            lastSuccessfulSyncTime = System.currentTimeMillis()
        }

        return success
    }

    private suspend fun applyBackoffDelay() {
        val backoffSeconds = when (consecutiveFailures) {
            1 -> 30L
            2 -> 60L
            3 -> 300L
            else -> 900L
        }

        if (BuildConfig.DEBUG) {
            Log.w(TAG, "Backoff: ${backoffSeconds}s")
        }

        delay(backoffSeconds * 1000L)
    }

    /**
     * Batch limit to prevent infinite syncing.
     * Processes max 500 items (10 batches x 50 items) per sync cycle.
     */
    private suspend fun syncQueue() = coroutineScope {
        var totalProcessed = 0
        var batchNumber = 1

        while (isActive && batchNumber <= MAX_BATCHES_PER_SYNC) {
            val queued = dbHelper.getQueuedLocations(50)
            if (queued.isEmpty()) {
                if (BuildConfig.DEBUG && totalProcessed > 0) {
                    Log.d(TAG, "Sync complete: $totalProcessed items in $batchNumber batches")
                }
                break
            }

            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Processing batch $batchNumber/$MAX_BATCHES_PER_SYNC: ${queued.size} items")
            }

            for (chunk in queued.chunked(10)) {
                val successfulIds = mutableListOf<Long>()
                val permanentlyFailedIds = mutableListOf<Long>()

                val (retriable, exceeded) = chunk.partition { it.retryCount < maxRetries }

                permanentlyFailedIds.addAll(exceeded.map { it.queueId })
                if (BuildConfig.DEBUG && exceeded.isNotEmpty()) {
                    Log.w(TAG, "Removing ${exceeded.size} items that exceeded $maxRetries retries")
                }

                val results = retriable.map { item ->
                    async {
                        val success = networkManager.sendToEndpoint(
                            JSONObject(item.payload),
                            endpoint,
                            authHeaders
                        )
                        item.queueId to success
                    }
                }.awaitAll()

                results.forEach { (queueId, success) ->
                    if (success) {
                        successfulIds.add(queueId)
                    } else {
                        val item = retriable.first { it.queueId == queueId }
                        dbHelper.incrementRetryCount(queueId, "Send failed")

                        if (item.retryCount + 1 >= maxRetries) {
                            permanentlyFailedIds.add(queueId)
                            if (BuildConfig.DEBUG) {
                                Log.w(TAG, "Item $queueId reached max retries")
                            }
                        }
                    }
                }

                val toRemove = successfulIds + permanentlyFailedIds
                if (toRemove.isNotEmpty()) {
                    dbHelper.removeBatchFromQueue(toRemove)
                    totalProcessed += toRemove.size
                }

                yield()
            }

            batchNumber++
        }

        if (batchNumber > MAX_BATCHES_PER_SYNC && BuildConfig.DEBUG) {
            Log.w(TAG, "Sync paused: reached batch limit. Remaining items will sync next cycle.")
        }

        invalidateQueueCache()

        if (totalProcessed > 0) {
            lastSuccessfulSyncTime = System.currentTimeMillis()
        }
    }

    private fun calculateNextSyncDelay(): Long {
        if (syncIntervalSeconds <= 0) {
            return if (getCachedQueuedCount() > 0) {
                retryIntervalSeconds.toLong()
            } else {
                30L
            }
        }

        val now = System.currentTimeMillis()
        if (!syncInitialized) {
            lastSyncTime = now
            syncInitialized = true
            return syncIntervalSeconds.toLong()
        }

        val elapsedSeconds = (now - lastSyncTime) / 1000
        val remaining = syncIntervalSeconds - elapsedSeconds

        return if (remaining <= 0) {
            lastSyncTime = now
            syncIntervalSeconds.toLong()
        } else {
            remaining
        }
    }
}
