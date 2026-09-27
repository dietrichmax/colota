/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync

import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/**
 * Distinguishes 4xx from 5xx so the caller can split-on-4xx (poison row) without
 * amplifying 5xx outages into N more requests per cycle. A 429 is its own case: it
 * is about the client's pace, never about one row.
 *
 * Returned by [NetworkManager.sendBatchToEndpoint] and [NetworkManager.sendToEndpoint].
 */
sealed class BatchResult {
    object Success : BatchResult()
    data class ClientError(val code: Int) : BatchResult()
    data class ServerError(val code: Int) : BatchResult()
    data class RateLimited(val retryAfterSeconds: Long?) : BatchResult()
    object NetworkError : BatchResult()
}

internal fun verdictFor(status: Int, retryAfterSeconds: Long?): BatchResult = when (status) {
    in 200..299 -> BatchResult.Success
    429 -> BatchResult.RateLimited(retryAfterSeconds)
    in 400..499 -> BatchResult.ClientError(status)
    else -> BatchResult.ServerError(status)
}

/** `Retry-After` is either delta-seconds or an HTTP date (RFC 9110); anything else is ignored. */
internal fun parseRetryAfter(value: String?, nowMs: Long): Long? {
    val trimmed = value?.trim().orEmpty()
    if (trimmed.isEmpty()) return null
    trimmed.toLongOrNull()?.let { return it.coerceAtLeast(0) }
    return try {
        val at = ZonedDateTime.parse(trimmed, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli()
        ((at - nowMs) / 1000).coerceAtLeast(0)
    } catch (_: Exception) {
        null
    }
}

/**
 * Returned by [NetworkManager.testEndpoint]. Carries enough detail for the
 * Test Connection UI to show a precise error.
 */
data class TestEndpointResult(
    val ok: Boolean,
    val httpStatus: Int = 0,
    val errorMessage: String? = null,
    val retryAfterSeconds: Long? = null,
)
