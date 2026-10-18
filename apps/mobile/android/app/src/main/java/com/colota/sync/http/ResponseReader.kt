/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync.http

import com.Colota.util.AppLogger
import java.net.HttpURLConnection

/** Turns the reply on a connection into a result, then closes it. */
internal object ResponseReader {

    private const val TAG = "NetworkManager"
    private const val ERROR_BODY_MAX_CHARS = 200
    private val WHITESPACE = Regex("\\s+")

    fun readResponse(connection: HttpURLConnection): TestEndpointResult {
        val responseCode = connection.responseCode
        try {
            if (responseCode in 200..299) return TestEndpointResult(true, httpStatus = responseCode)
            val errorBody = readErrorBody(connection)
            return TestEndpointResult(
                false,
                httpStatus = responseCode,
                errorMessage = "Server returned $responseCode: $errorBody",
                retryAfterSeconds = if (responseCode == 429) retryAfterOf(connection) else null
            )
        } finally {
            discardBody(connection)
        }
    }

    fun readBatchResponse(connection: HttpURLConnection, batchSize: Int): BatchResult {
        val responseCode = connection.responseCode
        try {
            return batchVerdict(connection, responseCode, batchSize)
        } finally {
            discardBody(connection)
        }
    }

    private fun batchVerdict(connection: HttpURLConnection, responseCode: Int, batchSize: Int): BatchResult =
        when (responseCode) {
            in 200..299 -> {
                AppLogger.d(TAG, "Batch of $batchSize sent successfully")
                BatchResult.Success
            }
            429 -> {
                val retryAfter = retryAfterOf(connection)
                AppLogger.w(TAG, "Batch rate limited (429)" + (retryAfter?.let { ", retry after ${it}s" } ?: ""))
                BatchResult.RateLimited(retryAfter)
            }
            in 400..499 -> {
                val errorBody = readErrorBody(connection)
                AppLogger.w(TAG, "Batch rejected (4xx): $responseCode - $errorBody")
                BatchResult.ClientError(responseCode)
            }
            in 500..599 -> {
                val errorBody = readErrorBody(connection)
                AppLogger.e(TAG, "Batch failed (5xx): $responseCode - $errorBody")
                BatchResult.ServerError(responseCode)
            }
            else -> {
                AppLogger.e(TAG, "Batch failed with unexpected code: $responseCode")
                BatchResult.ServerError(responseCode)
            }
        }

    // disconnect() alone leaves a connection whose reply was never closed in the platform's pool for minutes.
    fun discardBody(connection: HttpURLConnection) {
        try {
            (connection.errorStream ?: connection.inputStream)?.close()
        } catch (_: Exception) {
        }
    }

    private fun retryAfterOf(connection: HttpURLConnection): Long? =
        parseRetryAfter(connection.getHeaderField("Retry-After"), System.currentTimeMillis())

    /**
     * Bounded and single-line. A rate-limited flush logs one of these per rejected point, and an
     * nginx error page is 7 lines each - enough to push real events out of the rolling log file.
     */
    fun readErrorBody(connection: HttpURLConnection): String = try {
        connection.errorStream?.bufferedReader()?.use { it.readText() }
            ?.replace(WHITESPACE, " ")?.trim()?.take(ERROR_BODY_MAX_CHARS) ?: "No error body"
    } catch (_: Exception) { "Could not read error body" }
}
