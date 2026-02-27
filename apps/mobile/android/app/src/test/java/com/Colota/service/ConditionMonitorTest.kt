/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Handler
import androidx.car.app.connection.CarConnection
import androidx.lifecycle.LiveData
import androidx.lifecycle.Observer
import io.mockk.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import com.Colota.util.AppLogger
import org.junit.After

/**
 * Tests for ConditionMonitor:
 * - readCurrentChargingState (battery status parsing)
 * - start() lifecycle (initial state, receiver registration, car connection)
 * - Charging BroadcastReceiver (power connected/disconnected events)
 * - Car connection lifecycle (start/stop, observer cleanup)
 * - stop() cleanup (unregister, null-safety, exception handling)
 */
class ConditionMonitorTest {

    private lateinit var mockContext: Context
    private lateinit var mockProfileManager: ProfileManager
    private lateinit var mockHandler: Handler
    private lateinit var monitor: ConditionMonitor

    @Before
    fun setUp() {
        mockContext = mockk(relaxed = true)
        mockProfileManager = mockk(relaxed = true)
        mockHandler = mockk(relaxed = true)

        // Execute handler.post() runnables synchronously
        every { mockHandler.post(any()) } answers {
            firstArg<Runnable>().run()
            true
        }

        monitor = createMonitor()

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

    // ========================================================================
    // readCurrentChargingState
    // ========================================================================

    @Test
    fun `readCurrentChargingState returns true when charging`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_CHARGING)
        assertTrue(callReadCurrentChargingState())
    }

    @Test
    fun `readCurrentChargingState returns true when full`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_FULL)
        assertTrue(callReadCurrentChargingState())
    }

    @Test
    fun `readCurrentChargingState returns false when discharging`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_DISCHARGING)
        assertFalse(callReadCurrentChargingState())
    }

    @Test
    fun `readCurrentChargingState returns false when not charging`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_NOT_CHARGING)
        assertFalse(callReadCurrentChargingState())
    }

    @Test
    fun `readCurrentChargingState returns false when unknown`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_UNKNOWN)
        assertFalse(callReadCurrentChargingState())
    }

    @Test
    fun `readCurrentChargingState returns false when null intent`() {
        every { mockContext.registerReceiver(isNull(), any<IntentFilter>()) } returns null
        assertFalse(callReadCurrentChargingState())
    }

    // ========================================================================
    // start — initial state and registration
    // ========================================================================

    @Test
    fun `start notifies profileManager with initial charging state`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_CHARGING)
        monitor.start()
        verify { mockProfileManager.onChargingStateChanged(true) }
    }

    @Test
    fun `start notifies profileManager when initially not charging`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_DISCHARGING)
        monitor.start()
        verify { mockProfileManager.onChargingStateChanged(false) }
    }

    @Test
    fun `start registers charging broadcast receiver`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_DISCHARGING)
        monitor.start()
        verify { mockContext.registerReceiver(any(), any<IntentFilter>(), any<Int>()) }
    }

    @Test
    fun `start calls stop first to prevent duplicate registrations`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_DISCHARGING)
        val oldReceiver = mockk<BroadcastReceiver>()
        setField(monitor, "chargingReceiver", oldReceiver)

        monitor.start()

        verify { mockContext.unregisterReceiver(oldReceiver) }
    }

    @Test
    fun `start begins car connection monitoring`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_DISCHARGING)
        monitor.start()
        verify { monitor["startCarConnectionMonitor"]() }
    }

    // ========================================================================
    // Charging receiver — power events
    // ========================================================================

    @Test
    fun `charging receiver notifies profileManager on power connected`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_DISCHARGING)
        monitor.start()

        val receiver = getField(monitor, "chargingReceiver") as BroadcastReceiver
        val intent = mockk<Intent> { every { action } returns Intent.ACTION_POWER_CONNECTED }
        receiver.onReceive(mockContext, intent)

        verify { mockProfileManager.onChargingStateChanged(true) }
    }

    @Test
    fun `charging receiver notifies profileManager on power disconnected`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_CHARGING)
        monitor.start()

        val receiver = getField(monitor, "chargingReceiver") as BroadcastReceiver
        val intent = mockk<Intent> { every { action } returns Intent.ACTION_POWER_DISCONNECTED }
        receiver.onReceive(mockContext, intent)

        verify { mockProfileManager.onChargingStateChanged(false) }
    }

    @Test
    fun `charging receiver ignores unrelated actions`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_DISCHARGING)
        monitor.start()

        // start() called onChargingStateChanged(false) once
        verify(exactly = 1) { mockProfileManager.onChargingStateChanged(any()) }

        val receiver = getField(monitor, "chargingReceiver") as BroadcastReceiver
        val intent = mockk<Intent> { every { action } returns "com.example.UNRELATED" }
        receiver.onReceive(mockContext, intent)

        // Still only 1 call — the unrelated action was ignored
        verify(exactly = 1) { mockProfileManager.onChargingStateChanged(any()) }
    }

    // ========================================================================
    // stop — cleanup
    // ========================================================================

    @Test
    fun `stop unregisters charging receiver`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_DISCHARGING)
        monitor.start()

        val receiver = getField(monitor, "chargingReceiver") as BroadcastReceiver
        monitor.stop()

        verify { mockContext.unregisterReceiver(receiver) }
        assertNull(getField(monitor, "chargingReceiver"))
    }

    @Test
    fun `stop handles already unregistered receiver gracefully`() {
        val receiver = mockk<BroadcastReceiver>()
        setField(monitor, "chargingReceiver", receiver)
        every { mockContext.unregisterReceiver(receiver) } throws IllegalArgumentException("not registered")

        // Should not throw
        monitor.stop()
        assertNull(getField(monitor, "chargingReceiver"))
    }

    @Test
    fun `stop when nothing registered does not crash`() {
        // All fields null from Unsafe allocation — no receivers, no car connection
        monitor.stop()
    }

    @Test
    fun `stop calls stopCarConnectionMonitor`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_DISCHARGING)
        monitor.start()
        monitor.stop()
        verify { monitor["stopCarConnectionMonitor"]() }
    }

    // ========================================================================
    // Car connection — observer cleanup via stopCarConnectionMonitor
    // ========================================================================

    @Test
    fun `stopCarConnectionMonitor removes observer and clears fields`() {
        val mockLiveData = mockk<LiveData<Int>>(relaxed = true)
        val mockObserver = mockk<Observer<Int>>()
        val mockCarConn = mockk<CarConnection> {
            every { type } returns mockLiveData
        }
        setField(monitor, "carConnection", mockCarConn)
        setField(monitor, "carConnectionObserver", mockObserver)

        // Allow real stopCarConnectionMonitor for this test
        every { monitor["stopCarConnectionMonitor"]() } answers { callOriginal() }

        monitor.stop()

        verify { mockLiveData.removeObserver(mockObserver) }
        assertNull(getField(monitor, "carConnection"))
        assertNull(getField(monitor, "carConnectionObserver"))
    }

    @Test
    fun `stopCarConnectionMonitor skips when observer is null`() {
        val mockCarConn = mockk<CarConnection>(relaxed = true)
        setField(monitor, "carConnection", mockCarConn)
        // carConnectionObserver is null

        every { monitor["stopCarConnectionMonitor"]() } answers { callOriginal() }

        monitor.stop()

        // removeObserver should not be called because observer was null
        verify(exactly = 0) { mockCarConn.type }
    }

    @Test
    fun `stopCarConnectionMonitor skips when connection is null`() {
        val mockObserver = mockk<Observer<Int>>()
        setField(monitor, "carConnectionObserver", mockObserver)
        // carConnection is null

        every { monitor["stopCarConnectionMonitor"]() } answers { callOriginal() }

        monitor.stop()

        // Should complete without crash — observer null check returns early
        // (observer is non-null but connection is null → returns early after observer check)
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private fun createMonitor(): ConditionMonitor {
        val unsafeClass = Class.forName("sun.misc.Unsafe")
        val unsafeField = unsafeClass.getDeclaredField("theUnsafe")
        unsafeField.isAccessible = true
        val unsafe = unsafeField.get(null)
        val raw = unsafeClass.getMethod("allocateInstance", Class::class.java)
            .invoke(unsafe, ConditionMonitor::class.java) as ConditionMonitor

        val spy = spyk(raw, recordPrivateCalls = true)
        setField(spy, "context", mockContext)
        setField(spy, "profileManager", mockProfileManager)
        setField(spy, "mainHandler", mockHandler)

        // Stub car connection methods — CarConnection cannot be constructed in unit tests
        // because CarConnectionTypeLiveData's static initializer uses Uri.Builder which
        // returns null in the Android test stub environment.
        every { spy["startCarConnectionMonitor"]() } returns Unit
        every { spy["stopCarConnectionMonitor"]() } returns Unit

        return spy
    }

    private fun mockBatteryStatus(status: Int) {
        val batteryIntent = mockk<Intent> {
            every { getIntExtra(BatteryManager.EXTRA_STATUS, -1) } returns status
        }
        every { mockContext.registerReceiver(isNull(), any<IntentFilter>()) } returns batteryIntent
    }

    private fun callReadCurrentChargingState(): Boolean {
        val method = ConditionMonitor::class.java.getDeclaredMethod("readCurrentChargingState")
        method.isAccessible = true
        return method.invoke(monitor) as Boolean
    }

    private fun setField(obj: Any, name: String, value: Any?) {
        val field = ConditionMonitor::class.java.getDeclaredField(name)
        field.isAccessible = true
        field.set(obj, value)
    }

    private fun getField(obj: Any, name: String): Any? {
        val field = ConditionMonitor::class.java.getDeclaredField(name)
        field.isAccessible = true
        return field.get(obj)
    }
}
