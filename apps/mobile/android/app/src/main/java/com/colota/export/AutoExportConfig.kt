/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.export

import com.Colota.data.DatabaseHelper
import java.util.Calendar
import java.util.TimeZone

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
    val lastError: String? = null,
    val timeOfDay: String = "00:00",
    val weeklyDow: Int = 1,
    val monthlyDom: Int = 1,
    val enabledAt: Long = 0L
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
        private const val KEY_TIME_OF_DAY = "autoExportTimeOfDay"
        private const val KEY_WEEKLY_DOW = "autoExportWeeklyDow"
        private const val KEY_MONTHLY_DOM = "autoExportMonthlyDom"
        private const val KEY_ENABLED_AT = "autoExportEnabledAt"

        private val VALID_FORMATS = setOf("csv", "geojson", "gpx", "kml")
        private val VALID_INTERVALS = setOf("daily", "weekly", "monthly")
        private val VALID_MODES = setOf("all", "incremental")

        private val TIME_OF_DAY_REGEX = Regex("^([01]\\d|2[0-3]):([0-5]\\d)$")

        fun from(db: DatabaseHelper): AutoExportConfig {
            val format = db.getSetting(KEY_FORMAT, "geojson") ?: "geojson"
            val interval = db.getSetting(KEY_INTERVAL, "daily") ?: "daily"
            val mode = db.getSetting(KEY_MODE, "all") ?: "all"
            val lastTs = db.getSetting(KEY_LAST_TIMESTAMP, "0")?.toLongOrNull() ?: 0L

            val rawTime = db.getSetting(KEY_TIME_OF_DAY)
            val rawDow = db.getSetting(KEY_WEEKLY_DOW)?.toIntOrNull()
            val rawDom = db.getSetting(KEY_MONTHLY_DOM)?.toIntOrNull()

            // Derive from lastTs and persist once, otherwise each export would shift
            // the derived time forward by a few seconds. Skip the write on fresh
            // installs where there's nothing to migrate from.
            val derived = deriveScheduleFrom(lastTs)
            val shouldPersistMigration = lastTs > 0L
            val timeOfDay = rawTime?.takeIf { TIME_OF_DAY_REGEX.matches(it) }
                ?: derived.timeOfDay.also { if (shouldPersistMigration) db.saveSetting(KEY_TIME_OF_DAY, it) }
            val weeklyDow = rawDow?.coerceIn(1, 7)
                ?: derived.weeklyDow.also { if (shouldPersistMigration) db.saveSetting(KEY_WEEKLY_DOW, it.toString()) }
            val monthlyDom = rawDom?.coerceIn(1, 31)
                ?: derived.monthlyDom.also { if (shouldPersistMigration) db.saveSetting(KEY_MONTHLY_DOM, it.toString()) }

            return AutoExportConfig(
                enabled = db.getSetting(KEY_ENABLED, "false") == "true",
                format = if (format in VALID_FORMATS) format else "geojson",
                interval = if (interval in VALID_INTERVALS) interval else "daily",
                mode = if (mode in VALID_MODES) mode else "all",
                uri = db.getSetting(KEY_URI),
                lastExportTimestamp = lastTs,
                permissionLost = db.getSetting(KEY_PERMISSION_LOST, "false") == "true",
                retentionCount = db.getSetting(KEY_RETENTION_COUNT, "10")?.toIntOrNull() ?: 10,
                lastFileName = db.getSetting(KEY_LAST_FILE_NAME),
                lastRowCount = db.getSetting(KEY_LAST_ROW_COUNT, "0")?.toIntOrNull() ?: 0,
                lastError = db.getSetting(KEY_LAST_ERROR),
                timeOfDay = timeOfDay,
                weeklyDow = weeklyDow,
                monthlyDom = monthlyDom,
                enabledAt = db.getSetting(KEY_ENABLED_AT, "0")?.toLongOrNull() ?: 0L
            )
        }

        private data class DerivedSchedule(val timeOfDay: String, val weeklyDow: Int, val monthlyDom: Int)

        private fun deriveScheduleFrom(lastTs: Long): DerivedSchedule {
            if (lastTs <= 0L) return DerivedSchedule("00:00", 1, 1)
            val cal = Calendar.getInstance(TimeZone.getDefault())
            cal.timeInMillis = lastTs * 1000
            return DerivedSchedule(
                timeOfDay = "%02d:%02d".format(cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE)),
                weeklyDow = calendarDowToIso(cal.get(Calendar.DAY_OF_WEEK)),
                monthlyDom = cal.get(Calendar.DAY_OF_MONTH)
            )
        }

        // Calendar.DAY_OF_WEEK uses Sun=1..Sat=7; we use ISO Mon=1..Sun=7.
        internal fun calendarDowToIso(calDow: Int): Int = ((calDow + 5) % 7) + 1
        internal fun isoToCalendarDow(iso: Int): Int = (iso % 7) + 1
    }

    fun saveEnabled(db: DatabaseHelper, value: Boolean) {
        db.saveSetting(KEY_ENABLED, value.toString())
    }

    fun saveEnabledAt(db: DatabaseHelper, timestamp: Long) {
        db.saveSetting(KEY_ENABLED_AT, timestamp.toString())
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

    fun nextExportTimestamp(): Long = nextExportTimestampAt(System.currentTimeMillis())

    internal fun nextExportTimestampAt(nowMs: Long): Long {
        if (!enabled) return 0L
        val (hh, mm) = parseTimeOfDay(timeOfDay)
        val zone = TimeZone.getDefault()

        return when (interval) {
            "weekly" -> nextWeekly(zone, hh, mm, nowMs)
            "monthly" -> nextMonthly(zone, hh, mm, nowMs)
            else -> nextDaily(zone, hh, mm, nowMs)
        }
    }

    private fun nextDaily(zone: TimeZone, hh: Int, mm: Int, nowMs: Long): Long {
        val cal = todayAtTimeOfDay(zone, hh, mm, nowMs)
        if (cal.timeInMillis <= nowMs) cal.add(Calendar.DAY_OF_YEAR, 1)
        return cal.timeInMillis / 1000
    }

    private fun nextWeekly(zone: TimeZone, hh: Int, mm: Int, nowMs: Long): Long {
        val cal = todayAtTimeOfDay(zone, hh, mm, nowMs)
        val delta = forwardDeltaToWeekday(cal.get(Calendar.DAY_OF_WEEK), weeklyDow)
        cal.add(Calendar.DAY_OF_YEAR, delta)
        if (cal.timeInMillis <= nowMs) cal.add(Calendar.DAY_OF_YEAR, 7)
        return cal.timeInMillis / 1000
    }

    private fun nextMonthly(zone: TimeZone, hh: Int, mm: Int, nowMs: Long): Long {
        val thisMonth = monthlyOccurrenceMs(zone, hh, mm, nowMs, 0)
        val ms = if (thisMonth > nowMs) thisMonth else monthlyOccurrenceMs(zone, hh, mm, nowMs, 1)
        return ms / 1000
    }

    private fun todayAtTimeOfDay(zone: TimeZone, hh: Int, mm: Int, nowMs: Long): Calendar =
        Calendar.getInstance(zone).apply {
            timeInMillis = nowMs
            set(Calendar.HOUR_OF_DAY, hh)
            set(Calendar.MINUTE, mm)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }

    // DOM clamped to month length (Feb 31 -> Feb 28/29).
    private fun monthlyOccurrenceMs(
        zone: TimeZone,
        hh: Int,
        mm: Int,
        baseMs: Long,
        monthOffset: Int
    ): Long {
        val cal = Calendar.getInstance(zone).apply {
            timeInMillis = baseMs
            set(Calendar.DAY_OF_MONTH, 1)
            set(Calendar.HOUR_OF_DAY, hh)
            set(Calendar.MINUTE, mm)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            if (monthOffset != 0) add(Calendar.MONTH, monthOffset)
        }
        cal.set(Calendar.DAY_OF_MONTH, monthlyDom.coerceAtMost(cal.getActualMaximum(Calendar.DAY_OF_MONTH)))
        return cal.timeInMillis
    }

    private fun forwardDeltaToWeekday(currentCalDow: Int, targetIso: Int): Int {
        var delta = isoToCalendarDow(targetIso) - currentCalDow
        if (delta < 0) delta += 7
        return delta
    }

    private fun backwardDeltaToWeekday(currentCalDow: Int, targetIso: Int): Int {
        var delta = isoToCalendarDow(targetIso) - currentCalDow
        if (delta > 0) delta -= 7
        return delta
    }

    private fun parseTimeOfDay(value: String): Pair<Int, Int> {
        val match = TIME_OF_DAY_REGEX.matchEntire(value) ?: return 0 to 0
        return match.groupValues[1].toInt() to match.groupValues[2].toInt()
    }

    fun isExportDue(): Boolean = isExportDueAt(System.currentTimeMillis())

    internal fun isExportDueAt(nowMs: Long): Boolean {
        if (!enabled) return false
        val now = nowMs / 1000
        val (hh, mm) = parseTimeOfDay(timeOfDay)
        val zone = TimeZone.getDefault()
        val mostRecent = mostRecentScheduledAtOrBeforeMs(zone, hh, mm, nowMs) / 1000
        val cutoff = maxOf(lastExportTimestamp, enabledAt)
        return now >= mostRecent && cutoff < mostRecent
    }

    private fun mostRecentScheduledAtOrBeforeMs(zone: TimeZone, hh: Int, mm: Int, nowMs: Long): Long {
        return when (interval) {
            "weekly" -> {
                val cal = todayAtTimeOfDay(zone, hh, mm, nowMs)
                val delta = backwardDeltaToWeekday(cal.get(Calendar.DAY_OF_WEEK), weeklyDow)
                cal.add(Calendar.DAY_OF_YEAR, delta)
                if (cal.timeInMillis > nowMs) cal.add(Calendar.DAY_OF_YEAR, -7)
                cal.timeInMillis
            }
            "monthly" -> {
                val thisMonth = monthlyOccurrenceMs(zone, hh, mm, nowMs, 0)
                if (thisMonth <= nowMs) thisMonth
                else monthlyOccurrenceMs(zone, hh, mm, nowMs, -1)
            }
            else -> {
                val cal = todayAtTimeOfDay(zone, hh, mm, nowMs)
                if (cal.timeInMillis > nowMs) cal.add(Calendar.DAY_OF_YEAR, -1)
                cal.timeInMillis
            }
        }
    }
}
