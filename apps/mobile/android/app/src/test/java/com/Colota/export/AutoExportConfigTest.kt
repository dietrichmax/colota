package com.Colota.export

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class AutoExportConfigTest {

    private val originalTimeZone = TimeZone.getDefault()

    @Before
    fun setUp() {
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"))
    }

    @After
    fun tearDown() {
        TimeZone.setDefault(originalTimeZone)
    }

    private fun atUtc(year: Int, month: Int, day: Int, hh: Int = 0, mm: Int = 0): Long {
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        cal.set(year, month - 1, day, hh, mm, 0)
        cal.set(Calendar.MILLISECOND, 0)
        return cal.timeInMillis / 1000
    }

    // --- isExportDue ---

    @Test
    fun `isExportDue returns false when disabled`() {
        val config = AutoExportConfig(enabled = false, lastExportTimestamp = 0L)
        assertFalse(config.isExportDue())
    }

    @Test
    fun `enable after today's slot waits for tomorrow`() {
        val config = AutoExportConfig(
            enabled = true,
            interval = "daily",
            timeOfDay = "09:00",
            enabledAt = atUtc(2025, 6, 8, 14, 0)
        )
        assertFalse(config.isExportDueAt(atUtc(2025, 6, 8, 14, 1) * 1000))
        assertFalse(config.isExportDueAt(atUtc(2025, 6, 9, 8, 59) * 1000))
        assertTrue(config.isExportDueAt(atUtc(2025, 6, 9, 9, 1) * 1000))
    }

    @Test
    fun `enable before today's slot fires today`() {
        val config = AutoExportConfig(
            enabled = true,
            interval = "daily",
            timeOfDay = "09:00",
            enabledAt = atUtc(2025, 6, 8, 8, 0)
        )
        assertFalse(config.isExportDueAt(atUtc(2025, 6, 8, 8, 30) * 1000))
        assertTrue(config.isExportDueAt(atUtc(2025, 6, 8, 9, 1) * 1000))
    }

    @Test
    fun `same-slot double-fire is blocked`() {
        val config = AutoExportConfig(
            enabled = true,
            interval = "daily",
            timeOfDay = "12:00",
            lastExportTimestamp = atUtc(2025, 6, 9, 12, 1)
        )
        assertFalse(config.isExportDueAt(atUtc(2025, 6, 9, 12, 5) * 1000))
    }

    // --- nextExportTimestamp ---

    @Test
    fun `nextExportTimestamp returns 0 when disabled`() {
        val config = AutoExportConfig(enabled = false)
        assertEquals(0L, config.nextExportTimestamp())
    }

    @Test
    fun `daily nextExportTimestamp anchors to configured time of day`() {
        val config = AutoExportConfig(
            enabled = true,
            interval = "daily",
            timeOfDay = "12:30"
        )
        val next = config.nextExportTimestamp()
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        cal.timeInMillis = next * 1000
        assertEquals(12, cal.get(Calendar.HOUR_OF_DAY))
        assertEquals(30, cal.get(Calendar.MINUTE))
        assertTrue("Next must be in the future", next > System.currentTimeMillis() / 1000)
    }

    @Test
    fun `weekly nextExportTimestamp picks configured weekday`() {
        val config = AutoExportConfig(
            enabled = true,
            interval = "weekly",
            timeOfDay = "09:00",
            weeklyDow = 1 // Monday
        )
        val next = config.nextExportTimestamp()
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        cal.timeInMillis = next * 1000
        assertEquals(Calendar.MONDAY, cal.get(Calendar.DAY_OF_WEEK))
        assertEquals(9, cal.get(Calendar.HOUR_OF_DAY))
        assertEquals(0, cal.get(Calendar.MINUTE))
    }

    @Test
    fun `weekly nextExportTimestamp picks Sunday correctly`() {
        val config = AutoExportConfig(
            enabled = true,
            interval = "weekly",
            timeOfDay = "23:00",
            weeklyDow = 7 // Sunday
        )
        val next = config.nextExportTimestamp()
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        cal.timeInMillis = next * 1000
        assertEquals(Calendar.SUNDAY, cal.get(Calendar.DAY_OF_WEEK))
    }

    @Test
    fun `monthly nextExportTimestamp clamps day 31 in February`() {
        val config = AutoExportConfig(
            enabled = true,
            interval = "monthly",
            timeOfDay = "00:00",
            monthlyDom = 31
        )
        val next = config.nextExportTimestamp()
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        cal.timeInMillis = next * 1000
        val month = cal.get(Calendar.MONTH)
        val dom = cal.get(Calendar.DAY_OF_MONTH)
        val maxForMonth = cal.getActualMaximum(Calendar.DAY_OF_MONTH)
        assertEquals(
            "Clamped DOM should equal min(31, monthMax) for month=$month",
            minOf(31, maxForMonth),
            dom
        )
    }

    @Test
    fun `monthly nextExportTimestamp picks configured day for normal month`() {
        val config = AutoExportConfig(
            enabled = true,
            interval = "monthly",
            timeOfDay = "06:00",
            monthlyDom = 15
        )
        val next = config.nextExportTimestamp()
        val cal = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
        cal.timeInMillis = next * 1000
        assertEquals(15, cal.get(Calendar.DAY_OF_MONTH))
        assertEquals(6, cal.get(Calendar.HOUR_OF_DAY))
    }

    // --- defaults ---

    @Test
    fun `default config has sensible defaults`() {
        val config = AutoExportConfig()
        assertFalse(config.enabled)
        assertEquals("geojson", config.format)
        assertEquals("daily", config.interval)
        assertEquals("all", config.mode)
        assertNull(config.uri)
        assertEquals(0L, config.lastExportTimestamp)
        assertFalse(config.permissionLost)
        assertEquals(10, config.retentionCount)
        assertEquals("00:00", config.timeOfDay)
        assertEquals(1, config.weeklyDow)
        assertEquals(1, config.monthlyDom)
        assertEquals(0L, config.enabledAt)
    }

    // --- migration: from() derives schedule from lastExportTimestamp ---

    @Test
    fun `from migrates legacy lastExportTimestamp into timeOfDay`() {
        val db = mockk<com.Colota.data.DatabaseHelper>(relaxed = true)
        val legacy = atUtc(2024, 3, 15, 17, 11)
        every { db.getSetting(any(), any()) } answers {
            when (firstArg<String>()) {
                "autoExportEnabled" -> "true"
                "autoExportFormat" -> "geojson"
                "autoExportInterval" -> "daily"
                "autoExportMode" -> "all"
                "lastAutoExportTimestamp" -> legacy.toString()
                "autoExportPermissionLost" -> "false"
                "autoExportRetentionCount" -> "10"
                "autoExportLastRowCount" -> "0"
                else -> null
            }
        }
        val config = AutoExportConfig.from(db)
        assertEquals("17:11", config.timeOfDay)
        assertEquals(15, config.monthlyDom)
        verify { db.saveSetting("autoExportTimeOfDay", "17:11") }
        verify { db.saveSetting("autoExportMonthlyDom", "15") }
    }

    @Test
    fun `from on fresh install does not write derived defaults to DB`() {
        // No legacy lastTs and no schedule keys set - simulates a brand-new install.
        // Reading config should not write anything because there's nothing to migrate.
        val db = mockk<com.Colota.data.DatabaseHelper>(relaxed = true)
        every { db.getSetting(any(), any()) } answers {
            when (firstArg<String>()) {
                "autoExportEnabled" -> "false"
                "autoExportFormat" -> "geojson"
                "autoExportInterval" -> "daily"
                "autoExportMode" -> "all"
                "lastAutoExportTimestamp" -> "0"
                "autoExportPermissionLost" -> "false"
                "autoExportRetentionCount" -> "10"
                "autoExportLastRowCount" -> "0"
                else -> null
            }
        }
        val config = AutoExportConfig.from(db)
        assertEquals("00:00", config.timeOfDay)
        assertEquals(1, config.weeklyDow)
        assertEquals(1, config.monthlyDom)
        verify(exactly = 0) { db.saveSetting("autoExportTimeOfDay", any()) }
        verify(exactly = 0) { db.saveSetting("autoExportWeeklyDow", any()) }
        verify(exactly = 0) { db.saveSetting("autoExportMonthlyDom", any()) }
    }

    @Test
    fun `from does not overwrite explicitly-set timeOfDay`() {
        val db = mockk<com.Colota.data.DatabaseHelper>(relaxed = true)
        every { db.getSetting(any(), any()) } answers {
            when (firstArg<String>()) {
                "autoExportEnabled" -> "true"
                "autoExportFormat" -> "geojson"
                "autoExportInterval" -> "daily"
                "autoExportMode" -> "all"
                "lastAutoExportTimestamp" -> "0"
                "autoExportPermissionLost" -> "false"
                "autoExportRetentionCount" -> "10"
                "autoExportLastRowCount" -> "0"
                "autoExportTimeOfDay" -> "09:00"
                "autoExportWeeklyDow" -> "3"
                "autoExportMonthlyDom" -> "15"
                else -> null
            }
        }
        val config = AutoExportConfig.from(db)
        assertEquals("09:00", config.timeOfDay)
        assertEquals(3, config.weeklyDow)
        assertEquals(15, config.monthlyDom)
        verify(exactly = 0) { db.saveSetting("autoExportTimeOfDay", any()) }
        verify(exactly = 0) { db.saveSetting("autoExportWeeklyDow", any()) }
        verify(exactly = 0) { db.saveSetting("autoExportMonthlyDom", any()) }
    }

    // --- saveLastResult / saveLastError ---

    @Test
    fun `saveLastResult stores fileName, rowCount, and clears error`() {
        val db = mockk<com.Colota.data.DatabaseHelper>(relaxed = true)
        val config = AutoExportConfig()
        config.saveLastResult(db, "colota_export_2026-03-10_1200.geojson", 42)

        verify { db.saveSetting("autoExportLastFileName", "colota_export_2026-03-10_1200.geojson") }
        verify { db.saveSetting("autoExportLastRowCount", "42") }
        verify { db.saveSetting("autoExportLastError", "") }
    }

    // --- monthly DOM=31 sequence Jan -> Feb -> Mar ---

    @Test
    fun `monthly dom 31 walks Jan to Feb to Mar`() {
        val config = AutoExportConfig(
            enabled = true, interval = "monthly", timeOfDay = "00:00", monthlyDom = 31
        )
        assertEquals(atUtc(2025, 1, 31), config.nextExportTimestampAt(atUtc(2025, 1, 30) * 1000))
        assertEquals(atUtc(2025, 2, 28), config.nextExportTimestampAt(atUtc(2025, 2, 1) * 1000))
        assertEquals(atUtc(2025, 3, 31), config.nextExportTimestampAt(atUtc(2025, 3, 1) * 1000))
    }

    // --- weekly when today is the target weekday and time is still in the future ---

    @Test
    fun `weekly today before slot returns today`() {
        // 2025-06-09 is a Monday.
        val config = AutoExportConfig(
            enabled = true, interval = "weekly", timeOfDay = "23:00", weeklyDow = 1
        )
        assertEquals(
            atUtc(2025, 6, 9, 23, 0),
            config.nextExportTimestampAt(atUtc(2025, 6, 9, 6, 0) * 1000)
        )
    }

    @Test
    fun `weekly today after slot returns next week`() {
        val config = AutoExportConfig(
            enabled = true, interval = "weekly", timeOfDay = "09:00", weeklyDow = 1
        )
        assertEquals(
            atUtc(2025, 6, 16, 9, 0),
            config.nextExportTimestampAt(atUtc(2025, 6, 9, 14, 0) * 1000)
        )
    }

    @Test
    fun `weekly fires when today is target dow and slot has passed`() {
        // 2025-06-09 is a Monday.
        val config = AutoExportConfig(
            enabled = true,
            interval = "weekly",
            timeOfDay = "09:00",
            weeklyDow = 1,
            lastExportTimestamp = atUtc(2025, 6, 2, 9, 0)
        )
        assertTrue(config.isExportDueAt(atUtc(2025, 6, 9, 14, 0) * 1000))
    }

    // --- isExportDue grace window blocks fast re-fire after schedule edit ---

    @Test
    fun `schedule edit to earlier time fires same day`() {
        val config = AutoExportConfig(
            enabled = true,
            interval = "daily",
            timeOfDay = "02:00",
            lastExportTimestamp = atUtc(2025, 6, 8, 22, 0)
        )
        assertTrue(config.isExportDueAt(atUtc(2025, 6, 9, 3, 0) * 1000))
    }

    @Test
    fun `saveLastError stores error message`() {
        val db = mockk<com.Colota.data.DatabaseHelper>(relaxed = true)
        val config = AutoExportConfig()
        config.saveLastError(db, "IO error: disk full")

        verify { db.saveSetting("autoExportLastError", "IO error: disk full") }
    }
}
