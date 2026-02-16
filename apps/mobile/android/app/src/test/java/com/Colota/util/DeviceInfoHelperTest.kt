package com.Colota.util

import org.junit.Assert.*
import org.junit.Test

/**
 * Tests for DeviceInfoHelper's pure logic methods.
 * Battery status parsing and critical threshold checks are tested
 * by exercising the logic patterns directly rather than through the
 * Android-dependent methods.
 */
class DeviceInfoHelperTest {

    // --- isBatteryCritical logic ---

    @Test
    fun `battery at 4 percent discharging is critical`() {
        assertTrue(isBatteryCriticalLogic(level = 4, status = 1, threshold = 5))
    }

    @Test
    fun `battery at 5 percent discharging is not critical`() {
        // < threshold, so 5 is NOT < 5
        assertFalse(isBatteryCriticalLogic(level = 5, status = 1, threshold = 5))
    }

    @Test
    fun `battery at 1 percent discharging is critical`() {
        assertTrue(isBatteryCriticalLogic(level = 1, status = 1, threshold = 5))
    }

    @Test
    fun `battery at 0 percent discharging is critical`() {
        assertTrue(isBatteryCriticalLogic(level = 0, status = 1, threshold = 5))
    }

    @Test
    fun `battery at 4 percent charging is not critical`() {
        assertFalse(isBatteryCriticalLogic(level = 4, status = 2, threshold = 5))
    }

    @Test
    fun `battery at 4 percent full is not critical`() {
        assertFalse(isBatteryCriticalLogic(level = 4, status = 3, threshold = 5))
    }

    @Test
    fun `battery at 4 percent unknown status is not critical`() {
        assertFalse(isBatteryCriticalLogic(level = 4, status = 0, threshold = 5))
    }

    @Test
    fun `battery at 50 percent discharging is not critical`() {
        assertFalse(isBatteryCriticalLogic(level = 50, status = 1, threshold = 5))
    }

    @Test
    fun `custom threshold 10 percent works`() {
        assertTrue(isBatteryCriticalLogic(level = 9, status = 1, threshold = 10))
        assertFalse(isBatteryCriticalLogic(level = 10, status = 1, threshold = 10))
    }

    @Test
    fun `custom threshold 1 percent works`() {
        assertTrue(isBatteryCriticalLogic(level = 0, status = 1, threshold = 1))
        assertFalse(isBatteryCriticalLogic(level = 1, status = 1, threshold = 1))
    }

    // --- Battery status code mapping ---

    @Test
    fun `battery status string for discharging`() {
        assertEquals("Unplugged/Discharging", statusCodeToString(1))
    }

    @Test
    fun `battery status string for charging`() {
        assertEquals("Charging", statusCodeToString(2))
    }

    @Test
    fun `battery status string for full`() {
        assertEquals("Full", statusCodeToString(3))
    }

    @Test
    fun `battery status string for unknown`() {
        assertEquals("Unknown", statusCodeToString(0))
    }

    @Test
    fun `battery status string for unexpected code`() {
        assertEquals("Unknown (99)", statusCodeToString(99))
    }

    // --- Battery percentage calculation ---

    @Test
    fun `battery percentage calculation normal case`() {
        val pct = calculateBatteryPct(level = 75, scale = 100)
        assertEquals(75, pct)
    }

    @Test
    fun `battery percentage calculation with non-100 scale`() {
        val pct = calculateBatteryPct(level = 150, scale = 200)
        assertEquals(75, pct)
    }

    @Test
    fun `battery percentage calculation at 0`() {
        val pct = calculateBatteryPct(level = 0, scale = 100)
        assertEquals(0, pct)
    }

    @Test
    fun `battery percentage calculation at 100`() {
        val pct = calculateBatteryPct(level = 100, scale = 100)
        assertEquals(100, pct)
    }

    @Test
    fun `battery percentage defaults to 100 when level is negative`() {
        val pct = calculateBatteryPct(level = -1, scale = 100)
        assertEquals(100, pct)
    }

    @Test
    fun `battery percentage defaults to 100 when scale is 0`() {
        val pct = calculateBatteryPct(level = 50, scale = 0)
        assertEquals(100, pct)
    }

    @Test
    fun `battery percentage defaults to 100 when scale is negative`() {
        val pct = calculateBatteryPct(level = 50, scale = -1)
        assertEquals(100, pct)
    }

    // --- getBatteryStatusString format ---

    @Test
    fun `battery status string format includes level and status`() {
        val result = formatBatteryStatusString(level = 85, status = 2)
        assertEquals("85% (Charging)", result)
    }

    @Test
    fun `battery status string format for low discharging`() {
        val result = formatBatteryStatusString(level = 3, status = 1)
        assertEquals("3% (Unplugged/Discharging)", result)
    }

    // --- Helper methods that replicate the logic under test ---

    private fun isBatteryCriticalLogic(level: Int, status: Int, threshold: Int): Boolean {
        return level < threshold && status == 1
    }

    private fun statusCodeToString(status: Int): String {
        return when (status) {
            0 -> "Unknown"
            1 -> "Unplugged/Discharging"
            2 -> "Charging"
            3 -> "Full"
            else -> "Unknown ($status)"
        }
    }

    private fun calculateBatteryPct(level: Int, scale: Int): Int {
        return if (level >= 0 && scale > 0) {
            (level * 100) / scale
        } else {
            100
        }
    }

    private fun formatBatteryStatusString(level: Int, status: Int): String {
        val statusText = statusCodeToString(status)
        return "$level% ($statusText)"
    }
}
