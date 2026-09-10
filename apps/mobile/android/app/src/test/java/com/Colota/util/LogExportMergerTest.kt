package com.Colota.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.StringWriter

class LogExportMergerTest {

    @get:Rule
    val temp = TemporaryFolder()

    private fun segment(name: String, vararg lines: String): File =
        temp.newFile(name).apply { writeText(lines.joinToString("\n") + "\n") }

    private fun merged(sources: List<File>, appLog: String): List<String> {
        val writer = StringWriter()
        LogExportMerger.merge(sources, appLog, writer)
        return writer.toString().trimEnd('\n').split("\n").filter { it.isNotEmpty() }
    }

    /** One timeline, or a maintainer cross-references a Kotlin stream against a JS stream by hand. */
    @Test
    fun `app log lines land between the recorded lines they happened between`() {
        val recorded = segment(
            "seg1.log",
            "2026-09-09 09:00:00.000 INFO/Service: started",
            "2026-09-09 09:00:10.000 INFO/Service: fix received"
        )
        val appLog = "2026-09-09 09:00:05.000 WARN/JS: endpoint unreachable\n"

        val out = merged(listOf(recorded), appLog)

        assertEquals(3, out.size)
        assertEquals("2026-09-09 09:00:00.000 INFO/Service: started", out[0])
        assertEquals("2026-09-09 09:00:05.000 WARN/JS: endpoint unreachable", out[1])
        assertEquals("2026-09-09 09:00:10.000 INFO/Service: fix received", out[2])
    }

    /** The buffer is written up to the export while the file was flushed earlier, so this is normal. */
    @Test
    fun `app log lines after the last recorded line are still written`() {
        val recorded = segment("seg1.log", "2026-09-09 09:00:00.000 INFO/Service: started")
        val appLog = "2026-09-09 09:30:00.000 INFO/JS: screen opened\n"

        val out = merged(listOf(recorded), appLog)

        assertEquals(2, out.size)
        assertEquals("2026-09-09 09:30:00.000 INFO/JS: screen opened", out[1])
    }

    /** Oldest segment first, so the exported file reads in the order the events happened. */
    @Test
    fun `segments are walked in the order they are given`() {
        val older = segment("seg1.log", "2026-09-09 08:00:00.000 INFO/Service: yesterday's tail")
        val newer = segment("seg2.log", "2026-09-09 10:00:00.000 INFO/Service: today")
        val appLog = "2026-09-09 09:00:00.000 INFO/JS: between the two\n"

        val out = merged(listOf(older, newer), appLog)

        assertEquals("2026-09-09 08:00:00.000 INFO/Service: yesterday's tail", out[0])
        assertEquals("2026-09-09 09:00:00.000 INFO/JS: between the two", out[1])
        assertEquals("2026-09-09 10:00:00.000 INFO/Service: today", out[2])
    }

    /** Placing a stack frame by timestamp tears the trace off the line that threw it. */
    @Test
    fun `a continuation stays with the line it belongs to`() {
        val recorded = segment(
            "seg1.log",
            "2026-09-09 09:00:00.000 ERROR/Sync: network error",
            "\tat com.Colota.sync.NetworkManager.run(NetworkManager.kt:88)",
            "\tat com.Colota.sync.SyncManager.flush(SyncManager.kt:214)",
            "2026-09-09 09:00:20.000 INFO/Service: recovered"
        )
        val appLog = "2026-09-09 09:00:10.000 WARN/JS: retry scheduled\n"

        val out = merged(listOf(recorded), appLog)

        assertEquals("2026-09-09 09:00:00.000 ERROR/Sync: network error", out[0])
        assertEquals("\tat com.Colota.sync.NetworkManager.run(NetworkManager.kt:88)", out[1])
        assertEquals("\tat com.Colota.sync.SyncManager.flush(SyncManager.kt:214)", out[2])
        assertEquals("2026-09-09 09:00:10.000 WARN/JS: retry scheduled", out[3])
    }

    @Test
    fun `an empty app log leaves the recorded file byte for byte`() {
        val recorded = segment(
            "seg1.log",
            "2026-09-09 09:00:00.000 INFO/Service: started",
            "2026-09-09 09:00:10.000 INFO/Service: fix received"
        )

        val out = merged(listOf(recorded), "")

        assertEquals(2, out.size)
        assertEquals("2026-09-09 09:00:00.000 INFO/Service: started", out[0])
    }

    /** Nothing recorded is the fresh-capture case; the app log is still worth handing over. */
    @Test
    fun `an app log with no segments is written on its own`() {
        val out = merged(emptyList(), "2026-09-09 09:00:00.000 INFO/JS: only source\n")

        assertEquals(1, out.size)
        assertEquals("2026-09-09 09:00:00.000 INFO/JS: only source", out[0])
    }

    @Test
    fun `only a full stamp counts as one`() {
        assertEquals("2026-09-09 09:00:00.000", LogExportMerger.stampOf("2026-09-09 09:00:00.000 INFO/Tag: msg"))
        assertNull(LogExportMerger.stampOf("\tat com.Colota.Foo.bar(Foo.kt:1)"))
        assertNull(LogExportMerger.stampOf("short"))
        assertNull(LogExportMerger.stampOf("2026/09/09 09:00:00.000 INFO/Tag: msg"))
    }
}
