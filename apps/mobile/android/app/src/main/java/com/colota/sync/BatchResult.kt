/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync

/**
 * Distinguishes 4xx from 5xx so the caller can split-on-4xx (poison row) without
 * amplifying 5xx outages into N more requests per cycle.
 */
sealed class BatchResult {
    object Success : BatchResult()
    data class ClientError(val code: Int) : BatchResult()
    data class ServerError(val code: Int) : BatchResult()
    object NetworkError : BatchResult()
}
