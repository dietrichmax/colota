package com.Colota.util

import android.content.Context
import android.content.Intent
import android.os.BatteryManager
import io.mockk.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Tests for DeviceInfoHelper using a real instance:
 * - isBatteryCritical (via spyk + stubbed getCachedBatteryStatus)
 * - getBatteryStatusString (via spyk + stubbed getCachedBatteryStatus)
 * - getBatteryStatus (via mocked battery intent)
 */
class DeviceInfoHelperTest {

    private lateinit var context: Context
    private lateinit var helper: DeviceInfoHelper

    @Before
    fun setUp() {
        context = mockk(relaxed = true)
        helper = spyk(DeviceInfoHelper(context))
    }

    // --- isBatteryCritical ---

    @Test
    fun `battery at 4 percent discharging is critical`() {
        every { helper.getCachedBatteryStatus() } returns Pair(4, 1)
        assertTrue(helper.isBatteryCritical(5))
    }

    @Test
    fun `battery at 5 percent discharging is not critical`() {
        every { helper.getCachedBatteryStatus() } returns Pair(5, 1)
        assertFalse(helper.isBatteryCritical(5))
    }

    @Test
    fun `battery at 1 percent discharging is critical`() {
        every { helper.getCachedBatteryStatus() } returns Pair(1, 1)
        assertTrue(helper.isBatteryCritical(5))
    }

    @Test
    fun `battery at 0 percent discharging is critical`() {
        every { helper.getCachedBatteryStatus() } returns Pair(0, 1)
        assertTrue(helper.isBatteryCritical(5))
    }

    @Test
    fun `battery at 4 percent charging is not critical`() {
        every { helper.getCachedBatteryStatus() } returns Pair(4, 2)
        assertFalse(helper.isBatteryCritical(5))
    }

    @Test
    fun `battery at 4 percent full is not critical`() {
        every { helper.getCachedBatteryStatus() } returns Pair(4, 3)
        assertFalse(helper.isBatteryCritical(5))
    }

    @Test
    fun `battery at 4 percent unknown status is not critical`() {
        every { helper.getCachedBatteryStatus() } returns Pair(4, 0)
        assertFalse(helper.isBatteryCritical(5))
    }

    @Test
    fun `battery at 50 percent discharging is not critical`() {
        every { helper.getCachedBatteryStatus() } returns Pair(50, 1)
        assertFalse(helper.isBatteryCritical(5))
    }

    @Test
    fun `custom threshold 10 percent works`() {
        every { helper.getCachedBatteryStatus() } returns Pair(9, 1)
        assertTrue(helper.isBatteryCritical(10))
        every { helper.getCachedBatteryStatus() } returns Pair(10, 1)
        assertFalse(helper.isBatteryCritical(10))
    }

    @Test
    fun `custom threshold 1 percent works`() {
        every { helper.getCachedBatteryStatus() } returns Pair(0, 1)
        assertTrue(helper.isBatteryCritical(1))
        every { helper.getCachedBatteryStatus() } returns Pair(1, 1)
        assertFalse(helper.isBatteryCritical(1))
    }

    // --- getBatteryStatusString ---

    @Test
    fun `battery status string for discharging`() {
        every { helper.getCachedBatteryStatus() } returns Pair(50, 1)
        assertEquals("50% (Unplugged/Discharging)", helper.getBatteryStatusString())
    }

    @Test
    fun `battery status string for charging`() {
        every { helper.getCachedBatteryStatus() } returns Pair(85, 2)
        assertEquals("85% (Charging)", helper.getBatteryStatusString())
    }

    @Test
    fun `battery status string for full`() {
        every { helper.getCachedBatteryStatus() } returns Pair(100, 3)
        assertEquals("100% (Full)", helper.getBatteryStatusString())
    }

    @Test
    fun `battery status string for unknown`() {
        every { helper.getCachedBatteryStatus() } returns Pair(75, 0)
        assertEquals("75% (Unknown)", helper.getBatteryStatusString())
    }

    @Test
    fun `battery status string for unexpected code`() {
        every { helper.getCachedBatteryStatus() } returns Pair(60, 99)
        assertEquals("60% (Unknown (99))", helper.getBatteryStatusString())
    }

    // --- getBatteryStatus (real intent parsing) ---

    @Test
    fun `getBatteryStatus parses charging intent correctly`() {
        mockBatteryIntent(level = 75, scale = 100, status = BatteryManager.BATTERY_STATUS_CHARGING)

        val (level, statusCode) = helper.getBatteryStatus()
        assertEquals(75, level)
        assertEquals(2, statusCode)
    }

    @Test
    fun `getBatteryStatus parses full intent correctly`() {
        mockBatteryIntent(level = 100, scale = 100, status = BatteryManager.BATTERY_STATUS_FULL)

        val (level, statusCode) = helper.getBatteryStatus()
        assertEquals(100, level)
        assertEquals(3, statusCode)
    }

    @Test
    fun `getBatteryStatus parses discharging intent correctly`() {
        mockBatteryIntent(level = 42, scale = 100, status = BatteryManager.BATTERY_STATUS_DISCHARGING)

        val (level, statusCode) = helper.getBatteryStatus()
        assertEquals(42, level)
        assertEquals(1, statusCode)
    }

    @Test
    fun `getBatteryStatus calculates percentage with non-100 scale`() {
        mockBatteryIntent(level = 150, scale = 200, status = BatteryManager.BATTERY_STATUS_CHARGING)

        val (level, _) = helper.getBatteryStatus()
        assertEquals(75, level)
    }

    @Test
    fun `getBatteryStatus defaults to 100 when level is negative`() {
        mockBatteryIntent(level = -1, scale = 100, status = BatteryManager.BATTERY_STATUS_DISCHARGING)

        val (level, _) = helper.getBatteryStatus()
        assertEquals(100, level)
    }

    @Test
    fun `getBatteryStatus defaults to 100 when scale is 0`() {
        mockBatteryIntent(level = 50, scale = 0, status = BatteryManager.BATTERY_STATUS_FULL)

        val (level, _) = helper.getBatteryStatus()
        assertEquals(100, level)
    }

    @Test
    fun `getBatteryStatus defaults to 100 when scale is negative`() {
        mockBatteryIntent(level = 50, scale = -1, status = BatteryManager.BATTERY_STATUS_FULL)

        val (level, _) = helper.getBatteryStatus()
        assertEquals(100, level)
    }

    @Test
    fun `getBatteryStatus handles null intent`() {
        every { context.registerReceiver(null, any()) } returns null

        val (level, statusCode) = helper.getBatteryStatus()
        assertEquals(100, level)
        assertEquals(0, statusCode)
    }

    // --- Helper ---

    private fun mockBatteryIntent(level: Int, scale: Int, status: Int) {
        val batteryIntent = mockk<Intent> {
            every { getIntExtra(BatteryManager.EXTRA_LEVEL, -1) } returns level
            every { getIntExtra(BatteryManager.EXTRA_SCALE, -1) } returns scale
            every { getIntExtra(BatteryManager.EXTRA_STATUS, -1) } returns status
        }
        every { context.registerReceiver(null, any()) } returns batteryIntent
    }
}
