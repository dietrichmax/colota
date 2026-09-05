/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.export

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.database.SQLException
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import androidx.core.app.NotificationCompat
import androidx.documentfile.provider.DocumentFile
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.Colota.bridge.LocationServiceModule
import com.Colota.data.DatabaseHelper
import com.Colota.util.AppLogger
import java.io.File
import java.io.IOException
import java.util.Date

/**
 * Performs the actual export. Triggered by AutoExportAlarmReceiver when the
 * configured time arrives, or by an immediate "Export Now" enqueue. Runs as
 * a foreground service so the OS does not kill long exports. Runs without the
 * JS runtime.
 */
class AutoExportWorker(
    private val appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    // Only the SAF copy raises this, so a directory verdict can never be reached from a database read
    private class DirectoryAccessException(message: String) : Exception(message)

    companion object {
        private const val TAG = "AutoExportWorker"
        private const val CHANNEL_ID = "auto_export"
        private const val NOTIFICATION_ID = 9001
        private const val FOREGROUND_NOTIFICATION_ID = 9002
        // OneTimeWorkRequest has no default retry cap - bound transient IO retries here.
        private const val MAX_RETRIES = 3

        // BackupServiceModule.pauseAllDbWriters polls this before the restore swap.
        @Volatile
        @JvmStatic
        var isRunning: Boolean = false
            private set
    }

    override suspend fun getForegroundInfo(): ForegroundInfo {
        ensureNotificationChannel()
        val notification = NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_save)
            .setContentTitle("Auto-Export")
            .setContentText("Exporting location data...")
            .setOngoing(true)
            .build()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(FOREGROUND_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(FOREGROUND_NOTIFICATION_ID, notification)
        }
    }

    override suspend fun doWork(): Result {
        val isManualRun = tags.contains(AutoExportScheduler.IMMEDIATE_WORK_TAG)
        isRunning = true
        return try {
            executeWork(isManualRun)
        } finally {
            isRunning = false
            if (!isManualRun) {
                try {
                    AutoExportScheduler.scheduleNext(appContext)
                } catch (e: Exception) {
                    AppLogger.w(TAG, "scheduleNext failed: ${e.message}")
                }
            }
        }
    }

    private suspend fun executeWork(isManualRun: Boolean): Result {
        if (runAttemptCount >= MAX_RETRIES) {
            AppLogger.e(TAG, "Auto-export failed after $MAX_RETRIES attempts, giving up")
            showNotification("Auto-Export Failed", "Export failed after multiple attempts. Please check your settings.")
            return Result.failure()
        }

        val db = DatabaseHelper.getInstance(appContext)
        val config = AutoExportConfig.from(db)

        if (!config.enabled) {
            AppLogger.d(TAG, "Auto-export is disabled, skipping")
            return Result.success()
        }

        if (config.uri == null) {
            AppLogger.e(TAG, "No export directory configured")
            return Result.failure()
        }

        // Guards against early fires from stale alarms or mid-flight schedule edits.
        if (!isManualRun && !config.isExportDue()) {
            AppLogger.i(TAG, "Not due. ${config.interval} ${config.timeOfDay} next=${config.nextExportTimestamp()}")
            return Result.success()
        }

        AppLogger.i(TAG, "Starting export: format=${config.format} mode=${config.mode}")

        // Some OEMs (Samsung, Xiaomi) throw under aggressive background restrictions;
        // the export often still completes.
        try {
            setForeground(getForegroundInfo())
        } catch (e: Exception) {
            AppLogger.w(TAG, "Could not promote to foreground service: ${e.message}")
        }

        val ext = ExportConverters.extensionFor(config.format)
        val dirUri = Uri.parse(config.uri)

        // Used for the incremental upper bound, the saved lastExport and the filename stamp, so
        // points written mid-export aren't dropped and the name matches the range it covers.
        val exportStartSec = System.currentTimeMillis() / 1000

        val fileName = ExportConverters.renderExportFilename(
            config.filenameTemplate,
            config.format,
            Build.MODEL,
            Date(exportStartSec * 1000)
        )

        // Write to cache first, then copy to SAF. One file per run, so two runs can never truncate each other
        val tempFile = File.createTempFile("auto_export_", ext, appContext.cacheDir)

        return try {
            val rowCount = if (config.mode == "incremental" && config.lastExportTimestamp > 0) {
                ExportConverters.exportToFile(config.format, tempFile, shouldCancel = { isStopped }) { limit, offset ->
                    db.getLocationsByDateRange(config.lastExportTimestamp, exportStartSec, limit, offset)
                }
            } else {
                ExportConverters.exportToFile(config.format, tempFile, shouldCancel = { isStopped }) { limit, offset ->
                    db.getLocationsChronological(limit, offset)
                }
            }

            if (isStopped) {
                tempFile.delete()
                AppLogger.w(TAG, "Auto-export cancelled")
                return Result.success()
            }

            if (rowCount == 0) {
                tempFile.delete()
                AppLogger.i(TAG, "No locations to export")
                showNotification("Auto-Export", "No new locations to export.")
                cleanupOldExports(dirUri, config)
                return Result.success()
            }

            val destDocFile = copyToSafDirectory(dirUri, fileName, tempFile, config.format)

            tempFile.delete()

            config.saveLastExportTimestamp(db, exportStartSec)

            cleanupOldExports(dirUri, config)

            // SAF renames on collision (foo.gpx -> "foo (1).gpx"), so report what it created.
            val savedName = destDocFile.name ?: fileName
            // A name cleanup cannot match would sit in the directory forever; say so rather than
            // leaving the retention limit quietly broken.
            if (ExportConverters.exportFileMatchers(config.filenameTemplate, Build.MODEL).none { it.matches(savedName) }) {
                AppLogger.w(TAG, "Saved as '$savedName', which retention will not recognise")
            }
            AppLogger.i(TAG, "Auto-export complete: $savedName ($rowCount locations)")
            config.saveLastResult(db, savedName, rowCount)
            showNotification(
                "Auto-Export Complete",
                "Exported $rowCount locations to $savedName",
                dirUri
            )
            LocationServiceModule.sendAutoExportEvent(true, savedName, rowCount, null)
            Result.success()
        } catch (e: SecurityException) {
            config.saveEnabled(db, false)
            config.savePermissionLost(db, true)
            handleExportFailure(
                tempFile, config, db, e,
                error = "Directory permission lost",
                logMessage = "Auto-export failed - permission denied",
                userMessage = "Directory permission lost. Please re-select the export directory.",
                retry = false
            )
        } catch (e: IllegalArgumentException) {
            handleExportFailure(
                tempFile, config, db, e,
                error = "Invalid configuration: ${e.message}",
                logMessage = "Auto-export failed - invalid configuration",
                userMessage = "Invalid export configuration: ${e.message}",
                retry = false
            )
        } catch (e: DirectoryAccessException) {
            handleExportFailure(
                tempFile, config, db, e,
                error = "Directory access failed: ${e.message}",
                logMessage = "Auto-export failed - directory access issue",
                userMessage = "Could not access export directory: ${e.message}",
                retry = false
            )
        } catch (e: SQLException) {
            handleExportFailure(
                tempFile, config, db, e,
                error = "Read failed: ${e.message}",
                logMessage = "Auto-export failed - database read, will retry",
                userMessage = "Could not read locations. Will retry.",
                retry = true
            )
        } catch (e: IOException) {
            handleExportFailure(
                tempFile, config, db, e,
                error = "IO error: ${e.message}",
                logMessage = "Auto-export failed - IO error, will retry",
                userMessage = "Could not save export file. Will retry.",
                retry = true
            )
        } catch (e: Exception) {
            handleExportFailure(
                tempFile, config, db, e,
                error = "Export failed: ${e.message}",
                logMessage = "Auto-export failed",
                userMessage = "Could not save export file. Will retry.",
                retry = true
            )
        }
    }

    private fun handleExportFailure(
        tempFile: File,
        config: AutoExportConfig,
        db: DatabaseHelper,
        e: Throwable,
        error: String,
        logMessage: String,
        userMessage: String,
        retry: Boolean
    ): Result {
        tempFile.delete()
        AppLogger.e(TAG, logMessage, e)
        config.saveLastError(db, error)
        showNotification("Auto-Export Failed", userMessage)
        LocationServiceModule.sendAutoExportEvent(false, null, 0, error)
        return if (retry) Result.retry() else Result.failure()
    }

    private fun copyToSafDirectory(
        dirUri: Uri,
        fileName: String,
        sourceFile: File,
        format: String
    ): DocumentFile {
        val resolver = appContext.contentResolver
        val mimeType = ExportConverters.mimeTypeFor(format)

        val docFile = DocumentFile.fromTreeUri(appContext, dirUri)
            ?.createFile(mimeType, fileName)
            ?: throw DirectoryAccessException("Failed to create file in selected directory")

        val expected = sourceFile.length()
        try {
            val copied = resolver.openOutputStream(docFile.uri)?.use { outStream ->
                sourceFile.inputStream().use { inStream ->
                    inStream.copyTo(outStream)
                }
            } ?: throw DirectoryAccessException("Failed to open output stream")
            // Verified by what was written, never by querying the document back: cloud providers report size 0 until synced
            if (copied != expected) {
                throw IOException("Export verification failed: copied $copied of $expected bytes")
            }
        } catch (e: Exception) {
            docFile.delete()
            throw e
        }
        return docFile
    }

    /**
     * Deletes only files the configured template could have produced, so subfolders and sync
     * artifacts are left alone. Selection lives in [ExportConverters.selectForDeletion] so it is
     * testable without SAF.
     */
    private fun cleanupOldExports(dirUri: Uri, config: AutoExportConfig) {
        if (config.retentionCount <= 0) {
            AppLogger.d(TAG, "Export cleanup skipped - retention is unlimited")
            return
        }

        try {
            val dir = DocumentFile.fromTreeUri(appContext, dirUri) ?: return
            val matchers = ExportConverters.exportFileMatchers(config.filenameTemplate, Build.MODEL)

            // Each DocumentFile getter is its own query, so only the names that already match pay
            // for lastModified and isFile. A shared folder can hold far more files than ours.
            val listed = dir.listFiles()
            val candidates = listed
                .map { it to it.name.orEmpty() }
                .filter { (_, name) -> matchers.any { it.matches(name) } }
                .map { (file, name) ->
                    file to ExportConverters.ExportEntry(name, file.lastModified(), file.isFile)
                }
            val selected = ExportConverters
                .selectForDeletion(candidates.map { it.second }, config.retentionCount, matchers)
                .map { it.name }
            val doomed = selected.toMutableList()

            var deleted = 0
            candidates.forEach { (file, entry) ->
                // Re-checked here because the match is by display name: a directory sharing a name
                // with a selected file would otherwise be deleted, recursively.
                // remove() rather than contains() so duplicate display names delete one apiece.
                if (entry.isFile && doomed.remove(entry.name)) {
                    file.delete()
                    deleted++
                    AppLogger.d(TAG, "Cleaned up old export: ${entry.name}")
                }
            }

            // Logged on every run, zeros included: a cleanup that recognised none of its own files
            // is otherwise indistinguishable from one that found nothing to delete.
            AppLogger.i(
                TAG,
                "Export cleanup: ${listed.size} in folder, ${candidates.size} matched, " +
                    "${selected.size} selected, $deleted deleted (keeping ${config.retentionCount})"
            )
        } catch (e: Exception) {
            AppLogger.w(TAG, "Export cleanup failed (non-critical): ${e.message}")
        }
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = appContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Auto-Export",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Notifications for automatic data exports"
            }
            nm.createNotificationChannel(channel)
        }
    }

    private fun showNotification(title: String, message: String, directoryUri: Uri? = null) {
        ensureNotificationChannel()
        val nm = appContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val builder = NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_save)
            .setContentTitle(title)
            .setContentText(message)
            .setAutoCancel(true)

        if (directoryUri != null) {
            try {
                val docUri = DocumentsContract.buildDocumentUriUsingTree(
                    directoryUri,
                    DocumentsContract.getTreeDocumentId(directoryUri)
                )
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(docUri, DocumentsContract.Document.MIME_TYPE_DIR)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                val resolved = appContext.packageManager.resolveActivity(intent, 0)
                if (resolved != null) {
                    intent.setClassName(
                        resolved.activityInfo.packageName,
                        resolved.activityInfo.name
                    )
                    val pendingIntent = PendingIntent.getActivity(
                        appContext, 0, intent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                    builder.setContentIntent(pendingIntent)
                }
            } catch (e: Exception) {
                AppLogger.w(TAG, "Could not create directory open intent: ${e.message}")
            }
        }

        nm.notify(NOTIFICATION_ID, builder.build())
    }

}
