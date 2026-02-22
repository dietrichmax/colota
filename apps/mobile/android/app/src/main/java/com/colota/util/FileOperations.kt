/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
 
package com.Colota.util

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import com.Colota.BuildConfig
import android.net.Uri
import android.util.Log
import androidx.core.content.FileProvider
import com.facebook.react.bridge.*
import java.io.File

class FileOperations(private val context: ReactApplicationContext) {
    
    /**
     * Writes content to a file in the app's cache directory
     * @param fileName Name of the file to create
     * @param content Text content to write
     * @return Full file path
     */
    fun writeFile(fileName: String, content: String): String {
        val sanitized = File(fileName).name
        val file = File(context.cacheDir, sanitized)
        file.writeText(content)
        return file.absolutePath
    }
    
    /**
    * Shares a file using Android's native share sheet.
    * @param filePath Absolute path to the file
    * @param mimeType MIME type of the file
    * @param title Share dialog title
    * @return true if the share intent was started
    */
    fun shareFile(filePath: String, mimeType: String, title: String): Boolean {
        val file = File(filePath)
        if (!file.exists()) {
            throw IllegalArgumentException("File does not exist: $filePath")
        }

        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )

        val intent = Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, title)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        val chooser = Intent.createChooser(intent, title).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        context.startActivity(chooser)
    
        // Schedule deletion after 60 seconds
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            try {
                if (file.exists()) {
                    file.delete()
                    if (BuildConfig.DEBUG) {
                        Log.d("FileOperations", "Cleaned up export file: ${file.name}")
                    }
                }
            } catch (e: Exception) {
                Log.w("FileOperations", "Failed to cleanup file", e)
            }
        }, 60000)
        
        return true
    }
    
    /**
     * Deletes a file
     * @param filePath Absolute path to the file
     */
    fun deleteFile(filePath: String) {
        val file = File(filePath)
        if (file.canonicalPath.startsWith(context.cacheDir.canonicalPath) && file.exists()) {
            file.delete()
        }
    }
    
    /**
     * Copies text to the system clipboard
     * @param text Content to copy
     * @param label Clipboard label (shown in some Android versions)
     */
    fun copyToClipboard(text: String, label: String) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText(label, text)
        clipboard.setPrimaryClip(clip)
    }

    /**
     * Gets the cache directory path
     */
    fun getCacheDirectory(): String = context.cacheDir.absolutePath
}