package com.Colota.service

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import com.Colota.util.AppLogger
import io.mockk.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/** The stubbed android.jar reports SDK 0, so the receiver registers without the exported flag here. */
class BluetoothDeviceMonitorTest {

    private lateinit var context: Context
    private val pushes = mutableListOf<Set<String>>()
    private val receiver = slot<BroadcastReceiver>()
    private lateinit var monitor: BluetoothDeviceMonitor

    @Before
    fun setUp() {
        context = mockk(relaxed = true)
        every { context.registerReceiver(capture(receiver), any<IntentFilter>()) } returns null
        pushes.clear()
        monitor = BluetoothDeviceMonitor(context) { pushes.add(it) }

        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
    }

    private fun adapter(enabled: Boolean): BluetoothAdapter {
        val btAdapter = mockk<BluetoothAdapter>(relaxed = true) { every { isEnabled } returns enabled }
        val manager = mockk<BluetoothManager> { every { adapter } returns btAdapter }
        every { context.getSystemService(Context.BLUETOOTH_SERVICE) } returns manager
        return btAdapter
    }

    private fun device(address: String) = mockk<BluetoothDevice> { every { this@mockk.address } returns address }

    private fun aclIntent(action: String, address: String): Intent {
        val device = device(address)
        return mockk {
            every { this@mockk.action } returns action
            @Suppress("DEPRECATION")
            every { getParcelableExtra<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE) } returns device
        }
    }

    @Test
    fun `a phone without Bluetooth reports no devices and listens for none`() {
        every { context.getSystemService(Context.BLUETOOTH_SERVICE) } returns null

        monitor.start()

        assertEquals(listOf(emptySet<String>()), pushes)
        assertFalse(receiver.isCaptured)
    }

    @Test
    fun `start seeds the devices already connected over A2DP and headset`() {
        val adapter = adapter(enabled = true)
        val car = device("aa:bb:cc:dd:ee:ff")
        every { adapter.getProfileProxy(any(), any(), any()) } answers {
            val profile = thirdArg<Int>()
            val devices = if (profile == BluetoothProfile.HEADSET) listOf(car) else emptyList()
            val proxy = mockk<BluetoothProfile> { every { connectedDevices } returns devices }
            secondArg<BluetoothProfile.ServiceListener>().onServiceConnected(profile, proxy)
            true
        }

        monitor.start()

        verify { adapter.getProfileProxy(context, any(), BluetoothProfile.A2DP) }
        verify { adapter.getProfileProxy(context, any(), BluetoothProfile.HEADSET) }
        verify(exactly = 2) { adapter.closeProfileProxy(any(), any()) }
        // Pushed once, after both proxies answered, so a half-read set never deactivates the profile.
        assertEquals(listOf(setOf("AA:BB:CC:DD:EE:FF")), pushes)
    }

    @Test
    fun `start still reports when a profile proxy is unavailable`() {
        val adapter = adapter(enabled = true)
        every { adapter.getProfileProxy(any(), any(), any()) } returns false

        monitor.start()

        assertEquals(listOf(emptySet<String>()), pushes)
    }

    @Test
    fun `proxy results arriving after stop are dropped`() {
        val adapter = adapter(enabled = true)
        val listeners = mutableListOf<Pair<Int, BluetoothProfile.ServiceListener>>()
        every { adapter.getProfileProxy(any(), any(), any()) } answers {
            listeners.add(thirdArg<Int>() to secondArg<BluetoothProfile.ServiceListener>())
            true
        }
        monitor.start()
        monitor.stop()

        val proxy = mockk<BluetoothProfile> { every { connectedDevices } returns listOf(device("AA:BB:CC:DD:EE:FF")) }
        listeners.forEach { (profile, listener) -> listener.onServiceConnected(profile, proxy) }

        assertTrue(pushes.isEmpty())
        verify(exactly = 2) { adapter.closeProfileProxy(any(), proxy) }
    }

    @Test
    fun `the receiver tracks devices connecting and disconnecting`() {
        adapter(enabled = false)
        monitor.start()

        receiver.captured.onReceive(context, aclIntent(BluetoothDevice.ACTION_ACL_CONNECTED, "aa:bb:cc:dd:ee:ff"))
        receiver.captured.onReceive(context, aclIntent(BluetoothDevice.ACTION_ACL_CONNECTED, "11:22:33:44:55:66"))
        receiver.captured.onReceive(context, aclIntent(BluetoothDevice.ACTION_ACL_DISCONNECTED, "AA:BB:CC:DD:EE:FF"))

        assertEquals(
            listOf(emptySet(), setOf("AA:BB:CC:DD:EE:FF"), setOf("AA:BB:CC:DD:EE:FF", "11:22:33:44:55:66"), setOf("11:22:33:44:55:66")),
            pushes
        )
    }

    @Test
    fun `turning Bluetooth off clears every connected device`() {
        adapter(enabled = false)
        monitor.start()
        receiver.captured.onReceive(context, aclIntent(BluetoothDevice.ACTION_ACL_CONNECTED, "AA:BB:CC:DD:EE:FF"))

        val off = mockk<Intent> {
            every { action } returns BluetoothAdapter.ACTION_STATE_CHANGED
            every { getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR) } returns BluetoothAdapter.STATE_TURNING_OFF
        }
        receiver.captured.onReceive(context, off)

        assertEquals(emptySet<String>(), pushes.last())
    }

    @Test
    fun `stop unregisters the receiver`() {
        adapter(enabled = false)
        monitor.start()

        monitor.stop()

        verify { context.unregisterReceiver(receiver.captured) }
    }
}
