/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync

import com.Colota.data.DatabaseHelper
import com.Colota.sync.http.BatchResult
import com.Colota.sync.http.NetworkManager
import com.Colota.util.AppLogger
import org.json.JSONException
import org.json.JSONObject

/** Sends the queued geofence events at the end of a sync pass. */
class TransitionSender(
    private val dbHelper: DatabaseHelper,
    private val networkManager: NetworkManager,
    private val onRateLimited: (retryAfterSeconds: Long?) -> Unit
) {
    companion object {
        private const val TAG = "SyncManager"
        private const val MAX_PER_PASS = 50
    }

    /** One POST per event; a refused one waits for the next pass, any other failure ends the step. */
    suspend fun sendEach(endpoint: String, authHeaders: Map<String, String>, httpMethod: String): Int {
        var sent = 0
        for ((id, payload) in pending()) {
            val result = networkManager.sendToEndpoint(payload, endpoint, authHeaders, httpMethod, ApiFormat.FIELD_MAPPED)
            if (result == BatchResult.Success) {
                dbHelper.removeTransitions(listOf(id))
                sent++
                continue
            }
            if (result is BatchResult.RateLimited) onRateLimited(result.retryAfterSeconds)
            if (result !is BatchResult.ClientError) break
        }
        return sent
    }

    /** Overland: all waiting events in one request with an empty `locations`. */
    suspend fun sendAlone(endpoint: String, authHeaders: Map<String, String>): Int {
        val events = pending()
        if (events.isEmpty()) return 0
        val payloads = events.map { it.second }
        val result = networkManager.sendBatchToEndpoint(
            items = emptyList(),
            customFields = PayloadBuilder.extractEnvelopeCustomFields(payloads.first()),
            endpoint = endpoint,
            extraHeaders = authHeaders,
            transitions = payloads,
        )
        if (result == BatchResult.Success) {
            dbHelper.removeTransitions(events.map { it.first })
            return events.size
        }
        if (result is BatchResult.RateLimited) onRateLimited(result.retryAfterSeconds)
        return 0
    }

    private fun pending(): List<Pair<Long, JSONObject>> = dbHelper.getQueuedTransitions(MAX_PER_PASS).mapNotNull { row ->
        try {
            row.id to JSONObject(row.payload)
        } catch (e: JSONException) {
            AppLogger.e(TAG, "Corrupt transition row ${row.id}, dropping it", e)
            dbHelper.removeTransitions(listOf(row.id))
            null
        }
    }
}
