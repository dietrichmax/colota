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

/**
 * Runs daily and asks AutoExportConfig.isExportDue() whether the configured
 * daily/weekly/monthly cadence has actually elapsed. Runs without the JS runtime.
 */
class AutoExportWorker(
    private val appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    companion object {
        private const val TAG = "AutoExportWorker"
        private const val CHANNEL_ID = "auto_export"
        private const val NOTIFICATION_ID = 9001
        private const val FOREGROUND_NOTIFICATION_ID = 9002
        // OneTimeWorkRequest has no default retry cap - bound transient IO retries here.
        private const val MAX_RETRIES = 3
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

        val isManualRun = tags.contains("colota_auto_export_now")
        if (!isManualRun && !config.isExportDue()) {
            AppLogger.d(TAG, "Export not yet due, skipping")
            return Result.success()
        }

        AppLogger.i(TAG, "Starting auto-export: format=${config.format}, mode=${config.mode}")

        // Some OEMs (Samsung, Xiaomi) throw under aggressive background restrictions;
        // the export often still completes.
        try {
            setForeground(getForegroundInfo())
        } catch (e: Exception) {
            AppLogger.w(TAG, "Could not promote to foreground service: ${e.message}")
        }

        val ext = ExportConverters.extensionFor(config.format)
        val dirUri = Uri.parse(config.uri)
        val dateStr = java.text.SimpleDateFormat("yyyy-MM-dd_HHmm", java.util.Locale.US)
            .format(java.util.Date())
        val fileName = "colota_export_$dateStr$ext"

        // Write to cache first, then copy to SAF.
        val tempFile = File(appContext.cacheDir, "auto_export_temp$ext")

        return try {
            val rowCount = if (config.mode == "incremental" && config.lastExportTimestamp > 0) {
                val now = System.currentTimeMillis() / 1000
                ExportConverters.exportToFile(config.format, tempFile, shouldCancel = { isStopped }) { limit, offset ->
                    db.getLocationsByDateRange(config.lastExportTimestamp, now, limit, offset)
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
                cleanupOldExports(dirUri, config.retentionCount)
                return Result.success()
            }

            val tempSize = tempFile.length()
            val destDocFile = copyToSafDirectory(dirUri, fileName, tempFile, config.format)

            val destSize = destDocFile.length()
            if (!destDocFile.exists() || destSize == 0L) {
                tempFile.delete()
                throw IOException("Export verification failed: destination file missing or empty")
            }
            if (destSize != tempSize) {
                AppLogger.w(TAG, "Export size mismatch: temp=$tempSize, dest=$destSize")
            }

            tempFile.delete()

            val now = System.currentTimeMillis() / 1000
            config.saveLastExportTimestamp(db, now)

            cleanupOldExports(dirUri, config.retentionCount)

            AppLogger.i(TAG, "Auto-export complete: $fileName ($rowCount locations)")
            config.saveLastResult(db, fileName, rowCount)
            showNotification(
                "Auto-Export Complete",
                "Exported $rowCount locations to $fileName",
                dirUri
            )
            LocationServiceModule.sendAutoExportEvent(true, fileName, rowCount, null)
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
        } catch (e: IllegalStateException) {
            handleExportFailure(
                tempFile, config, db, e,
                error = "Directory access failed: ${e.message}",
                logMessage = "Auto-export failed - directory access issue",
                userMessage = "Could not access export directory: ${e.message}",
                retry = false
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
            ?: throw IllegalStateException("Failed to create file in selected directory")

        resolver.openOutputStream(docFile.uri)?.use { outStream ->
            sourceFile.inputStream().use { inStream ->
                inStream.copyTo(outStream)
            }
        } ?: throw IllegalStateException("Failed to open output stream")

        return docFile
    }

    private fun cleanupOldExports(dirUri: Uri, retentionCount: Int) {
        if (retentionCount <= 0) return // 0 = unlimited

        try {
            val dir = DocumentFile.fromTreeUri(appContext, dirUri) ?: return
            // File names embed a sortable timestamp, so lexicographic == chronological.
            val exportFiles = dir.listFiles()
                .filter { it.name?.startsWith("colota_export_") == true }
                .sortedBy { it.name }

            val toDelete = exportFiles.size - retentionCount
            if (toDelete <= 0) return

            exportFiles.take(toDelete).forEach { file ->
                file.delete()
                AppLogger.d(TAG, "Cleaned up old export: ${file.name}")
            }

            AppLogger.i(TAG, "Cleaned up $toDelete old export files (keeping $retentionCount)")
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
                val pendingIntent = PendingIntent.getActivity(
                    appContext, 0, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                builder.setContentIntent(pendingIntent)
            } catch (e: Exception) {
                AppLogger.w(TAG, "Could not create directory open intent: ${e.message}")
            }
        }

        nm.notify(NOTIFICATION_ID, builder.build())
    }

}
