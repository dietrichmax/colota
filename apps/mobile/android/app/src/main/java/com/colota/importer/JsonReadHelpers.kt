/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.importer

import android.util.JsonReader
import android.util.JsonToken
import java.time.OffsetDateTime
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

internal fun JsonReader.readNullableInt(): Int? = when (peek()) {
    JsonToken.NULL -> { nextNull(); null }
    JsonToken.NUMBER -> nextDouble().toInt()
    JsonToken.STRING -> nextString().toIntOrNull()
    else -> { skipValue(); null }
}

internal fun JsonReader.readNullableDouble(): Double? = when (peek()) {
    JsonToken.NULL -> { nextNull(); null }
    JsonToken.NUMBER -> nextDouble()
    JsonToken.STRING -> nextString().toDoubleOrNull()
    else -> { skipValue(); null }
}

// DateTimeFormatter is thread-safe and ~10x faster than SimpleDateFormat - the
// per-instance cost matters for Timeline files with 100k+ ISO timestamps.
private val ISO_FORMATTERS = listOf(
    DateTimeFormatter.ISO_OFFSET_DATE_TIME,
    DateTimeFormatter.ISO_ZONED_DATE_TIME,
)

internal fun parseIso8601Seconds(s: String): Long? {
    for (formatter in ISO_FORMATTERS) {
        try {
            return OffsetDateTime.parse(s, formatter).toEpochSecond()
        } catch (_: DateTimeParseException) {
        }
    }
    // ZonedDateTime tolerates bracketed zone IDs like "...+02:00[Europe/Berlin]".
    return try {
        ZonedDateTime.parse(s).toEpochSecond()
    } catch (_: DateTimeParseException) {
        null
    }
}
