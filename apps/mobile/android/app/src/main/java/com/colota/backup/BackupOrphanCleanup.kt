/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.backup

import android.content.Context
import com.Colota.data.DatabaseHelper
import com.Colota.util.AppLogger
import kotlinx.coroutines.CompletableDeferred
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

// Sweeps temp files left by a process death mid-op. Run from Application.onCreate;
// callers await before claiming new temp dirs.
object BackupOrphanCleanup {

    private const val TAG = "BackupOrphanCleanup"

    private val started = AtomicBoolean(false)
    private val completed = CompletableDeferred<Unit>()

    fun start(context: Context) {
        if (!started.compareAndSet(false, true)) return
        val appContext = context.applicationContext
        Thread({
            try {
                File(appContext.cacheDir, "backup_temp").deleteRecursively()
                File(appContext.cacheDir, "restore_temp").deleteRecursively()
                File(appContext.cacheDir, "pending_backup.colota").delete()
                val dbDir = appContext.getDatabasePath(DatabaseHelper.DATABASE_NAME).parentFile
                if (dbDir != null) {
                    File(dbDir, "${DatabaseHelper.DATABASE_NAME}.incoming").delete()
                }
            } catch (e: Exception) {
                AppLogger.w(TAG, "Cleanup sweep failed: ${e.message}")
            } finally {
                completed.complete(Unit)
            }
        }, "BackupCacheCleanup").apply { isDaemon = true }.start()
    }

    suspend fun awaitComplete() {
        completed.await()
    }
}
