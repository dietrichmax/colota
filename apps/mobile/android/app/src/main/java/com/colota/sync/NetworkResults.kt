/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync

/**
 * Distinguishes 4xx from 5xx so the caller can split-on-4xx (poison row) without
 * amplifying 5xx outages into N more requests per cycle.
 *
 * Returned by [NetworkManager.sendBatchToEndpoint].
 */
sealed class BatchResult {
    object Success : BatchResult()
    data class ClientError(val code: Int) : BatchResult()
    data class ServerError(val code: Int) : BatchResult()
    object NetworkError : BatchResult()
}

/**
 * Returned by [NetworkManager.testEndpoint]. Carries enough detail for the
 * Test Connection UI to show a precise error.
 */
data class TestEndpointResult(
    val ok: Boolean,
    val httpStatus: Int = 0,
    val errorMessage: String? = null,
)
