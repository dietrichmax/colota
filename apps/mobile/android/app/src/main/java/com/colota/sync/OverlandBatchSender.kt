/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync

import com.Colota.data.DatabaseHelper
import com.Colota.data.QueuedLocation
import com.Colota.sync.http.BatchResult
import com.Colota.sync.http.NetworkManager
import com.Colota.util.AppLogger
import kotlinx.coroutines.yield
import org.json.JSONObject

/** Posts queue rows as one Overland batch and bisects a rejected batch down to the rows the server refuses. */
class OverlandBatchSender(
    private val dbHelper: DatabaseHelper,
    private val networkManager: NetworkManager,
    private val onRateLimited: (retryAfterSeconds: Long?) -> Unit
) {
    companion object {
        private const val TAG = "SyncManager"
    }

    data class BatchSendResult(val processed: Int, val failed: Int, val stop: Boolean)

    /** [onProgress] hears each finished piece of the bisect: the rows it sent and the rows it failed. */
    suspend fun sendBatchRecursive(
        items: List<QueuedLocation>,
        endpoint: String,
        authHeaders: Map<String, String>,
        onProgress: (sent: Int, failed: Int) -> Unit = { _, _ -> },
    ): BatchSendResult {
        if (items.isEmpty()) return BatchSendResult(0, 0, false)

        // One corrupt payload must not fail the whole batch
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
        if (corruptedFailed > 0) onProgress(0, corruptedFailed)
        if (parsed.isEmpty()) {
            return BatchSendResult(processed = 0, failed = corruptedFailed, stop = false)
        }

        val parseableItems = parsed.map { it.first }
        val payloads = parsed.map { it.second }
        val customFields = PayloadBuilder.extractEnvelopeCustomFields(payloads.first())

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
                onProgress(parseableItems.size, 0)
                BatchSendResult(processed = parseableItems.size, failed = corruptedFailed, stop = false)
            }
            is BatchResult.ClientError -> {
                if (parseableItems.size == 1) {
                    dbHelper.incrementRetryCount(parseableItems[0].queueId, "4xx: ${result.code}")
                    onProgress(0, 1)
                    BatchSendResult(processed = 0, failed = 1 + corruptedFailed, stop = false)
                } else {
                    val mid = parseableItems.size / 2
                    val left = sendBatchRecursive(parseableItems.take(mid), endpoint, authHeaders, onProgress)
                    if (left.stop) return BatchSendResult(left.processed, left.failed + corruptedFailed, stop = true)
                    yield()
                    val right = sendBatchRecursive(parseableItems.drop(mid), endpoint, authHeaders, onProgress)
                    BatchSendResult(
                        processed = left.processed + right.processed,
                        failed = left.failed + right.failed + corruptedFailed,
                        stop = left.stop || right.stop,
                    )
                }
            }
            is BatchResult.ServerError -> {
                retryReason(result)?.let { reason ->
                    parseableItems.forEach { dbHelper.incrementRetryCount(it.queueId, reason) }
                }
                onProgress(0, parseableItems.size)
                BatchSendResult(processed = 0, failed = parseableItems.size + corruptedFailed, stop = true)
            }
            is BatchResult.RateLimited -> {
                onRateLimited(result.retryAfterSeconds)
                onProgress(0, parseableItems.size)
                BatchSendResult(processed = 0, failed = parseableItems.size + corruptedFailed, stop = true)
            }
            BatchResult.NetworkError -> {
                onProgress(0, parseableItems.size)
                BatchSendResult(processed = 0, failed = parseableItems.size + corruptedFailed, stop = true)
            }
        }
    }
}
