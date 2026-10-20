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
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import org.json.JSONException
import org.json.JSONObject

/** Posts each queue row as its own request, a chunk of them in parallel. */
class PointSender(
    private val dbHelper: DatabaseHelper,
    private val networkManager: NetworkManager,
    private val onRateLimited: (retryAfterSeconds: Long?) -> Unit
) {
    companion object {
        private const val TAG = "SyncManager"
    }

    /** [stopReason] is set when the pass should end after this chunk. */
    data class ChunkResult(val sent: Int, val failed: Int, val stopReason: String?)

    /** A row that fails without a bump joins [keptInPlace], so the rest of the pass does not post it again. */
    suspend fun sendChunk(
        chunk: List<QueuedLocation>,
        endpoint: String,
        authHeaders: Map<String, String>,
        httpMethod: String,
        apiFormat: ApiFormat,
        keptInPlace: MutableSet<Long>,
    ): ChunkResult = coroutineScope {
        val successfulIds = mutableListOf<Long>()
        var failed = 0

        val results = chunk.map { item ->
            async {
                val result = try {
                    networkManager.sendToEndpoint(
                        JSONObject(item.payload),
                        endpoint,
                        authHeaders,
                        httpMethod,
                        apiFormat
                    )
                } catch (e: JSONException) {
                    AppLogger.e(TAG, "Corrupt queue row ${item.queueId}", e)
                    null
                } catch (e: Exception) {
                    AppLogger.e(TAG, "Failed to send item ${item.queueId}", e)
                    BatchResult.NetworkError
                }
                item.queueId to result
            }
        }.awaitAll()

        results.forEach { (queueId, result) ->
            if (result == BatchResult.Success) {
                successfulIds.add(queueId)
            } else {
                val reason = if (result == null) "Corrupt payload" else retryReason(result)
                if (reason != null) {
                    dbHelper.incrementRetryCount(queueId, reason)
                } else {
                    keptInPlace.add(queueId)
                }
                failed++
            }
        }

        if (successfulIds.isNotEmpty()) {
            val sentLocationIds = chunk.filter { it.queueId in successfulIds }.map { it.locationId }
            dbHelper.markLocationsSent(sentLocationIds)
            dbHelper.removeBatchFromQueue(successfulIds)
        }

        val limited = results.mapNotNull { it.second as? BatchResult.RateLimited }
        if (limited.isNotEmpty()) {
            onRateLimited(limited.maxOf { it.retryAfterSeconds ?: SyncState.DEFAULT_RATE_LIMIT_WAIT_SECONDS })
        }
        ChunkResult(successfulIds.size, failed, stopReason(results.map { it.second }, anySent = successfulIds.isNotEmpty()))
    }
}
