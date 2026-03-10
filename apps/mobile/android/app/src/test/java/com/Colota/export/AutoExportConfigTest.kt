package com.Colota.export

import io.mockk.mockk
import io.mockk.verify
import org.junit.Assert.*
import org.junit.Test

class AutoExportConfigTest {

    // --- isExportDue ---

    @Test
    fun `isExportDue returns true when never exported`() {
        val config = AutoExportConfig(enabled = true, lastExportTimestamp = 0L)
        assertTrue(config.isExportDue())
    }

    @Test
    fun `isExportDue returns true when daily interval has passed`() {
        val now = System.currentTimeMillis() / 1000
        val config = AutoExportConfig(
            enabled = true,
            interval = "daily",
            lastExportTimestamp = now - (25 * 3600) // 25 hours ago
        )
        assertTrue(config.isExportDue())
    }

    @Test
    fun `isExportDue returns false when daily interval has not passed`() {
        val now = System.currentTimeMillis() / 1000
        val config = AutoExportConfig(
            enabled = true,
            interval = "daily",
            lastExportTimestamp = now - (23 * 3600) // 23 hours ago
        )
        assertFalse(config.isExportDue())
    }

    @Test
    fun `isExportDue returns true when weekly interval has passed`() {
        val now = System.currentTimeMillis() / 1000
        val config = AutoExportConfig(
            enabled = true,
            interval = "weekly",
            lastExportTimestamp = now - (169 * 3600) // 169 hours ago (> 168)
        )
        assertTrue(config.isExportDue())
    }

    @Test
    fun `isExportDue returns false when weekly interval has not passed`() {
        val now = System.currentTimeMillis() / 1000
        val config = AutoExportConfig(
            enabled = true,
            interval = "weekly",
            lastExportTimestamp = now - (167 * 3600) // 167 hours ago (< 168)
        )
        assertFalse(config.isExportDue())
    }

    @Test
    fun `isExportDue returns true when monthly interval has passed`() {
        val now = System.currentTimeMillis() / 1000
        val config = AutoExportConfig(
            enabled = true,
            interval = "monthly",
            lastExportTimestamp = now - (32L * 24 * 3600) // 32 days ago
        )
        assertTrue(config.isExportDue())
    }

    @Test
    fun `isExportDue returns false when monthly interval has not passed`() {
        val now = System.currentTimeMillis() / 1000
        val config = AutoExportConfig(
            enabled = true,
            interval = "monthly",
            lastExportTimestamp = now - (27L * 24 * 3600) // 27 days ago
        )
        assertFalse(config.isExportDue())
    }

    // --- nextExportTimestamp ---

    @Test
    fun `nextExportTimestamp returns 0 when disabled`() {
        val config = AutoExportConfig(enabled = false, lastExportTimestamp = 1000L)
        assertEquals(0L, config.nextExportTimestamp())
    }

    @Test
    fun `nextExportTimestamp returns 0 when never exported`() {
        val config = AutoExportConfig(enabled = true, lastExportTimestamp = 0L)
        assertEquals(0L, config.nextExportTimestamp())
    }

    @Test
    fun `nextExportTimestamp adds 24h for daily`() {
        val last = 1700000000L
        val config = AutoExportConfig(
            enabled = true,
            interval = "daily",
            lastExportTimestamp = last
        )
        assertEquals(last + (24 * 3600), config.nextExportTimestamp())
    }

    @Test
    fun `nextExportTimestamp adds 168h for weekly`() {
        val last = 1700000000L
        val config = AutoExportConfig(
            enabled = true,
            interval = "weekly",
            lastExportTimestamp = last
        )
        assertEquals(last + (168 * 3600), config.nextExportTimestamp())
    }

    @Test
    fun `nextExportTimestamp adds one month for monthly`() {
        // Jan 15 2024 -> Feb 15 2024
        val jan15 = 1705276800L // 2024-01-15 00:00:00 UTC
        val config = AutoExportConfig(
            enabled = true,
            interval = "monthly",
            lastExportTimestamp = jan15
        )
        val next = config.nextExportTimestamp()
        // Should be approximately 31 days later (Feb 15)
        val diff = next - jan15
        assertTrue("Monthly interval should be between 28 and 31 days, was ${diff / 86400} days",
            diff in (28L * 86400)..(31L * 86400))
    }

    @Test
    fun `nextExportTimestamp defaults to 24h for unknown interval`() {
        val last = 1700000000L
        val config = AutoExportConfig(
            enabled = true,
            interval = "unknown",
            lastExportTimestamp = last
        )
        assertEquals(last + (24 * 3600), config.nextExportTimestamp())
    }

    // --- defaults ---

    @Test
    fun `default config is disabled with sensible defaults`() {
        val config = AutoExportConfig()
        assertFalse(config.enabled)
        assertEquals("geojson", config.format)
        assertEquals("daily", config.interval)
        assertEquals("all", config.mode)
        assertNull(config.uri)
        assertEquals(0L, config.lastExportTimestamp)
        assertFalse(config.permissionLost)
        assertEquals(10, config.retentionCount)
        assertNull(config.lastFileName)
        assertEquals(0, config.lastRowCount)
        assertNull(config.lastError)
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

    @Test
    fun `saveLastError stores error message`() {
        val db = mockk<com.Colota.data.DatabaseHelper>(relaxed = true)
        val config = AutoExportConfig()
        config.saveLastError(db, "IO error: disk full")

        verify { db.saveSetting("autoExportLastError", "IO error: disk full") }
    }
}
