package com.Colota.util

import android.content.Context
import android.content.Intent
import android.os.BatteryManager
import io.mockk.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import com.Colota.util.AppLogger
import org.junit.After

/**
 * Tests for DeviceInfoHelper using a real instance:
 * - isBatteryCritical (via mocked battery intent)
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

        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
    }

    // --- isBatteryCritical ---

    @Test
    fun `low battery while unplugged is critical`() {
        mockBatteryIntent(level = 4, scale = 100, status = BatteryManager.BATTERY_STATUS_DISCHARGING, plugged = 0)
        assertTrue(helper.isBatteryCritical(5))
    }

    @Test
    fun `battery exactly at threshold while unplugged is not critical`() {
        mockBatteryIntent(level = 5, scale = 100, status = BatteryManager.BATTERY_STATUS_DISCHARGING, plugged = 0)
        assertFalse(helper.isBatteryCritical(5))
    }

    @Test
    fun `battery at 1 percent while unplugged is critical`() {
        mockBatteryIntent(level = 1, scale = 100, status = BatteryManager.BATTERY_STATUS_DISCHARGING, plugged = 0)
        assertTrue(helper.isBatteryCritical(5))
    }

    @Test
    fun `battery at 0 percent while unplugged is critical`() {
        mockBatteryIntent(level = 0, scale = 100, status = BatteryManager.BATTERY_STATUS_DISCHARGING, plugged = 0)
        assertTrue(helper.isBatteryCritical(5))
    }

    @Test
    fun `low battery plugged via AC is not critical`() {
        mockBatteryIntent(level = 4, scale = 100, status = BatteryManager.BATTERY_STATUS_CHARGING, plugged = BatteryManager.BATTERY_PLUGGED_AC)
        assertFalse(helper.isBatteryCritical(5))
    }

    @Test
    fun `low battery plugged via USB is not critical`() {
        mockBatteryIntent(level = 4, scale = 100, status = BatteryManager.BATTERY_STATUS_CHARGING, plugged = BatteryManager.BATTERY_PLUGGED_USB)
        assertFalse(helper.isBatteryCritical(5))
    }

    @Test
    fun `low battery plugged in but reported not charging is not critical`() {
        // Plugged but NOT_CHARGING (charge-limited / thermal) - must not stop.
        mockBatteryIntent(level = 4, scale = 100, status = BatteryManager.BATTERY_STATUS_NOT_CHARGING, plugged = BatteryManager.BATTERY_PLUGGED_AC)
        assertFalse(helper.isBatteryCritical(5))
    }

    @Test
    fun `low battery with unknown status while unplugged is critical`() {
        // Gated on plugged state, not status - so unknown+unplugged still stops.
        mockBatteryIntent(level = 4, scale = 100, status = BatteryManager.BATTERY_STATUS_UNKNOWN, plugged = 0)
        assertTrue(helper.isBatteryCritical(5))
    }

    @Test
    fun `healthy battery while unplugged is not critical`() {
        mockBatteryIntent(level = 50, scale = 100, status = BatteryManager.BATTERY_STATUS_DISCHARGING, plugged = 0)
        assertFalse(helper.isBatteryCritical(5))
    }

    @Test
    fun `custom threshold 10 percent works`() {
        mockBatteryIntent(level = 9, scale = 100, status = BatteryManager.BATTERY_STATUS_DISCHARGING, plugged = 0)
        assertTrue(helper.isBatteryCritical(10))
        mockBatteryIntent(level = 10, scale = 100, status = BatteryManager.BATTERY_STATUS_DISCHARGING, plugged = 0)
        assertFalse(helper.isBatteryCritical(10))
    }

    @Test
    fun `custom threshold 1 percent works`() {
        mockBatteryIntent(level = 0, scale = 100, status = BatteryManager.BATTERY_STATUS_DISCHARGING, plugged = 0)
        assertTrue(helper.isBatteryCritical(1))
        mockBatteryIntent(level = 1, scale = 100, status = BatteryManager.BATTERY_STATUS_DISCHARGING, plugged = 0)
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

    @Test
    fun `isPluggedIn returns true when plugged via AC`() {
        mockBatteryIntent(level = 50, scale = 100, status = BatteryManager.BATTERY_STATUS_CHARGING, plugged = BatteryManager.BATTERY_PLUGGED_AC)
        assertTrue(helper.isPluggedIn())
    }

    @Test
    fun `isPluggedIn returns true when plugged via USB`() {
        mockBatteryIntent(level = 50, scale = 100, status = BatteryManager.BATTERY_STATUS_CHARGING, plugged = BatteryManager.BATTERY_PLUGGED_USB)
        assertTrue(helper.isPluggedIn())
    }

    @Test
    fun `isPluggedIn returns false when unplugged`() {
        mockBatteryIntent(level = 50, scale = 100, status = BatteryManager.BATTERY_STATUS_DISCHARGING, plugged = 0)
        assertFalse(helper.isPluggedIn())
    }

    @Test
    fun `isPluggedIn returns false when intent is null`() {
        every { context.registerReceiver(null, any()) } returns null
        assertFalse(helper.isPluggedIn())
    }

    // --- Helper ---

    private fun mockBatteryIntent(level: Int, scale: Int, status: Int, plugged: Int = 0) {
        val batteryIntent = mockk<Intent> {
            every { getIntExtra(BatteryManager.EXTRA_LEVEL, -1) } returns level
            every { getIntExtra(BatteryManager.EXTRA_SCALE, -1) } returns scale
            every { getIntExtra(BatteryManager.EXTRA_STATUS, -1) } returns status
            every { getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) } returns plugged
        }
        every { context.registerReceiver(null, any()) } returns batteryIntent
    }
}
