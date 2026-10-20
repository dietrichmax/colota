/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.export

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object ExportFilenames {

    /** Filename-safe stamp for export files (e.g. `2026-05-28_1430`). */
    fun exportFilenameStamp(): String =
        SimpleDateFormat("yyyy-MM-dd_HHmm", Locale.US).format(Date())

    const val FILENAME_MARKER = "colota_export"
    const val DEFAULT_FILENAME_TEMPLATE = "colota_export_{date}_{time}"

    // Together these stay well inside the 255-byte filesystem name limit.
    private const val MAX_TEMPLATE_LENGTH = 100
    private const val MAX_DEVICE_LENGTH = 32

    // Braces are escaped on both sides: Android compiles patterns with ICU, which rejects a bare
    // closing brace that the JDK engine used by unit tests accepts.
    private val FILENAME_TOKEN = Regex("""\{(date|time)\}""")
    private val ILLEGAL_FILENAME_CHARS = Regex("""[\\/:*?"<>|\{\}\x00-\x1F\x7F]""")
    private val FILENAME_WHITESPACE = Regex("""[\s\p{Z}\uFEFF]+""")

    // SAF renames a colliding file to "name (1).ext"; that is still our file.
    private const val DEDUPE_SUFFIX_PATTERN = """(?: \(\d+\))?"""

    /**
     * The marker lets cleanup tell Colota's files from the user's; `{date}` and `{time}` keep each
     * export uniquely named and chronologically sortable.
     */
    fun isValidFilenameTemplate(template: String): Boolean =
        template.length <= MAX_TEMPLATE_LENGTH &&
            template.contains(FILENAME_MARKER) &&
            template.contains("{date}") &&
            template.contains("{time}")

    /** [template] must already have passed [isValidFilenameTemplate]. */
    fun renderExportFilename(
        template: String,
        format: String,
        deviceName: String,
        now: Date = Date()
    ): String {
        val base = resolveTemplate(template, deviceName)
            .replace("{date}", SimpleDateFormat("yyyy-MM-dd", Locale.US).format(now))
            .replace("{time}", SimpleDateFormat("HHmm", Locale.US).format(now))
            .let { ILLEGAL_FILENAME_CHARS.replace(it, "") }
            .trim(::isTrimmable)

        return base + ExportConverters.extensionFor(format)
    }

    /**
     * Substitutes `{device}` up front so the matcher and the renderer see the same literals. An
     * empty or dot-ending device name would otherwise shift where the end trim lands.
     */
    private fun resolveTemplate(template: String, deviceName: String): String =
        template.replace("{device}", sanitizeDevicePart(deviceName))

    /** Whitespace goes entirely (`Pixel 7` -> `Pixel7`), not just the illegal characters. */
    private fun sanitizeDevicePart(deviceName: String): String =
        ILLEGAL_FILENAME_CHARS.replace(FILENAME_WHITESPACE.replace(deviceName, ""), "").take(MAX_DEVICE_LENGTH)

    private fun isTrimmable(c: Char): Boolean = c == '.' || c.isWhitespace()

    /**
     * Recognizes files [renderExportFilename] produced from the same template. Anchored, so a
     * directory, a sync artifact or another device's export does not match. Any known export
     * extension is accepted so switching format does not orphan older files from retention.
     */
    class ExportFileMatcher internal constructor(
        private val regex: Regex,
        private val dateGroup: Int,
        private val timeGroup: Int
    ) {
        fun matches(name: String): Boolean = regex.matches(name)

        /** Sortable `yyyy-MM-ddHHmm` stamp, or null when [name] is not ours. */
        fun stamp(name: String): String? {
            val match = regex.matchEntire(name) ?: return null
            return match.groupValues[dateGroup] + match.groupValues[timeGroup]
        }
    }

    fun exportFileMatcher(template: String, deviceName: String): ExportFileMatcher {
        val resolved = resolveTemplate(template, deviceName)
        val tokens = FILENAME_TOKEN.findAll(resolved).toList()

        val pattern = StringBuilder()
        var dateGroup = 0
        var timeGroup = 0
        var group = 0
        var cursor = 0

        tokens.forEachIndexed { index, token ->
            pattern.append(literalPattern(resolved.substring(cursor, token.range.first), index == 0, false))
            group++
            if (token.groupValues[1] == "date") {
                pattern.append("""(\d{4}-\d{2}-\d{2})""")
                if (dateGroup == 0) dateGroup = group
            } else {
                pattern.append("""(\d{4})""")
                if (timeGroup == 0) timeGroup = group
            }
            cursor = token.range.last + 1
        }
        pattern.append(literalPattern(resolved.substring(cursor), tokens.isEmpty(), true))
        pattern.append(DEDUPE_SUFFIX_PATTERN)
        pattern.append(EXTENSION_PATTERN)

        return ExportFileMatcher(Regex(pattern.toString()), dateGroup, timeGroup)
    }

    // A SAF provider appends the canonical extension for the MIME it was given when the name does
    // not already end in one, so files written before the geo+json fix are named ".geojson.json".
    private const val PROVIDER_SUFFIX_PATTERN = "(?:\\.json|\\.xml|\\.txt)?"

    // lazy so it does not depend on where extensionFor's format objects sit in the init order.
    private val EXTENSION_PATTERN: String by lazy {
        listOf("csv", "geojson", "gpx", "kml").joinToString("|", "(?:", ")") { Regex.escape(ExportConverters.extensionFor(it)) } +
            PROVIDER_SUFFIX_PATTERN
    }

    /** The rendered name is trimmed at both ends, so the outermost literals are trimmed too. */
    private fun literalPattern(raw: String, first: Boolean, last: Boolean): String {
        var literal = ILLEGAL_FILENAME_CHARS.replace(raw, "")
        if (first) literal = literal.trimStart(::isTrimmable)
        if (last) literal = literal.trimEnd(::isTrimmable)
        return if (literal.isEmpty()) "" else Regex.escape(literal)
    }

    /**
     * Falls back to the default template so files written before a template change stay managed.
     * Skipped for `{device}` templates: a default-named file could have come from any device, and
     * deleting another phone's exports is worse than leaving a few of our own behind.
     */
    fun exportFileMatchers(template: String, deviceName: String): List<ExportFileMatcher> =
        if (template == DEFAULT_FILENAME_TEMPLATE || template.contains("{device}")) {
            listOf(exportFileMatcher(template, deviceName))
        } else {
            listOf(exportFileMatcher(template, deviceName), exportFileMatcher(DEFAULT_FILENAME_TEMPLATE, deviceName))
        }

    data class ExportEntry(val name: String, val lastModified: Long, val isFile: Boolean)

    /**
     * Oldest-first selection of the entries beyond [retentionCount]. Ordering prefers the stamp in
     * the filename; lastModified is only a tiebreak because SAF providers may omit the column
     * (returning 0) and cloud providers restamp on sync.
     */
    fun selectForDeletion(
        entries: List<ExportEntry>,
        retentionCount: Int,
        matchers: List<ExportFileMatcher>
    ): List<ExportEntry> {
        if (retentionCount <= 0) return emptyList()
        val ours = entries.filter { entry -> matchers.any { it.matches(entry.name) } && entry.isFile }
        val toDelete = ours.size - retentionCount
        if (toDelete <= 0) return emptyList()
        return ours
            .sortedWith(compareBy({ stampOf(it.name, matchers) }, { it.lastModified }, { it.name }))
            .take(toDelete)
    }

    /** Sort key for an export filename; empty when no matcher recognizes it. */
    fun stampOf(name: String, matchers: List<ExportFileMatcher>): String =
        matchers.firstNotNullOfOrNull { it.stamp(name) } ?: ""
}
