/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync

import com.Colota.sync.http.BatchResult

/** Only a verdict about the row moves it back in the queue; an outage or a rate limit is the server's. */
internal fun retryReason(result: BatchResult): String? = when (result) {
    is BatchResult.ClientError -> "4xx: ${result.code}"
    is BatchResult.ServerError -> if (result.code in 502..504) null else "5xx: ${result.code}"
    BatchResult.Success, BatchResult.NetworkError, is BatchResult.RateLimited -> null
}

/** A 429 ends the pass outright; an outage or a 5xx does once a whole chunk got nothing through. */
internal fun stopReason(results: List<BatchResult?>, anySent: Boolean): String? {
    results.filterIsInstance<BatchResult.RateLimited>().firstOrNull()?.let { limited ->
        return "rate limited" + (limited.retryAfterSeconds?.let { ", retry after ${it}s" } ?: "")
    }
    if (anySent) return null
    results.filterIsInstance<BatchResult.ServerError>().firstOrNull()?.let { return "server error ${it.code}" }
    if (BatchResult.NetworkError in results) return "server unreachable"
    return null
}
