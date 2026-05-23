/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.util

import android.util.Log
import com.Colota.BuildConfig

/**
 * App-level logger. Always active so logs are available for the Activity Log screen.
 *
 * All tags are prefixed with "Colota." so native log export can filter on that prefix.
 */
object AppLogger {

    private const val PREFIX = "Colota."

    fun d(tag: String, msg: String) {
        Log.d(PREFIX + tag, msg)
    }

    fun i(tag: String, msg: String) {
        Log.i(PREFIX + tag, msg)
    }

    fun w(tag: String, msg: String) {
        Log.w(PREFIX + tag, msg)
    }

    fun e(tag: String, msg: String, throwable: Throwable? = null) {
        val t = PREFIX + tag
        if (throwable != null) Log.e(t, msg, throwable) else Log.e(t, msg)
    }

    private val sensitiveHeaderPatterns = listOf(
        "authorization", "bearer", "token", "secret", "password", "api-key", "apikey"
    )

    /**
     * Masks the value of sensitive HTTP headers before logging.
     * Shows the first 4 characters followed by "***", or "***" for values shorter than 5.
     */
    fun maskSensitiveHeaderValue(headerName: String, headerValue: String): String {
        val nameLower = headerName.lowercase()
        val isSensitive = sensitiveHeaderPatterns.any { pattern -> nameLower.contains(pattern) }
        if (!isSensitive) return headerValue

        return if (headerValue.length > 4) {
            "${headerValue.substring(0, 4)}***"
        } else {
            "***"
        }
    }
}
