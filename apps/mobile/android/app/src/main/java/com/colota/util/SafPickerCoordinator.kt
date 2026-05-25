/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.util

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Generic SAF picker plumbing. One in-flight pick per instance; timeout releases
 *  the slot if the picker activity never returns. */
class SafPickerCoordinator(
    private val reactContext: ReactApplicationContext,
    private val scope: CoroutineScope,
) {
    companion object {
        private const val PICKER_TIMEOUT_MS = 5L * 60_000L
    }

    private val lock = Any()
    private var pending: PendingPick? = null
    private var timeoutJob: Job? = null

    private data class PendingPick(
        val promise: Promise,
        val requestCode: Int,
        val returnFilename: Boolean,
    )

    private val activityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(
            activity: Activity,
            requestCode: Int,
            resultCode: Int,
            data: Intent?,
        ) {
            val pick = synchronized(lock) {
                val p = pending
                if (p == null || p.requestCode != requestCode) return
                pending = null
                timeoutJob?.cancel()
                timeoutJob = null
                p
            }

            if (resultCode != Activity.RESULT_OK || data?.data == null) {
                pick.promise.resolve(null)
                return
            }
            val uri = data.data!!
            if (!pick.returnFilename) {
                pick.promise.resolve(uri.toString())
                return
            }
            // queryDisplayName can hit the network on cloud providers; off the main thread.
            scope.launch(Dispatchers.IO) {
                val name = reactContext.contentResolver.queryDisplayName(uri)
                val result = Arguments.createMap().apply {
                    putString("uri", uri.toString())
                    putString("displayName", name)
                }
                pick.promise.resolve(result)
            }
        }
    }

    init {
        reactContext.addActivityEventListener(activityEventListener)
    }

    fun dispose() {
        reactContext.removeActivityEventListener(activityEventListener)
    }

    fun pickCreateDocument(mime: String, defaultName: String, requestCode: Int, promise: Promise) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "No current activity")
            return
        }
        if (!claim(promise, requestCode, returnFilename = false)) return
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = mime
            putExtra(Intent.EXTRA_TITLE, defaultName)
        }
        activity.startActivityForResult(intent, requestCode)
    }

    fun pickOpenDocument(
        mime: String,
        extraMimes: Array<String>?,
        requestCode: Int,
        promise: Promise,
    ) {
        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "No current activity")
            return
        }
        if (!claim(promise, requestCode, returnFilename = true)) return
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = mime
            if (extraMimes != null) putExtra(Intent.EXTRA_MIME_TYPES, extraMimes)
        }
        activity.startActivityForResult(intent, requestCode)
    }

    private fun claim(promise: Promise, requestCode: Int, returnFilename: Boolean): Boolean {
        synchronized(lock) {
            if (pending != null) {
                promise.reject("E_BUSY", "Another picker is already open")
                return false
            }
            pending = PendingPick(promise, requestCode, returnFilename)
            timeoutJob = scope.launch {
                delay(PICKER_TIMEOUT_MS)
                val stale = synchronized(lock) {
                    val p = pending
                    if (p?.promise === promise) {
                        pending = null
                        timeoutJob = null
                        p.promise
                    } else null
                }
                stale?.reject("E_PICKER_TIMEOUT", "File picker timed out")
            }
        }
        return true
    }
}
