/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
package com.Colota.util

import android.content.Context
import androidx.annotation.VisibleForTesting
import java.io.BufferedWriter
import java.io.File
import java.io.FileWriter
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

class AppFileLogger @VisibleForTesting internal constructor(
    private val logDir: File,
    flushIntervalMs: Long = FLUSH_INTERVAL_MS,
    private val maxFileBytes: Long = MAX_FILE_BYTES
) {
    private val timestampFormat = SimpleDateFormat(TIMESTAMP_PATTERN, Locale.US)

    private val writeExecutor = ThreadPoolExecutor(
        1, 1, 0L, TimeUnit.MILLISECONDS,
        LinkedBlockingQueue<Runnable>(MAX_QUEUE_SIZE),
        { r -> Thread(r, "AppFileLogger-write").apply { isDaemon = true } },
        ThreadPoolExecutor.DiscardPolicy()
    )
    private val flushExecutor = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "AppFileLogger-flush").apply { isDaemon = true }
    }

    @Volatile private var enabled = false

    private var bufferedWriter: BufferedWriter? = null

    /** Approximate byte count of the active file; drives rotation without a stat on every write. */
    private var bytesWritten: Long = 0L

    init {
        logDir.mkdirs()
        // Flush on the write thread so bufferedWriter is only ever touched there (no cross-thread race).
        flushExecutor.scheduleAtFixedRate(
            { writeExecutor.execute { flushSafely() } }, flushIntervalMs, flushIntervalMs, TimeUnit.MILLISECONDS
        )
    }

    fun setEnabled(enabled: Boolean) {
        this.enabled = enabled
        if (!enabled) writeExecutor.execute {
            flushSafely()
            closeWriter()
        }
    }

    fun log(level: String, tag: String, msg: String) {
        if (!enabled) return
        val timestamp = System.currentTimeMillis()
        writeExecutor.execute { writeEntry(timestamp, level, tag, msg) }
    }

    fun flushNow() {
        onWriteThread(Unit) { flushSafely() }
    }

    fun isEnabled(): Boolean = enabled

    fun getRecentEntries(): List<String> = onWriteThread(emptyList()) {
        flushSafely()
        // Newest file first so the live view keeps history right after a rotation empties the active file.
        val collected = ArrayList<String>()
        var budget = LIVE_TAIL_MAX_BYTES
        for (file in listOf(File(logDir, LOG_FILE), File(logDir, LOG_FILE_PREV))) {
            if (collected.size >= LIVE_TAIL_LINES || budget <= 0L) break
            if (!file.exists()) continue
            val lines = if (file.length() <= budget) file.readLines() else tailRead(file, budget)
            budget -= file.length()
            collected.addAll(0, lines)
        }
        if (collected.size > LIVE_TAIL_LINES) collected.takeLast(LIVE_TAIL_LINES) else collected
    }

    private fun tailRead(file: File, maxBytes: Long): List<String> {
        val start = (file.length() - maxBytes).coerceAtLeast(0L)
        return file.inputStream().use { stream ->
            if (start > 0L) stream.skip(start)
            val lines = stream.bufferedReader().readLines()
            if (start > 0L && lines.isNotEmpty()) lines.drop(1) else lines
        }
    }

    fun currentSizeBytes(): Long = onWriteThread(0L) {
        flushSafely()
        File(logDir, LOG_FILE).length() + File(logDir, LOG_FILE_PREV).length()
    }

    fun clear() {
        onWriteThread(Unit) {
            closeWriter()
            File(logDir, LOG_FILE).delete()
            File(logDir, LOG_FILE_PREV).delete()
            bytesWritten = 0L
        }
    }

    /** Log segment files, oldest first, for export. Existing and non-empty only. */
    fun logFiles(): List<File> =
        listOf(File(logDir, LOG_FILE_PREV), File(logDir, LOG_FILE)).filter { it.exists() && it.length() > 0L }

    @VisibleForTesting
    internal fun shutdown() {
        flushExecutor.shutdownNow()
        onWriteThread(Unit) {
            flushSafely()
            closeWriter()
        }
        writeExecutor.shutdownNow()
    }

    private fun writeEntry(timestamp: Long, level: String, tag: String, msg: String) {
        try {
            val writer = bufferedWriter ?: openWriter()
            val line = "${timestampFormat.format(Date(timestamp))} $level/$tag: $msg"
            writer.write(line)
            writer.newLine()
            bytesWritten += line.length + 1
            if (bytesWritten >= maxFileBytes) rotate()
        } catch (_: IOException) {
            // Cannot recursively log from here.
        }
    }

    private fun openWriter(): BufferedWriter {
        logDir.mkdirs()
        val file = File(logDir, LOG_FILE)
        bytesWritten = file.length()
        val w = BufferedWriter(FileWriter(file, true))
        bufferedWriter = w
        return w
    }

    // Rolls the active file to LOG_FILE_PREV; the next write opens a fresh one. Bounds disk to
    // ~2x maxFileBytes. On the write thread, so no locking.
    private fun rotate() {
        closeWriter()
        val current = File(logDir, LOG_FILE)
        val previous = File(logDir, LOG_FILE_PREV)
        previous.delete()
        current.renameTo(previous)
        bytesWritten = 0L
    }

    private fun closeWriter() {
        try {
            bufferedWriter?.close()
        } catch (_: Exception) {
        }
        bufferedWriter = null
    }

    private fun flushSafely() {
        try {
            bufferedWriter?.flush()
        } catch (_: Exception) {
        }
    }

    private fun <T> onWriteThread(fallback: T, block: () -> T): T =
        try {
            writeExecutor.submit(Callable { block() }).get(WRITE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        } catch (_: Exception) {
            fallback
        }

    companion object {
        const val FLUSH_INTERVAL_MS: Long = 10_000L
        private const val WRITE_TIMEOUT_MS: Long = 2_000L
        private const val MAX_QUEUE_SIZE: Int = 10_000
        const val LOG_DIR: String = "logs"
        const val LOG_FILE: String = "colota.log"
        const val LOG_FILE_PREV: String = "colota.log.1"

        const val MAX_FILE_BYTES: Long = 5L * 1024L * 1024L

        // Live view returns only the most recent slice so it stays responsive as the file grows:
        // LIVE_TAIL_MAX_BYTES bounds the disk read, LIVE_TAIL_LINES the line count.
        const val LIVE_TAIL_LINES: Int = 1000
        private const val LIVE_TAIL_MAX_BYTES: Long = 512L * 1024L

        // If you change this, also update the matching regex in apps/mobile/src/utils/logExport.ts.
        private const val TIMESTAMP_PATTERN = "yyyy-MM-dd HH:mm:ss.SSS"

        @Volatile
        private var instance: AppFileLogger? = null

        fun init(context: Context) {
            if (instance != null) return
            synchronized(this) {
                if (instance != null) return
                val dir = File(context.filesDir, LOG_DIR)
                instance = AppFileLogger(dir).also { logger ->
                    Runtime.getRuntime().addShutdownHook(Thread { logger.flushNow() })
                }
            }
        }

        fun setEnabled(enabled: Boolean) {
            instance?.setEnabled(enabled)
        }

        fun isEnabled(): Boolean = instance?.isEnabled() ?: false

        fun log(level: String, tag: String, msg: String) {
            instance?.log(level, tag, msg)
        }

        fun flushNow() {
            instance?.flushNow()
        }

        fun getRecentEntries(): List<String> = instance?.getRecentEntries() ?: emptyList()

        fun logFiles(): List<File> = instance?.logFiles() ?: emptyList()

        fun currentSizeBytes(): Long = instance?.currentSizeBytes() ?: 0L

        fun clear() {
            instance?.clear()
        }
    }
}
