/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync.http

import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

internal object EndpointUrl {

    /**
     * Resolves template variables in the endpoint URL.
     * Uses the location's timestamp, not wall clock time,
     * so queued sends get the correct date.
     */
    fun resolveUrlVariables(endpoint: String, payload: JSONObject): String {
        if (!endpoint.contains('%')) return endpoint

        val tst = payload.optLong("tst", 0L)
        val timestamp = if (tst > 0) tst else System.currentTimeMillis() / 1000
        val zoned = Instant.ofEpochSecond(timestamp).atZone(ZoneId.systemDefault())

        return endpoint
            .replace("%DATE", zoned.format(DateTimeFormatter.ISO_LOCAL_DATE))
            .replace("%YEAR", zoned.year.toString())
            .replace("%MONTH", String.format(java.util.Locale.ROOT, "%02d", zoned.monthValue))
            .replace("%DAY", String.format(java.util.Locale.ROOT, "%02d", zoned.dayOfMonth))
            .replace("%TIMESTAMP", timestamp.toString())
    }
}
