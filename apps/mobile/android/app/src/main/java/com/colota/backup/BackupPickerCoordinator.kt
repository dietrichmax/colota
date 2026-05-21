/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.backup

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// SAF picker plumbing for BackupServiceModule. One in-flight promise; timeout releases the slot
// so a never-returning picker activity can't permanently block.
class BackupPickerCoordinator(
    private val reactContext: ReactApplicationContext,
    private val scope: CoroutineScope,
) {
    companion object {
        private const val REQUEST_PICK_DESTINATION = 9101
        private const val REQUEST_PICK_SOURCE = 9102
        private const val DEFAULT_FILENAME = "colota_backup.colota"
        private const val MIME_BACKUP = "application/octet-stream"
        private const val PICKER_TIMEOUT_MS = 5L * 60_000L
    }

    private val lock = Any()

    @Volatile private var pendingPromise: Promise? = null
    @Volatile private var timeoutJob: Job? = null

    private val activityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(
            activity: Activity,
            requestCode: Int,
            resultCode: Int,
            data: Intent?,
        ) {
            if (requestCode != REQUEST_PICK_DESTINATION && requestCode != REQUEST_PICK_SOURCE) return
            val promise = synchronized(lock) {
                val p = pendingPromise
                pendingPromise = null
                timeoutJob?.cancel()
                timeoutJob = null
                p
            } ?: return

            if (resultCode != Activity.RESULT_OK || data?.data == null) {
                promise.resolve(null)
                return
            }
            val uri = data.data!!
            if (requestCode == REQUEST_PICK_SOURCE) {
                // Source picker returns the filename too so the password prompt has context.
                val result = Arguments.createMap().apply {
                    putString("uri", uri.toString())
                    putString("displayName", queryDisplayName(uri))
                }
                promise.resolve(result)
            } else {
                promise.resolve(uri.toString())
            }
        }
    }

    // Some providers (Drive, MTP) hide DISPLAY_NAME; callers must tolerate null.
    private fun queryDisplayName(uri: Uri): String? {
        return try {
            reactContext.contentResolver
                .query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { cursor ->
                    if (cursor.moveToFirst() && !cursor.isNull(0)) cursor.getString(0) else null
                }
        } catch (e: Exception) {
            null
        }
    }

    init {
        reactContext.addActivityEventListener(activityEventListener)
    }

    fun dispose() {
        reactContext.removeActivityEventListener(activityEventListener)
    }

    fun pickDestination(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "No current activity")
            return
        }
        if (!claim(promise)) return
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = MIME_BACKUP
            putExtra(Intent.EXTRA_TITLE, DEFAULT_FILENAME)
        }
        activity.startActivityForResult(intent, REQUEST_PICK_DESTINATION)
    }

    fun pickSource(promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "No current activity")
            return
        }
        if (!claim(promise)) return
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = MIME_BACKUP
        }
        activity.startActivityForResult(intent, REQUEST_PICK_SOURCE)
    }

    // Timeout releases the slot if the activity result never arrives.
    private fun claim(promise: Promise): Boolean {
        synchronized(lock) {
            if (pendingPromise != null) {
                promise.reject("E_BUSY", "Another picker is already open")
                return false
            }
            pendingPromise = promise
            timeoutJob = scope.launch {
                delay(PICKER_TIMEOUT_MS)
                val stale = synchronized(lock) {
                    if (pendingPromise === promise) {
                        pendingPromise = null
                        timeoutJob = null
                        promise
                    } else null
                }
                stale?.reject("E_PICKER_TIMEOUT", "File picker timed out")
            }
        }
        return true
    }
}
