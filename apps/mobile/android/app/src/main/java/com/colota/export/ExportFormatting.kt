/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.export

import com.Colota.util.BatteryStatus
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

internal fun isoTime(unixSeconds: Long): String {
    val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    sdf.timeZone = TimeZone.getTimeZone("UTC")
    return sdf.format(Date(unixSeconds * 1000))
}

internal fun jsonValue(value: Any?): String = when (value) {
    null -> "null"
    is String -> "\"${escapeJson(value)}\""
    is Double, is Float -> jsNum(value)
    else -> value.toString()
}

/** Human-readable battery-status label for exports; null if not recorded. */
internal fun batteryStatusLabel(v: Any?): String? = when (v) {
    is Long -> BatteryStatus.toDisplayString(v.toInt())
    is Int -> BatteryStatus.toDisplayString(v)
    is Double -> BatteryStatus.toDisplayString(v.toInt())
    else -> null
}

/** Escape free text for XML element content (GPX/KML notes). */
internal fun xmlEscape(s: String): String = buildString(s.length) {
    for (c in s) {
        when (c) {
            '&' -> append("&amp;")
            '<' -> append("&lt;")
            '>' -> append("&gt;")
            '"' -> append("&quot;")
            '\'' -> append("&apos;")
            else -> append(c)
        }
    }
}

/** RFC-4180 CSV field: quote+double-escape only when the value contains a delimiter. */
internal fun csvField(value: Any?): String {
    val s = value?.toString() ?: return ""
    return if (s.any { it == ',' || it == '"' || it == '\n' || it == '\r' }) {
        "\"" + s.replace("\"", "\"\"") + "\""
    } else {
        s
    }
}

private fun escapeJson(s: String): String = buildString(s.length) {
    for (c in s) {
        when (c) {
            '"' -> append("\\\"")
            '\\' -> append("\\\\")
            '\n' -> append("\\n")
            '\r' -> append("\\r")
            '\t' -> append("\\t")
            '\b' -> append("\\b")
            '\u000C' -> append("\\f")
            else -> if (c < ' ') append("\\u${c.code.toString(16).padStart(4, '0')}") else append(c)
        }
    }
}

/** Match JS number formatting: whole-valued doubles drop the trailing ".0". */
internal fun jsNum(v: Any): String = when (v) {
    is Double -> if (v.isFinite() && v == Math.floor(v) && kotlin.math.abs(v) < 1e15) v.toLong().toString() else v.toString()
    is Float -> jsNum(v.toDouble())
    else -> v.toString()
}

/** Numeric field with a `0` default for null (mirrors JS `?? 0` / `|| 0`). */
internal fun numOrZero(v: Any?): String = if (v == null) "0" else jsNum(v)
