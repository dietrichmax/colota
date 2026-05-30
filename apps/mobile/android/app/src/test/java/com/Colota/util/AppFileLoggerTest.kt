package com.Colota.util

import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class AppFileLoggerTest {

    @get:Rule
    val tempFolder = TemporaryFolder()

    private lateinit var logDir: File
    private lateinit var logger: AppFileLogger

    @Before
    fun setUp() {
        logDir = tempFolder.newFolder("logs")
        // Long interval so the scheduled flush never fires; tests flush explicitly via flushNow().
        logger = AppFileLogger(logDir = logDir, flushIntervalMs = TimeUnit.HOURS.toMillis(1))
    }

    @After
    fun tearDown() {
        logger.shutdown()
    }

    @Test
    fun `log writes entry to file when enabled`() {
        logger.setEnabled(true)
        logger.log("INFO", "TAG", "hello")
        logger.flushNow()

        val file = File(logDir, AppFileLogger.LOG_FILE)
        assertTrue("log file should exist", file.exists())
        assertTrue(file.readText().contains("INFO/TAG: hello"))
    }

    @Test
    fun `log is a no-op when disabled`() {
        logger.setEnabled(false)
        logger.log("INFO", "TAG", "should-not-appear")
        logger.flushNow()

        assertFalse(File(logDir, AppFileLogger.LOG_FILE).exists())
    }

    @Test
    fun `getRecentEntries returns lines in write order`() {
        logger.setEnabled(true)
        for (i in 0 until 20) {
            logger.log("INFO", "TAG", "marker-$i")
        }
        logger.flushNow()

        val markers = logger.getRecentEntries().mapNotNull {
            Regex("marker-(\\d+)").find(it)?.groupValues?.get(1)?.toInt()
        }
        assertEquals((0 until 20).toList(), markers)
    }

    @Test
    fun `clear removes the log file`() {
        logger.setEnabled(true)
        repeat(5) { logger.log("INFO", "TAG", "entry-$it") }
        logger.flushNow()

        logger.clear()

        assertFalse(File(logDir, AppFileLogger.LOG_FILE).exists())
        assertEquals(0L, logger.currentSizeBytes())
    }

    @Test
    fun `writes after clear recreate the file`() {
        logger.setEnabled(true)
        logger.log("INFO", "TAG", "first")
        logger.flushNow()

        logger.clear()
        logger.log("INFO", "TAG", "second")
        logger.flushNow()

        val content = File(logDir, AppFileLogger.LOG_FILE).readText()
        assertFalse(content.contains("first"))
        assertTrue(content.contains("second"))
    }

    @Test
    fun `flushNow returns synchronously with data on disk`() {
        logger.setEnabled(true)
        logger.log("INFO", "TAG", "sync-check")
        logger.flushNow()

        assertTrue(File(logDir, AppFileLogger.LOG_FILE).readText().contains("sync-check"))
    }

    @Test
    fun `getRecentEntries caps to the most recent LIVE_TAIL_LINES`() {
        logger.setEnabled(true)
        val total = AppFileLogger.LIVE_TAIL_LINES + 500
        repeat(total) { logger.log("INFO", "TAG", "marker-$it") }
        logger.flushNow()

        val markers = logger.getRecentEntries().mapNotNull {
            Regex("marker-(\\d+)").find(it)?.groupValues?.get(1)?.toInt()
        }
        assertEquals("live view must cap at LIVE_TAIL_LINES", AppFileLogger.LIVE_TAIL_LINES, markers.size)
        assertEquals("must keep the most recent entry", total - 1, markers.last())
        assertEquals("oldest kept is exactly total - cap", total - AppFileLogger.LIVE_TAIL_LINES, markers.first())
    }

    @Test
    fun `getRecentEntries flushes the buffer before reading`() {
        logger.setEnabled(true)
        logger.log("INFO", "TAG", "buffered-only")
        // Deliberately no flushNow() call - getRecentEntries() must do its own flush.

        val entries = logger.getRecentEntries()
        assertTrue("getRecentEntries must return buffered entries: $entries", entries.any { it.contains("buffered-only") })
    }

    @Test
    fun `currentSizeBytes flushes the buffer before measuring`() {
        logger.setEnabled(true)
        logger.log("INFO", "TAG", "size-check-message-with-some-bytes")

        assertTrue("currentSizeBytes must reflect buffered writes", logger.currentSizeBytes() > 0L)
    }

    @Test
    fun `isEnabled reflects setEnabled state`() {
        assertFalse(logger.isEnabled())
        logger.setEnabled(true)
        assertTrue(logger.isEnabled())
        logger.setEnabled(false)
        assertFalse(logger.isEnabled())
    }

    @Test
    fun `concurrent log calls do not corrupt the file`() {
        logger.setEnabled(true)

        val threads = 8
        val perThread = 50
        val pool = Executors.newFixedThreadPool(threads)
        val latch = CountDownLatch(threads)
        repeat(threads) { t ->
            pool.execute {
                try {
                    repeat(perThread) { i -> logger.log("INFO", "T$t", "msg-$i") }
                } finally {
                    latch.countDown()
                }
            }
        }
        assertTrue(latch.await(10, TimeUnit.SECONDS))
        pool.shutdown()
        logger.flushNow()

        val entries = logger.getRecentEntries()
        assertEquals(threads * perThread, entries.size)
        val malformed = entries.filterNot { it.matches(Regex(".*msg-\\d+$")) }
        assertTrue("malformed lines: $malformed", malformed.isEmpty())
    }

    @Test
    fun `rotation bounds disk use and preserves the most recent entries`() {
        // Tiny cap so a few writes force several rotations.
        val maxBytes = 1024L
        val rotating = AppFileLogger(
            logDir = tempFolder.newFolder("rotate"),
            flushIntervalMs = TimeUnit.HOURS.toMillis(1),
            maxFileBytes = maxBytes
        )
        try {
            rotating.setEnabled(true)
            val total = 500
            repeat(total) { rotating.log("INFO", "TAG", "marker-$it") }
            rotating.flushNow()

            // Bounded to ~2x the cap; slack covers the line that tips a segment over.
            val size = rotating.currentSizeBytes()
            assertTrue("size must be non-zero", size > 0L)
            assertTrue("size must stay bounded (was $size)", size <= 2 * maxBytes + 256)

            val markers = rotating.getRecentEntries().mapNotNull {
                Regex("marker-(\\d+)").find(it)?.groupValues?.get(1)?.toInt()
            }
            assertFalse("must have retained some entries", markers.isEmpty())
            assertEquals("most recent entry must survive rotation", total - 1, markers.last())
            assertFalse("oldest entry must have been rotated out", markers.contains(0))
            assertEquals(
                "retained entries must be a contiguous, in-order suffix",
                (markers.first()..markers.last()).toList(), markers
            )
        } finally {
            rotating.shutdown()
        }
    }

    @Test
    fun `logFiles spans segments oldest first for a gapless export`() {
        val dir = tempFolder.newFolder("rotate-export")
        val rotating = AppFileLogger(
            logDir = dir,
            flushIntervalMs = TimeUnit.HOURS.toMillis(1),
            maxFileBytes = 1024L
        )
        try {
            rotating.setEnabled(true)
            repeat(200) { rotating.log("INFO", "TAG", "marker-$it") }
            rotating.flushNow()

            assertTrue(
                "rotation must have produced a previous segment",
                File(dir, AppFileLogger.LOG_FILE_PREV).exists()
            )

            val files = rotating.logFiles()
            assertTrue("export must include at least the rotated segment", files.isNotEmpty())
            // Active file is briefly absent if the last write rotated, so only check order when both exist.
            val names = files.map { it.name }
            val idxPrev = names.indexOf(AppFileLogger.LOG_FILE_PREV)
            val idxActive = names.indexOf(AppFileLogger.LOG_FILE)
            if (idxPrev >= 0 && idxActive >= 0) {
                assertTrue("rotated segment must come before the active file", idxPrev < idxActive)
            }

            val markers = files.flatMap { it.readLines() }.mapNotNull {
                Regex("marker-(\\d+)").find(it)?.groupValues?.get(1)?.toInt()
            }
            assertEquals(
                "concatenated export must be contiguous and ordered",
                (markers.first()..markers.last()).toList(), markers
            )
            assertEquals("export must include the most recent entry", 199, markers.last())
        } finally {
            rotating.shutdown()
        }
    }
}
