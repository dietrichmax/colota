package com.Colota.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.Colota.util.AppLogger
import com.Colota.util.DeviceInfoHelper
import io.mockk.*
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

/**
 * BatteryMonitor fires the critical callback from the ACTION_BATTERY_CHANGED broadcast
 * (not the GPS stream), and register/unregister are idempotent.
 */
class BatteryMonitorTest {

    private lateinit var context: Context
    private lateinit var deviceInfoHelper: DeviceInfoHelper
    private var criticalCount = 0
    private lateinit var monitor: BatteryMonitor

    @Before
    fun setUp() {
        context = mockk(relaxed = true)
        deviceInfoHelper = mockk()
        criticalCount = 0
        monitor = BatteryMonitor(context, deviceInfoHelper) { criticalCount++ }

        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
    }

    private fun fireBatteryBroadcast() {
        val field = BatteryMonitor::class.java.getDeclaredField("receiver").apply { isAccessible = true }
        val receiver = field.get(monitor) as BroadcastReceiver
        receiver.onReceive(context, Intent(Intent.ACTION_BATTERY_CHANGED))
    }

    @Test
    fun `fires callback when battery is critical`() {
        every { deviceInfoHelper.isBatteryCritical() } returns true

        fireBatteryBroadcast()

        assertEquals(1, criticalCount)
    }

    @Test
    fun `does not fire callback when battery is not critical`() {
        every { deviceInfoHelper.isBatteryCritical() } returns false

        fireBatteryBroadcast()

        assertEquals(0, criticalCount)
    }

    @Test
    fun `start is idempotent and stop unregisters once`() {
        monitor.start()
        monitor.start()
        monitor.stop()
        monitor.stop()

        verify(exactly = 1) { context.unregisterReceiver(any()) }
    }

    @Test
    fun `stop without start does not unregister`() {
        monitor.stop()

        verify(exactly = 0) { context.unregisterReceiver(any()) }
    }
}
