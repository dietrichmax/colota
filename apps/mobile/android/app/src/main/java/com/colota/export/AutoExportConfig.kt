/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.export

import com.Colota.data.DatabaseHelper

/**
 * Typed wrapper for auto-export settings stored in the SQLite settings table.
 * Centralizes all setting key access and provides type-safe defaults.
 */
data class AutoExportConfig(
    val enabled: Boolean = false,
    val format: String = "geojson",
    val interval: String = "daily",
    val mode: String = "all",
    val uri: String? = null,
    val lastExportTimestamp: Long = 0L,
    val permissionLost: Boolean = false,
    val retentionCount: Int = 10,
    val lastFileName: String? = null,
    val lastRowCount: Int = 0,
    val lastError: String? = null
) {
    companion object {
        private const val KEY_ENABLED = "autoExportEnabled"
        private const val KEY_FORMAT = "autoExportFormat"
        private const val KEY_INTERVAL = "autoExportInterval"
        private const val KEY_MODE = "autoExportMode"
        private const val KEY_URI = "autoExportUri"
        private const val KEY_LAST_TIMESTAMP = "lastAutoExportTimestamp"
        private const val KEY_PERMISSION_LOST = "autoExportPermissionLost"
        private const val KEY_RETENTION_COUNT = "autoExportRetentionCount"
        private const val KEY_LAST_FILE_NAME = "autoExportLastFileName"
        private const val KEY_LAST_ROW_COUNT = "autoExportLastRowCount"
        private const val KEY_LAST_ERROR = "autoExportLastError"

        private val VALID_FORMATS = setOf("csv", "geojson", "gpx", "kml")
        private val VALID_INTERVALS = setOf("daily", "weekly", "monthly")
        private val VALID_MODES = setOf("all", "incremental")

        fun from(db: DatabaseHelper): AutoExportConfig {
            val format = db.getSetting(KEY_FORMAT, "geojson") ?: "geojson"
            val interval = db.getSetting(KEY_INTERVAL, "daily") ?: "daily"
            val mode = db.getSetting(KEY_MODE, "all") ?: "all"

            return AutoExportConfig(
                enabled = db.getSetting(KEY_ENABLED, "false") == "true",
                format = if (format in VALID_FORMATS) format else "geojson",
                interval = if (interval in VALID_INTERVALS) interval else "daily",
                mode = if (mode in VALID_MODES) mode else "all",
                uri = db.getSetting(KEY_URI),
                lastExportTimestamp = db.getSetting(KEY_LAST_TIMESTAMP, "0")?.toLongOrNull() ?: 0L,
                permissionLost = db.getSetting(KEY_PERMISSION_LOST, "false") == "true",
                retentionCount = db.getSetting(KEY_RETENTION_COUNT, "10")?.toIntOrNull() ?: 10,
                lastFileName = db.getSetting(KEY_LAST_FILE_NAME),
                lastRowCount = db.getSetting(KEY_LAST_ROW_COUNT, "0")?.toIntOrNull() ?: 0,
                lastError = db.getSetting(KEY_LAST_ERROR)
            )
        }
    }

    fun saveEnabled(db: DatabaseHelper, value: Boolean) {
        db.saveSetting(KEY_ENABLED, value.toString())
    }

    fun saveLastExportTimestamp(db: DatabaseHelper, timestamp: Long) {
        db.saveSetting(KEY_LAST_TIMESTAMP, timestamp.toString())
    }

    fun savePermissionLost(db: DatabaseHelper, value: Boolean) {
        db.saveSetting(KEY_PERMISSION_LOST, value.toString())
    }

    fun saveLastResult(db: DatabaseHelper, fileName: String, rowCount: Int) {
        db.saveSetting(KEY_LAST_FILE_NAME, fileName)
        db.saveSetting(KEY_LAST_ROW_COUNT, rowCount.toString())
        db.saveSetting(KEY_LAST_ERROR, "")
    }

    fun saveLastError(db: DatabaseHelper, error: String) {
        db.saveSetting(KEY_LAST_ERROR, error)
    }

    /**
     * Calculates the next export timestamp based on interval and last export time.
     * Uses Calendar for monthly to handle variable month lengths.
     */
    fun nextExportTimestamp(): Long {
        if (!enabled || lastExportTimestamp == 0L) return 0L
        return when (interval) {
            "daily" -> lastExportTimestamp + (24 * 3600)
            "weekly" -> lastExportTimestamp + (168 * 3600)
            "monthly" -> {
                val cal = java.util.Calendar.getInstance()
                cal.timeInMillis = lastExportTimestamp * 1000
                cal.add(java.util.Calendar.MONTH, 1)
                cal.timeInMillis / 1000
            }
            else -> lastExportTimestamp + (24 * 3600)
        }
    }

    /**
     * Checks if an export is currently due based on interval timing.
     */
    fun isExportDue(): Boolean {
        if (lastExportTimestamp == 0L) return true // never exported, do it now
        val now = System.currentTimeMillis() / 1000
        return now >= nextExportTimestamp()
    }
}
