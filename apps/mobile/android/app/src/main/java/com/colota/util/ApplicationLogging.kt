/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
package com.Colota.util

import android.app.Application
import android.content.ComponentCallbacks2
import android.util.Log
import com.Colota.data.DatabaseHelper

/** Reads file-logging settings from the DB into [AppFileLogger] and installs the
 *  uncaught-exception flush hook. Called once from MainApplication.onCreate. */
object FileLoggerInitializer {

    fun start(app: Application) {
        AppFileLogger.init(app)

        Thread({
            try {
                val enabled = DatabaseHelper.getInstance(app)
                    .getSetting("debugFileLoggingEnabled", "false") == "true"
                AppFileLogger.setEnabled(enabled)
            } catch (e: Exception) {
                Log.w("Colota.FileLoggerInit", "Could not load file-logger settings from DB", e)
            }
        }, "FileLoggerInit").apply { isDaemon = true }.start()

        val prev = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, ex ->
            try {
                AppFileLogger.flushNow()
            } finally {
                prev?.uncaughtException(thread, ex)
            }
        }
    }
}

/** Logs the actual `onTrimMemory` pressure levels (RUNNING_* and COMPLETE). Skips
 *  UI_HIDDEN / BACKGROUND / MODERATE since those fire on every backgrounding. */
object MemoryPressureLogger {

    private const val TAG = "MainApp"

    fun log(level: Int) {
        val name = when (level) {
            ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL -> "RUNNING_CRITICAL"
            ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW -> "RUNNING_LOW"
            ComponentCallbacks2.TRIM_MEMORY_RUNNING_MODERATE -> "RUNNING_MODERATE"
            ComponentCallbacks2.TRIM_MEMORY_COMPLETE -> "COMPLETE"
            else -> return
        }
        AppLogger.w(TAG, "onTrimMemory $name (level=$level)")
    }
}
