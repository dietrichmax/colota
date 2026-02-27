/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync

import com.Colota.util.AppLogger
import com.Colota.bridge.LocationServiceModule
import com.Colota.data.DatabaseHelper
import com.Colota.util.TimedCache
import kotlinx.coroutines.*
import org.json.JSONObject

/**
 * Two sync modes: instant (syncInterval=0) sends each location on arrival,
 * periodic (syncInterval>0) batches uploads at the configured interval.
 */
class SyncManager(
    private val dbHelper: DatabaseHelper,
    private val networkManager: NetworkManager,
    private val scope: CoroutineScope
) {
    companion object {
        private const val TAG = "SyncManager"
        private const val MAX_BATCHES_PER_SYNC = 10
    }

    @Volatile private var endpoint: String = ""
    @Volatile private var syncIntervalSeconds: Int = 0
    @Volatile private var retryIntervalSeconds: Int = 300
    @Volatile private var maxRetries: Int = 5
    @Volatile private var isOfflineMode: Boolean = false
    @Volatile private var isWifiOnlySync: Boolean = false
    @Volatile private var authHeaders: Map<String, String> = emptyMap()
    @Volatile private var httpMethod: String = "POST"

    private var syncJob: Job? = null
    @Volatile private var lastSyncTime: Long = 0
    @Volatile var lastSuccessfulSyncTime: Long = 0
        private set
    @Volatile private var syncInitialized = false
    @Volatile private var consecutiveFailures = 0

    private val queueCountCache = TimedCache(5000L) { dbHelper.getQueuedCount() }

    fun updateConfig(
        endpoint: String,
        syncIntervalSeconds: Int,
        retryIntervalSeconds: Int,
        maxRetries: Int,
        isOfflineMode: Boolean,
        isWifiOnlySync: Boolean,
        authHeaders: Map<String, String>,
        httpMethod: String = "POST"
    ) {
        this.endpoint = endpoint
        this.syncIntervalSeconds = syncIntervalSeconds
        this.retryIntervalSeconds = retryIntervalSeconds
        this.maxRetries = maxRetries
        this.isOfflineMode = isOfflineMode
        this.isWifiOnlySync = isWifiOnlySync
        this.authHeaders = authHeaders
        this.httpMethod = httpMethod
    }

    fun startPeriodicSync() {
        AppLogger.d(TAG, "Starting periodic sync: interval=${syncIntervalSeconds}s, endpoint=${if (endpoint.isBlank()) "NONE" else endpoint}")
        syncJob = scope.launch {
            while (isActive) {
                val baseDelay = calculateNextSyncDelay()
                delay(baseDelay * 1000L)

                if (isOfflineMode || !networkManager.isNetworkAvailable() ||
                    (isWifiOnlySync && !networkManager.isUnmeteredConnection())) {
                    continue
                }

                if (endpoint.isNotBlank() && getCachedQueuedCount() > 0) {
                    val errorMessage: String? = try {
                        val success = performSyncAndCheckSuccess()

                        if (success) {
                            if (consecutiveFailures > 0) {
                                AppLogger.i(TAG, "Sync restored")
                            }
                            consecutiveFailures = 0
                            null
                        } else {
                            "Sync failed"
                        }
                    } catch (e: Exception) {
                        AppLogger.e(TAG, "Sync error", e)
                        e.message ?: "Sync error"
                    }

                    if (errorMessage != null) {
                        consecutiveFailures++
                        if (consecutiveFailures >= 3) {
                            LocationServiceModule.sendSyncErrorEvent(
                                "$errorMessage ($consecutiveFailures consecutive failures)",
                                getCachedQueuedCount()
                            )
                        }
                        applyBackoffDelay()
                    }
                }
            }
        }
    }

    fun stopPeriodicSync() {
        syncJob?.cancel()
        syncJob = null
        AppLogger.d(TAG, "Periodic sync stopped")
    }

    suspend fun manualFlush() {
        if (endpoint.isNotBlank()) {
            val total = dbHelper.getQueuedCount()
            AppLogger.d(TAG, "Manual flush started: $total items in queue")
            syncQueue { sent, failed -> LocationServiceModule.sendSyncProgressEvent(sent, failed, total) }
        }
    }

    suspend fun queueAndSend(locationId: Long, payload: JSONObject) {
        val queueId = dbHelper.addToQueue(locationId, payload.toString())

        invalidateQueueCache()

        if (endpoint.isBlank() || isOfflineMode) {
            AppLogger.d(TAG, "Queued location $locationId - ${if (isOfflineMode) "offline mode" else "no endpoint"}")
            return
        }

        // Immediate send mode (syncInterval = 0)
        if (syncIntervalSeconds == 0 && networkManager.isNetworkAvailable() &&
            !(isWifiOnlySync && !networkManager.isUnmeteredConnection())) {
            AppLogger.d(TAG, "Instant send")
            val success = networkManager.sendToEndpoint(payload, endpoint, authHeaders, httpMethod)

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

    fun getCachedQueuedCount(): Int = queueCountCache.get()

    fun invalidateQueueCache() = queueCountCache.invalidate()

    private suspend fun performSyncAndCheckSuccess(): Boolean {
        val countBefore = dbHelper.getQueuedCount()
        syncQueue(onProgress = null)
        val countAfter = dbHelper.getQueuedCount()

        invalidateQueueCache()

        val success = countAfter < countBefore || countAfter == 0
        if (success && countAfter == 0) {
            lastSuccessfulSyncTime = System.currentTimeMillis()
        }

        return success
    }

    // Exponential backoff: 30s → 60s → 5min → 15min
    private suspend fun applyBackoffDelay() {
        val backoffSeconds = when (consecutiveFailures) {
            1 -> 30L
            2 -> 60L
            3 -> 300L
            else -> 900L
        }

        AppLogger.w(TAG, "Backoff: ${backoffSeconds}s")

        delay(backoffSeconds * 1000L)
    }

    private suspend fun syncQueue(onProgress: ((sent: Int, failed: Int) -> Unit)? = null) = coroutineScope {
        // Snapshot volatile config so it stays consistent for the entire sync pass
        val currentEndpoint = endpoint
        val currentAuthHeaders = authHeaders
        val currentHttpMethod = httpMethod
        val currentMaxRetries = maxRetries  // 0 = retry forever, >0 = give up after N attempts

        var totalProcessed = 0
        var totalSucceeded = 0
        var totalFailed = 0
        var batchNumber = 1

        while (isActive && batchNumber <= MAX_BATCHES_PER_SYNC) {
            val queued = dbHelper.getQueuedLocations(50)
            if (queued.isEmpty()) {
                if (totalProcessed > 0) {
                    AppLogger.d(TAG, "Sync complete: $totalProcessed items in $batchNumber batches")
                }
                break
            }

            AppLogger.d(TAG, "Processing batch $batchNumber/$MAX_BATCHES_PER_SYNC: ${queued.size} items")

            // Chunks of 10 concurrent HTTP requests to avoid flooding the server
            val processedBefore = totalProcessed

            for (chunk in queued.chunked(10)) {
                val successfulIds = mutableListOf<Long>()
                val permanentlyFailedIds = mutableListOf<Long>()

                val (retriable, exceeded) = if (currentMaxRetries <= 0) {
                    chunk to emptyList()
                } else {
                    chunk.partition { it.retryCount < currentMaxRetries }
                }

                permanentlyFailedIds.addAll(exceeded.map { it.queueId })
                if (exceeded.isNotEmpty()) {
                    AppLogger.w(TAG, "Removing ${exceeded.size} items that exceeded $currentMaxRetries retries")
                }

                val results = retriable.map { item ->
                    async {
                        val success = networkManager.sendToEndpoint(
                            JSONObject(item.payload),
                            currentEndpoint,
                            currentAuthHeaders,
                            currentHttpMethod
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

                        if (currentMaxRetries > 0 && item.retryCount + 1 >= currentMaxRetries) {
                            permanentlyFailedIds.add(queueId)
                            AppLogger.w(TAG, "Item $queueId reached max retries")
                        }
                    }
                }

                val toRemove = successfulIds + permanentlyFailedIds
                if (toRemove.isNotEmpty()) {
                    dbHelper.removeBatchFromQueue(toRemove)

                    totalProcessed += toRemove.size
                    totalSucceeded += successfulIds.size
                    totalFailed += permanentlyFailedIds.size
                    onProgress?.invoke(totalSucceeded, totalFailed)
                }

                yield()
            }

            // No items removed from queue. Stop re-fetching the same failing items
            if (totalProcessed == processedBefore) {
                AppLogger.d(TAG, "No progress in batch $batchNumber, stopping sync pass")
                break
            }

            batchNumber++
        }

        if (batchNumber > MAX_BATCHES_PER_SYNC) {
            AppLogger.w(TAG, "Sync paused: reached batch limit. Remaining items will sync next cycle.")
        }

        invalidateQueueCache()

        if (totalSucceeded > 0) {
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
