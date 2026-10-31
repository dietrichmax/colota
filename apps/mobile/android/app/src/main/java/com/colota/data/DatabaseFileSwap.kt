/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.data

import android.database.sqlite.SQLiteDatabase
import com.Colota.util.AppLogger

internal object DatabaseFileSwap {
    private const val TAG = "LocationDB"

    // Drain the WAL into main, then best-effort delete sidecars before the rename. SQLite's
    // WAL salt+checksum makes replay unlikely, but stale sidecars next to the new DB are untidy.
    fun replace(target: java.io.File, newDb: java.io.File) {
        target.parentFile?.mkdirs()

        drainLiveWal(target)

        bestEffortDelete(java.io.File("${target.absolutePath}-wal"))
        bestEffortDelete(java.io.File("${target.absolutePath}-shm"))
        bestEffortDelete(java.io.File("${target.absolutePath}-journal"))

        val staging = java.io.File(target.parentFile, "${target.name}.incoming")
        try {
            try {
                java.nio.file.Files.move(
                    newDb.toPath(),
                    target.toPath(),
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                    java.nio.file.StandardCopyOption.ATOMIC_MOVE,
                )
            } catch (_: java.nio.file.AtomicMoveNotSupportedException) {
                newDb.inputStream().use { input ->
                    staging.outputStream().use { input.copyTo(it) }
                }
                java.nio.file.Files.move(
                    staging.toPath(),
                    target.toPath(),
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                    java.nio.file.StandardCopyOption.ATOMIC_MOVE,
                )
                newDb.delete()
            }
        } finally {
            if (staging.exists()) staging.delete()
        }
    }

    // Sidecar deletes are non-critical; SQLite recovers fine without them. A SecurityException
    // from a sandbox-restricted FS shouldn't abort the whole swap.
    private fun bestEffortDelete(file: java.io.File) {
        try {
            file.delete()
        } catch (e: SecurityException) {
            AppLogger.w(TAG, "Could not delete ${file.name}: ${e.message}")
        }
    }

    // Truncating checkpoint moves uncheckpointed WAL pages into main before sidecar delete.
    private fun drainLiveWal(target: java.io.File) {
        if (!target.exists()) return
        try {
            val db = SQLiteDatabase.openDatabase(
                target.absolutePath,
                null,
                SQLiteDatabase.OPEN_READWRITE,
            )
            try {
                db.rawQuery("PRAGMA wal_checkpoint(TRUNCATE)", null).use { it.moveToFirst() }
            } finally {
                db.close()
            }
        } catch (e: Exception) {
            AppLogger.w(TAG, "Could not drain WAL before replace: ${e.message}")
        }
    }
}
