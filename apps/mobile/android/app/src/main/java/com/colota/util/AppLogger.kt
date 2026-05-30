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
        AppFileLogger.log("DEBUG", tag, msg)
    }

    fun i(tag: String, msg: String) {
        Log.i(PREFIX + tag, msg)
        AppFileLogger.log("INFO", tag, msg)
    }

    fun w(tag: String, msg: String) {
        Log.w(PREFIX + tag, msg)
        AppFileLogger.log("WARN", tag, msg)
    }

    fun e(tag: String, msg: String, throwable: Throwable? = null) {
        val t = PREFIX + tag
        if (throwable != null) Log.e(t, msg, throwable) else Log.e(t, msg)
        val fileMsg = if (throwable != null) "$msg :: ${throwable.javaClass.simpleName}: ${throwable.message}" else msg
        AppFileLogger.log("ERROR", tag, fileMsg)
    }

    private val sensitiveHeaderPatterns = listOf(
        "authorization", "bearer", "token", "secret", "password", "api-key", "apikey"
    )

    private val sensitiveQueryRegex = Regex(
        "(?:^|[-_.])(token|secret|password|api[-_]?key|access[-_]?token|auth)(?:\$|[-_.])",
        RegexOption.IGNORE_CASE
    )

    /**
     * Masks the value of sensitive HTTP headers before logging.
     * Shows the first 4 characters followed by "***", or "***" for values shorter than 5.
     */
    fun maskSensitiveHeaderValue(headerName: String, headerValue: String): String {
        val nameLower = headerName.lowercase()
        val isSensitive = sensitiveHeaderPatterns.any { pattern -> nameLower.contains(pattern) }
        if (!isSensitive) return headerValue
        return maskValue(headerValue)
    }

    /**
     * Masks sensitive query parameter values inside a URL before logging.
     * Returns the input unchanged if the URL has no query string or can't be parsed.
     */
    fun maskSensitiveUrlValues(url: String): String {
        return try {
            val uri = android.net.Uri.parse(url)
            val names = uri.queryParameterNames
            if (names.isEmpty()) return url

            val builder = uri.buildUpon().clearQuery()
            for (name in names) {
                val isSensitive = sensitiveQueryRegex.containsMatchIn(name)
                for (value in uri.getQueryParameters(name)) {
                    builder.appendQueryParameter(name, if (isSensitive) maskValue(value) else value)
                }
            }
            builder.build().toString()
        } catch (_: Exception) {
            url
        }
    }

    private fun maskValue(value: String): String =
        if (value.length > 4) "${value.substring(0, 4)}***" else "***"
}
