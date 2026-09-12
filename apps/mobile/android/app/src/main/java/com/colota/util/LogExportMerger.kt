/*
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.util

import java.io.File
import java.io.Writer

/**
 * Interleaves the JS ring buffer into the recorded log segments by timestamp while streaming them.
 *
 * The merge belongs here and not in JS because `getNativeLogs` only hands JS a capped tail of the
 * segments, so a JS-side merge would truncate the file it is meant to complete. Only the app log is
 * buffered, and the ring buffer bounds it.
 */
object LogExportMerger {

    /** "yyyy-MM-dd HH:mm:ss.SSS", the fixed prefix AppFileLogger writes on every line it owns. */
    private const val STAMP_LENGTH = 23

    fun merge(sources: List<File>, appLog: String, writer: Writer) {
        val pending = ArrayDeque(if (appLog.isEmpty()) emptyList() else appLog.trimEnd('\n').split("\n"))

        for (source in sources) {
            source.bufferedReader().use { reader ->
                reader.forEachLine { line ->
                    val stamp = stampOf(line)
                    if (stamp != null) drainUpTo(stamp, pending, writer)
                    writer.appendLine(line)
                }
            }
        }

        // Everything written since the last flush, which has no recorded line to sort against.
        while (pending.isNotEmpty()) writer.appendLine(pending.removeFirst())
    }

    private fun drainUpTo(stamp: String, pending: ArrayDeque<String>, writer: Writer) {
        while (true) {
            val head = pending.firstOrNull() ?: return
            // Unplaceable without a stamp, so it waits for the tail rather than jumping ahead.
            val headStamp = stampOf(head) ?: return
            if (headStamp > stamp) return
            writer.appendLine(pending.removeFirst())
        }
    }

    /** Null for a continuation, so a stack frame stays under the line that threw it. */
    fun stampOf(line: String): String? {
        if (line.length < STAMP_LENGTH) return null
        if (line[4] != '-' || line[7] != '-' || line[10] != ' ' || line[13] != ':' || line[16] != ':') return null
        return line.substring(0, STAMP_LENGTH)
    }
}
