/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
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
import com.Colota.sync.NetworkManager
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
    private lateinit var mockNetworkManager: NetworkManager
    private lateinit var mockProfileManager: ProfileManager
    private lateinit var mockHandler: Handler
    private lateinit var monitor: ConditionMonitor

    @Before
    fun setUp() {
        mockContext = mockk(relaxed = true)
        mockNetworkManager = mockk(relaxed = true)
        mockProfileManager = mockk(relaxed = true)
        mockHandler = mockk(relaxed = true)

        // Execute handler.post() runnables synchronously
        every { mockHandler.post(any()) } answers {
            firstArg<Runnable>().run()
            true
        }

        monitor = createMonitor()

        // By default, return all condition types so monitors are started
        every { mockProfileManager.getNeededConditionTypes() } returns setOf(
            ProfileConstants.CONDITION_CHARGING,
            ProfileConstants.CONDITION_ANDROID_AUTO
        )

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
        verify { mockContext.registerReceiver(any(), any<IntentFilter>()) }
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
    // Wi-Fi condition source
    // ========================================================================

    @Test
    fun `start probes the SSID once when a profile watches the network`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_DISCHARGING)
        every { mockProfileManager.getNeededConditionTypes() } returns setOf(ProfileConstants.CONDITION_WIFI_SSID)
        every { mockNetworkManager.isWifiConnected() } returns true
        every { mockNetworkManager.readSsidOnce(any()) } answers {
            firstArg<(String) -> Unit>().invoke("HomeNet")
        }

        monitor.start()

        verify { mockNetworkManager.setWifiStateListener(any()) }
        verify { mockNetworkManager.readSsidOnce(any()) }
        verify { mockProfileManager.onWifiStateChanged(true, "HomeNet") }
    }

    @Test
    fun `wifi changes re-read the SSID and reach the profile manager`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_DISCHARGING)
        every { mockProfileManager.getNeededConditionTypes() } returns setOf(ProfileConstants.CONDITION_WIFI_SSID)
        // start() stops first (clearing the listener with null), so keep the last registration.
        var listener: (() -> Unit)? = null
        every { mockNetworkManager.setWifiStateListener(any()) } answers { listener = firstArg() }
        every { mockNetworkManager.isWifiConnected() } returns false

        monitor.start()
        verify { mockProfileManager.onWifiStateChanged(false, "") }
        assertNotNull(listener)

        every { mockNetworkManager.isWifiConnected() } returns true
        every { mockNetworkManager.readSsidOnce(any()) } answers {
            firstArg<(String) -> Unit>().invoke("HomeNet")
        }
        listener!!.invoke()

        verify { mockProfileManager.onWifiStateChanged(true, "HomeNet") }
    }

    @Test
    fun `the any-wifi condition is pushed without touching the SSID`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_DISCHARGING)
        every { mockProfileManager.getNeededConditionTypes() } returns setOf(ProfileConstants.CONDITION_WIFI_ANY)
        every { mockNetworkManager.isWifiConnected() } returns true

        monitor.start()

        verify { mockProfileManager.onWifiStateChanged(true, "") }
        verify(exactly = 0) { mockNetworkManager.readSsidOnce(any()) }
    }

    @Test
    fun `Location coming back re-reads the network name`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_DISCHARGING)
        every { mockProfileManager.getNeededConditionTypes() } returns setOf(ProfileConstants.CONDITION_WIFI_SSID)
        every { mockNetworkManager.isWifiConnected() } returns true
        var name = ""
        every { mockNetworkManager.readSsidOnce(any()) } answers { firstArg<(String) -> Unit>().invoke(name) }

        monitor.start()
        verify { mockProfileManager.onWifiStateChanged(true, "") }

        name = "HomeNet"
        monitor.onLocationEnabled()

        verify { mockProfileManager.onWifiStateChanged(true, "HomeNet") }
    }

    @Test
    fun `Location coming back reads nothing without a Wi-Fi condition`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_DISCHARGING)

        monitor.start()
        monitor.onLocationEnabled()

        verify(exactly = 0) { mockNetworkManager.readSsidOnce(any()) }
        verify(exactly = 0) { mockProfileManager.onWifiStateChanged(any(), any()) }
    }

    /** Probes can answer out of order. */
    @Test
    fun `a probe result superseded by a newer network change is dropped`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_DISCHARGING)
        every { mockProfileManager.getNeededConditionTypes() } returns setOf(ProfileConstants.CONDITION_WIFI_SSID)
        every { mockNetworkManager.isWifiConnected() } returns true
        var listener: (() -> Unit)? = null
        every { mockNetworkManager.setWifiStateListener(any()) } answers { listener = firstArg() }
        val pending = mutableListOf<(String) -> Unit>()
        every { mockNetworkManager.readSsidOnce(any()) } answers { pending.add(firstArg()) }

        monitor.start()
        listener!!.invoke()
        pending[1]("NewNet")
        pending[0]("OldNet")

        verify(exactly = 1) { mockProfileManager.onWifiStateChanged(true, "NewNet") }
        verify(exactly = 0) { mockProfileManager.onWifiStateChanged(true, "OldNet") }
    }

    @Test
    fun `start does not register the wifi listener without a wifi condition`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_DISCHARGING)

        monitor.start()

        // stop() clears the listener first, so one call total and it is a clear, not a registration.
        verify(exactly = 1) { mockNetworkManager.setWifiStateListener(isNull()) }
        verify(exactly = 0) { mockNetworkManager.setWifiStateListener(isNull(inverse = true)) }
    }

    @Test
    fun `stop clears the wifi listener`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_DISCHARGING)
        every { mockProfileManager.getNeededConditionTypes() } returns setOf(ProfileConstants.CONDITION_WIFI_SSID)

        monitor.start()
        monitor.stop()

        // Once from start()'s stop-first and once from the explicit stop().
        verify(exactly = 2) { mockNetworkManager.setWifiStateListener(isNull()) }
    }

    // ========================================================================
    // Bluetooth condition source
    // ========================================================================

    @Test
    fun `start reports no devices when the phone has no Bluetooth`() {
        every { mockProfileManager.getNeededConditionTypes() } returns setOf(ProfileConstants.CONDITION_BLUETOOTH_DEVICE)
        every { mockContext.getSystemService(Context.BLUETOOTH_SERVICE) } returns null

        monitor.start()

        verify { mockProfileManager.onBluetoothDevicesChanged(emptySet()) }
        assertNull(getField(monitor, "bluetoothReceiver"))
    }

    @Test
    fun `start seeds the devices already connected over A2DP and headset`() {
        val adapter = mockBluetoothAdapter(enabled = true)
        val car = mockBluetoothDevice("aa:bb:cc:dd:ee:ff")
        every { adapter.getProfileProxy(any(), any(), any()) } answers {
            val profile = thirdArg<Int>()
            val devices = if (profile == BluetoothProfile.HEADSET) listOf(car) else emptyList()
            val proxy = mockk<BluetoothProfile> { every { connectedDevices } returns devices }
            secondArg<BluetoothProfile.ServiceListener>().onServiceConnected(profile, proxy)
            true
        }

        monitor.start()

        verify { adapter.getProfileProxy(mockContext, any(), BluetoothProfile.A2DP) }
        verify { adapter.getProfileProxy(mockContext, any(), BluetoothProfile.HEADSET) }
        verify(exactly = 2) { adapter.closeProfileProxy(any(), any()) }
        // Pushed once, after both proxies answered, so a half-read set never deactivates the profile.
        verify(exactly = 1) { mockProfileManager.onBluetoothDevicesChanged(setOf("AA:BB:CC:DD:EE:FF")) }
        verify(exactly = 1) { mockProfileManager.onBluetoothDevicesChanged(any()) }
    }

    @Test
    fun `start still reports when a profile proxy is unavailable`() {
        val adapter = mockBluetoothAdapter(enabled = true)
        every { adapter.getProfileProxy(any(), any(), any()) } returns false

        monitor.start()

        verify(exactly = 1) { mockProfileManager.onBluetoothDevicesChanged(emptySet()) }
    }

    @Test
    fun `proxy results arriving after stop are dropped`() {
        val adapter = mockBluetoothAdapter(enabled = true)
        val listeners = mutableListOf<Pair<Int, BluetoothProfile.ServiceListener>>()
        every { adapter.getProfileProxy(any(), any(), any()) } answers {
            listeners.add(thirdArg<Int>() to secondArg<BluetoothProfile.ServiceListener>())
            true
        }
        monitor.start()
        monitor.stop()

        val proxy = mockk<BluetoothProfile> { every { connectedDevices } returns listOf(mockBluetoothDevice("AA:BB:CC:DD:EE:FF")) }
        listeners.forEach { (profile, listener) -> listener.onServiceConnected(profile, proxy) }

        verify(exactly = 0) { mockProfileManager.onBluetoothDevicesChanged(any()) }
        verify(exactly = 2) { adapter.closeProfileProxy(any(), proxy) }
    }

    @Test
    fun `bluetooth receiver tracks devices connecting and disconnecting`() {
        mockBluetoothAdapter(enabled = false)
        monitor.start()
        val receiver = getField(monitor, "bluetoothReceiver") as BroadcastReceiver

        receiver.onReceive(mockContext, aclIntent(BluetoothDevice.ACTION_ACL_CONNECTED, "aa:bb:cc:dd:ee:ff"))
        verify { mockProfileManager.onBluetoothDevicesChanged(setOf("AA:BB:CC:DD:EE:FF")) }

        receiver.onReceive(mockContext, aclIntent(BluetoothDevice.ACTION_ACL_CONNECTED, "11:22:33:44:55:66"))
        verify { mockProfileManager.onBluetoothDevicesChanged(setOf("AA:BB:CC:DD:EE:FF", "11:22:33:44:55:66")) }

        receiver.onReceive(mockContext, aclIntent(BluetoothDevice.ACTION_ACL_DISCONNECTED, "AA:BB:CC:DD:EE:FF"))
        verify { mockProfileManager.onBluetoothDevicesChanged(setOf("11:22:33:44:55:66")) }
    }

    @Test
    fun `turning Bluetooth off clears every connected device`() {
        mockBluetoothAdapter(enabled = false)
        monitor.start()
        val receiver = getField(monitor, "bluetoothReceiver") as BroadcastReceiver
        receiver.onReceive(mockContext, aclIntent(BluetoothDevice.ACTION_ACL_CONNECTED, "AA:BB:CC:DD:EE:FF"))

        val off = mockk<Intent> {
            every { action } returns BluetoothAdapter.ACTION_STATE_CHANGED
            every { getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR) } returns BluetoothAdapter.STATE_TURNING_OFF
        }
        receiver.onReceive(mockContext, off)

        // Once from the disabled adapter at start, once from the state change.
        verify(exactly = 2) { mockProfileManager.onBluetoothDevicesChanged(emptySet()) }
    }

    @Test
    fun `stop unregisters the bluetooth receiver`() {
        mockBluetoothAdapter(enabled = false)
        monitor.start()
        val receiver = getField(monitor, "bluetoothReceiver") as BroadcastReceiver

        monitor.stop()

        verify { mockContext.unregisterReceiver(receiver) }
        assertNull(getField(monitor, "bluetoothReceiver"))
    }

    @Test
    fun `start does not touch Bluetooth without a Bluetooth condition`() {
        mockBatteryStatus(BatteryManager.BATTERY_STATUS_DISCHARGING)
        monitor.start()

        verify(exactly = 0) { mockContext.getSystemService(Context.BLUETOOTH_SERVICE) }
        assertNull(getField(monitor, "bluetoothReceiver"))
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

        // Nothing was posted to the main looper, because there is no LiveData to remove from.
        verify(exactly = 0) { mockHandler.post(any()) }
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
        setField(spy, "networkManager", mockNetworkManager)
        setField(spy, "profileManager", mockProfileManager)
        setField(spy, "mainHandler", mockHandler)
        setField(spy, "connectedBluetoothAddresses", mutableSetOf<String>())

        // Stub car connection methods — CarConnection cannot be constructed in unit tests
        // because CarConnectionTypeLiveData's static initializer uses Uri.Builder which
        // returns null in the Android test stub environment.
        every { spy["startCarConnectionMonitor"]() } returns Unit
        every { spy["stopCarConnectionMonitor"]() } returns Unit

        return spy
    }

    private fun mockBluetoothAdapter(enabled: Boolean): BluetoothAdapter {
        every { mockProfileManager.getNeededConditionTypes() } returns setOf(ProfileConstants.CONDITION_BLUETOOTH_DEVICE)
        val btAdapter = mockk<BluetoothAdapter>(relaxed = true) {
            every { isEnabled } returns enabled
        }
        val manager = mockk<BluetoothManager> { every { adapter } returns btAdapter }
        every { mockContext.getSystemService(Context.BLUETOOTH_SERVICE) } returns manager
        return btAdapter
    }

    private fun mockBluetoothDevice(address: String) = mockk<BluetoothDevice> {
        every { this@mockk.address } returns address
    }

    private fun aclIntent(action: String, address: String): Intent {
        val device = mockBluetoothDevice(address)
        return mockk {
            every { this@mockk.action } returns action
            @Suppress("DEPRECATION")
            every { getParcelableExtra<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE) } returns device
        }
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
