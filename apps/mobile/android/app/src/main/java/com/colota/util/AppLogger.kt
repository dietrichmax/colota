/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.util

import android.util.Log
import com.Colota.BuildConfig

/**
 * App-level logger controlled by the user's debug mode toggle.
 *
 * Logs are emitted when either:
 * - The user has enabled debug mode via the About screen (works in release builds)
 * - The app is running as a debug build (BuildConfig.DEBUG)
 *
 * This ensures developers always see logs during local development without
 * needing to toggle debug mode, while release users can opt in via the setting.
 *
 * Errors (Log.e) are always logged regardless of debug mode.
 *
 * All tags are prefixed with "Colota." so native log export can filter on that prefix.
 */
object AppLogger {

    private const val PREFIX = "Colota."

    @Volatile
    var enabled: Boolean = false

    private val active: Boolean
        get() = enabled || BuildConfig.DEBUG

    fun d(tag: String, msg: String) {
        if (active) Log.d(PREFIX + tag, msg)
    }

    fun i(tag: String, msg: String) {
        if (active) Log.i(PREFIX + tag, msg)
    }

    fun w(tag: String, msg: String) {
        if (active) Log.w(PREFIX + tag, msg)
    }

    fun e(tag: String, msg: String, throwable: Throwable? = null) {
        val t = PREFIX + tag
        if (throwable != null) Log.e(t, msg, throwable) else Log.e(t, msg)
    }
}
