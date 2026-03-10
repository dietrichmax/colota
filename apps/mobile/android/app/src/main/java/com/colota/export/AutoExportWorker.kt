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
import java.io.OutputStreamWriter

/**
 * WorkManager worker that performs automatic location data export.
 * Runs without the React Native JS runtime - uses native Kotlin converters.
 *
 * Scheduled as a daily periodic worker. On each run it checks whether an
 * export is actually due (daily/weekly/monthly) via AutoExportConfig.isExportDue().
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
        private const val MAX_RETRIES = 3
        private const val PAGE_SIZE = 10_000
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

        if (config.uri == null) {
            AppLogger.e(TAG, "No export directory configured")
            return Result.failure()
        }

        // One-time "run now" workers skip the due check
        val isManualRun = tags.contains("colota_auto_export_now")
        if (!isManualRun && !config.isExportDue()) {
            AppLogger.d(TAG, "Export not yet due, skipping")
            return Result.success()
        }

        AppLogger.i(TAG, "Starting auto-export: format=${config.format}, mode=${config.mode}")

        // Promote to foreground service to prevent OS from killing long exports
        try {
            setForeground(getForegroundInfo())
        } catch (e: Exception) {
            // Some OEMs (Samsung, Xiaomi) throw when background restrictions are aggressive.
            // Continue with the export anyway - it may still complete.
            AppLogger.w(TAG, "Could not promote to foreground service: ${e.message}")
        }

        val ext = ExportConverters.extensionFor(config.format)
        val dirUri = Uri.parse(config.uri)
        val dateStr = java.text.SimpleDateFormat("yyyy-MM-dd_HHmm", java.util.Locale.US)
            .format(java.util.Date())
        val fileName = "colota_export_$dateStr$ext"

        // Write to temp file first for atomic writes
        val tempFile = File(appContext.cacheDir, "auto_export_temp$ext")

        return try {
            val rowCount = if (config.mode == "incremental" && config.lastExportTimestamp > 0) {
                val now = System.currentTimeMillis() / 1000
                writePaginatedExport(config.format, tempFile) { limit, offset ->
                    db.getLocationsByDateRange(config.lastExportTimestamp, now, limit, offset)
                }
            } else {
                writePaginatedExport(config.format, tempFile) { limit, offset ->
                    db.getLocationsChronological(limit, offset)
                }
            }

            // Check cancellation before copying
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

            // Atomic: copy completed temp file to SAF directory, then verify
            val tempSize = tempFile.length()
            val destDocFile = copyToSafDirectory(dirUri, fileName, tempFile, config.format)

            // Verify the destination file
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

            // Clean up old export files beyond retention limit
            cleanupOldExports(dirUri, config.retentionCount)

            AppLogger.i(TAG, "Auto-export complete: $fileName ($rowCount locations)")
            config.saveLastResult(db, fileName, rowCount)
            showNotification(
                "Auto-Export Complete",
                "Exported $rowCount locations to $fileName",
                dirUri
            )
            sendExportBroadcast(true, fileName, rowCount, null)
            Result.success()
        } catch (e: SecurityException) {
            tempFile.delete()
            val error = "Directory permission lost"
            AppLogger.e(TAG, "Auto-export failed - permission denied", e)
            config.saveEnabled(db, false)
            config.savePermissionLost(db, true)
            config.saveLastError(db, error)
            showNotification("Auto-Export Failed", "$error. Please re-select the export directory.")
            sendExportBroadcast(false, null, 0, error)
            Result.failure()
        } catch (e: IllegalArgumentException) {
            tempFile.delete()
            val error = "Invalid configuration: ${e.message}"
            AppLogger.e(TAG, "Auto-export failed - invalid configuration", e)
            config.saveLastError(db, error)
            showNotification("Auto-Export Failed", "Invalid export configuration: ${e.message}")
            sendExportBroadcast(false, null, 0, error)
            Result.failure()
        } catch (e: IllegalStateException) {
            tempFile.delete()
            val error = "Directory access failed: ${e.message}"
            AppLogger.e(TAG, "Auto-export failed - directory access issue", e)
            config.saveLastError(db, error)
            showNotification("Auto-Export Failed", "Could not access export directory: ${e.message}")
            sendExportBroadcast(false, null, 0, error)
            Result.failure()
        } catch (e: IOException) {
            tempFile.delete()
            val error = "IO error: ${e.message}"
            AppLogger.e(TAG, "Auto-export failed - IO error, will retry", e)
            config.saveLastError(db, error)
            showNotification("Auto-Export Failed", "Could not save export file. Will retry.")
            sendExportBroadcast(false, null, 0, error)
            Result.retry()
        } catch (e: Exception) {
            tempFile.delete()
            val error = "Export failed: ${e.message}"
            AppLogger.e(TAG, "Auto-export failed", e)
            config.saveLastError(db, error)
            showNotification("Auto-Export Failed", "Could not save export file. Will retry.")
            sendExportBroadcast(false, null, 0, error)
            Result.retry()
        }
    }

    /**
     * Streams a paginated export to temp file, fetching rows via the provided lambda.
     * Checks isStopped between chunks for graceful cancellation.
     */
    private fun writePaginatedExport(
        format: String,
        tempFile: File,
        fetchPage: (limit: Int, offset: Int) -> List<Map<String, Any?>>
    ): Int {
        val coordsCollector = if (format == "kml") KmlCoordsCollector(appContext.cacheDir) else null
        var totalRows = 0
        var offset = 0

        coordsCollector.use {
            OutputStreamWriter(tempFile.outputStream(), Charsets.UTF_8).use { writer ->
                ExportConverters.writeHeader(writer, format)

                while (true) {
                    if (isStopped) {
                        AppLogger.w(TAG, "Auto-export cancelled during write")
                        break
                    }
                    val page = fetchPage(PAGE_SIZE, offset)
                    if (page.isEmpty()) break
                    ExportConverters.writeRows(writer, format, page, offset, coordsCollector)
                    totalRows += page.size
                    offset += PAGE_SIZE
                }

                if (!isStopped) {
                    ExportConverters.writeFooter(writer, format, coordsCollector)
                }
            }
        }

        if (isStopped) {
            tempFile.delete()
            return 0
        }

        return totalRows
    }

    /**
     * Copies temp file to SAF directory and returns the destination DocumentFile
     * for verification.
     */
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

    /**
     * Deletes oldest export files beyond the retention limit.
     * Only touches files matching the colota_export_ prefix.
     */
    private fun cleanupOldExports(dirUri: Uri, retentionCount: Int) {
        if (retentionCount <= 0) return // 0 = unlimited

        try {
            val dir = DocumentFile.fromTreeUri(appContext, dirUri) ?: return
            val exportFiles = dir.listFiles()
                .filter { it.name?.startsWith("colota_export_") == true }
                .sortedBy { it.name } // lexicographic = chronological (timestamp in name)

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

    private fun sendExportBroadcast(success: Boolean, fileName: String?, rowCount: Int, error: String?) {
        LocationServiceModule.sendAutoExportEvent(success, fileName, rowCount, error)
    }
}
