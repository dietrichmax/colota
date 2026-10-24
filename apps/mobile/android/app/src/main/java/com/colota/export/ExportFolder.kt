/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.export

import android.content.Context
import android.net.Uri
import android.os.Build
import androidx.documentfile.provider.DocumentFile
import com.Colota.util.AppLogger
import java.io.File
import java.io.IOException

/** The folder auto-export writes into: copies a finished export in and keeps only the newest of its own files. */
class ExportFolder(private val context: Context, private val dirUri: Uri) {

    // Only the copy raises this, so a directory verdict can never be reached from a database read
    class DirectoryAccessException(message: String) : Exception(message)

    companion object {
        private const val TAG = "AutoExportWorker"
    }

    fun copyIn(
        fileName: String,
        sourceFile: File,
        format: String
    ): DocumentFile {
        val resolver = context.contentResolver
        val mimeType = ExportConverters.mimeTypeFor(format)

        val docFile = DocumentFile.fromTreeUri(context, dirUri)
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
     * artifacts are left alone. Selection lives in [ExportFilenames.selectForDeletion] so it is
     * testable without SAF.
     */
    fun cleanup(config: AutoExportConfig) {
        if (config.retentionCount <= 0) {
            AppLogger.d(TAG, "Export cleanup skipped - retention is unlimited")
            return
        }

        try {
            val dir = DocumentFile.fromTreeUri(context, dirUri) ?: return
            val matchers = ExportFilenames.exportFileMatchers(config.filenameTemplate, Build.MODEL)

            // Each DocumentFile getter is its own query, so only the names that already match pay
            // for lastModified and isFile. A shared folder can hold far more files than ours.
            val listed = dir.listFiles()
            val candidates = listed
                .map { it to it.name.orEmpty() }
                .filter { (_, name) -> matchers.any { it.matches(name) } }
                .map { (file, name) ->
                    file to ExportFilenames.ExportEntry(name, file.lastModified(), file.isFile)
                }
            val selected = ExportFilenames
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
}
