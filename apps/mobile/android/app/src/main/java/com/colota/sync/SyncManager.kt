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
    @Volatile private var isOfflineMode: Boolean = false
    @Volatile private var syncCondition: String = "any"
    @Volatile private var syncSsid: String = ""
    @Volatile private var authHeaders: Map<String, String> = emptyMap()
    @Volatile private var httpMethod: String = "POST"
    @Volatile private var apiFormat: ApiFormat = ApiFormat.FIELD_MAPPED
    @Volatile private var overlandBatchSize: Int = 50

    // Names PayloadBuilder writes when usesFixedFieldNames=true. Anything else in the payload
    // is a user-configured custom field (device_id, tid, etc.) and lifts to envelope level.
    private val canonicalLocationKeys = setOf("lat", "lon", "acc", "alt", "vel", "batt", "bs", "tst", "bear")

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
        isOfflineMode: Boolean,
        syncCondition: String,
        syncSsid: String,
        authHeaders: Map<String, String>,
        httpMethod: String = "POST",
        apiFormat: ApiFormat = ApiFormat.FIELD_MAPPED,
        overlandBatchSize: Int = 50,
    ) {
        this.endpoint = endpoint
        this.syncIntervalSeconds = syncIntervalSeconds
        this.retryIntervalSeconds = retryIntervalSeconds
        this.isOfflineMode = isOfflineMode
        this.syncCondition = syncCondition
        this.syncSsid = syncSsid
        this.authHeaders = authHeaders
        this.httpMethod = httpMethod
        this.apiFormat = apiFormat
        this.overlandBatchSize = overlandBatchSize.coerceIn(1, 500)
    }

    fun startPeriodicSync() {
        AppLogger.d(TAG, "Starting periodic sync: interval=${syncIntervalSeconds}s, endpoint=${if (endpoint.isBlank()) "NONE" else endpoint}")
        syncJob = scope.launch {
            while (isActive) {
                val baseDelay = calculateNextSyncDelay()
                delay(baseDelay * 1000L)

                if (!isSyncAllowed()) {
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
        if (isOfflineMode) {
            AppLogger.d(TAG, "Skipping queue for location $locationId - offline mode")
            return
        }

        val queueId = dbHelper.addToQueue(locationId, payload.toString())

        invalidateQueueCache()

        if (endpoint.isBlank()) {
            AppLogger.d(TAG, "Queued location $locationId - no endpoint configured")
            return
        }

        // Immediate send mode (syncInterval = 0)
        if (syncIntervalSeconds == 0 && isSyncAllowed()) {
            AppLogger.d(TAG, "Instant send")
            val success = networkManager.sendToEndpoint(payload, endpoint, authHeaders, httpMethod, apiFormat)

            if (success) {
                dbHelper.markLocationsSent(listOf(locationId))
                dbHelper.removeFromQueueByLocationId(locationId)
                invalidateQueueCache()
                lastSuccessfulSyncTime = System.currentTimeMillis()
            } else {
                dbHelper.incrementRetryCount(queueId, "Send failed")
            }
        }
        // If syncInterval > 0, the periodic sync job will handle it
    }

    fun isSyncAllowed(): Boolean {
        if (isOfflineMode || !networkManager.isNetworkAvailable()) return false
        val allowed = when (syncCondition) {
            "wifi_any" -> networkManager.isUnmeteredConnection()
            "wifi_ssid" -> networkManager.isConnectedToSsid(syncSsid)
            "vpn" -> networkManager.isVpnConnected()
            else -> true // "any"
        }
        if (!allowed && syncCondition != "any") {
            AppLogger.d(TAG, "Sync skipped: condition=$syncCondition not met")
        }
        return allowed
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
        val currentApiFormat = apiFormat
        val currentBatchSize = overlandBatchSize
        var totalProcessed = 0
        var totalSucceeded = 0
        var totalFailed = 0
        var batchNumber = 1

        while (isActive && batchNumber <= MAX_BATCHES_PER_SYNC) {
            val fetchSize = if (currentApiFormat == ApiFormat.OVERLAND_BATCH) currentBatchSize else 50
            val queued = dbHelper.getQueuedLocations(fetchSize)
            if (queued.isEmpty()) {
                if (totalProcessed > 0) {
                    AppLogger.d(TAG, "Sync complete: $totalProcessed items in $batchNumber batches")
                }
                break
            }

            AppLogger.d(TAG, "Processing batch $batchNumber/$MAX_BATCHES_PER_SYNC: ${queued.size} items")

            // Chunks of 10 concurrent HTTP requests to avoid flooding the server
            val processedBefore = totalProcessed

            if (currentApiFormat == ApiFormat.OVERLAND_BATCH) {
                val result = sendBatchRecursive(queued, currentEndpoint, currentAuthHeaders)
                totalProcessed += result.processed
                totalSucceeded += result.processed
                totalFailed += result.failed
                if (result.processed > 0) onProgress?.invoke(totalSucceeded, totalFailed)
                if (result.stop) {
                    AppLogger.d(TAG, "Sync pass aborted by transport failure")
                    break
                }
            } else {
                for (chunk in queued.chunked(10)) {
                    val successfulIds = mutableListOf<Long>()

                    val results = chunk.map { item ->
                        async {
                            try {
                                val itemPayload = JSONObject(item.payload)
                                val success = networkManager.sendToEndpoint(
                                    itemPayload,
                                    currentEndpoint,
                                    currentAuthHeaders,
                                    currentHttpMethod,
                                    currentApiFormat
                                )
                                item.queueId to success
                            } catch (e: Exception) {
                                AppLogger.e(TAG, "Failed to send item ${item.queueId}", e)
                                item.queueId to false
                            }
                        }
                    }.awaitAll()

                    results.forEach { (queueId, success) ->
                        if (success) {
                            successfulIds.add(queueId)
                        } else {
                            dbHelper.incrementRetryCount(queueId, "Send failed")
                            totalFailed++
                        }
                    }

                    if (successfulIds.isNotEmpty()) {
                        val sentLocationIds = chunk.filter { it.queueId in successfulIds }.map { it.locationId }
                        dbHelper.markLocationsSent(sentLocationIds)
                        dbHelper.removeBatchFromQueue(successfulIds)

                        totalProcessed += successfulIds.size
                        totalSucceeded += successfulIds.size
                        onProgress?.invoke(totalSucceeded, totalFailed)
                    }

                    yield()
                }
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

    private data class BatchSendResult(val processed: Int, val failed: Int, val stop: Boolean)

    /**
     * Endpoint and auth headers are passed by parameter (not read from volatiles)
     * so a settings change mid-pass cannot mix them across recursive calls.
     */
    private suspend fun sendBatchRecursive(
        items: List<com.Colota.data.QueuedLocation>,
        endpoint: String,
        authHeaders: Map<String, String>,
    ): BatchSendResult {
        if (items.isEmpty()) return BatchSendResult(0, 0, false)

        // Isolate corrupt rows so one bad payload doesn't poison the whole batch
        // (matches the per-item path's per-item try/catch).
        val parsed = items.mapNotNull { item ->
            try {
                item to JSONObject(item.payload)
            } catch (e: Exception) {
                AppLogger.e(TAG, "Corrupt queue row ${item.queueId}, bumping retry counter", e)
                dbHelper.incrementRetryCount(item.queueId, "Corrupt payload")
                null
            }
        }
        val corruptedFailed = items.size - parsed.size
        if (parsed.isEmpty()) {
            return BatchSendResult(processed = 0, failed = corruptedFailed, stop = false)
        }

        val parseableItems = parsed.map { it.first }
        val payloads = parsed.map { it.second }
        val customFields = extractEnvelopeCustomFields(payloads.first())

        val result = networkManager.sendBatchToEndpoint(
            items = payloads,
            customFields = customFields,
            endpoint = endpoint,
            extraHeaders = authHeaders,
        )

        return when (result) {
            BatchResult.Success -> {
                dbHelper.markLocationsSent(parseableItems.map { it.locationId })
                dbHelper.removeBatchFromQueue(parseableItems.map { it.queueId })
                BatchSendResult(processed = parseableItems.size, failed = corruptedFailed, stop = false)
            }
            is BatchResult.ClientError -> {
                if (parseableItems.size == 1) {
                    dbHelper.incrementRetryCount(parseableItems[0].queueId, "4xx: ${result.code}")
                    BatchSendResult(processed = 0, failed = 1 + corruptedFailed, stop = false)
                } else {
                    val mid = parseableItems.size / 2
                    val left = sendBatchRecursive(parseableItems.take(mid), endpoint, authHeaders)
                    yield()
                    val right = sendBatchRecursive(parseableItems.drop(mid), endpoint, authHeaders)
                    BatchSendResult(
                        processed = left.processed + right.processed,
                        failed = left.failed + right.failed + corruptedFailed,
                        stop = left.stop || right.stop,
                    )
                }
            }
            is BatchResult.ServerError -> {
                parseableItems.forEach { dbHelper.incrementRetryCount(it.queueId, "5xx: ${result.code}") }
                BatchSendResult(processed = 0, failed = parseableItems.size + corruptedFailed, stop = true)
            }
            BatchResult.NetworkError -> {
                parseableItems.forEach { dbHelper.incrementRetryCount(it.queueId, "network") }
                BatchSendResult(processed = 0, failed = parseableItems.size + corruptedFailed, stop = true)
            }
        }
    }

    private fun extractEnvelopeCustomFields(payload: JSONObject): Map<String, String> {
        val fields = mutableMapOf<String, String>()
        val keys = payload.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            if (key !in canonicalLocationKeys) {
                fields[key] = payload.optString(key, "")
            }
        }
        return fields
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
