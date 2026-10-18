package com.Colota.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import org.junit.Assert.*
import org.junit.Test
import com.Colota.util.AppLogger
import io.mockk.*
import org.junit.After
import org.junit.Before

/** Callback registration and state of NetworkMonitor against a mocked ConnectivityManager. */
class NetworkMonitorTest {

    @Before
    fun setUp() {
        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs

        // With returnDefaultValues the mocked Builder chain returns null and every NetworkMonitor
        // construction would NPE. The real request is irrelevant to these tests.
        mockkConstructor(NetworkRequest.Builder::class)
        every { anyConstructed<NetworkRequest.Builder>().addTransportType(any()) } returns mockk(relaxed = true)
        every { anyConstructed<NetworkRequest.Builder>().build() } returns mockk(relaxed = true)
    }

    @After
    fun tearDown() {
        unmockkConstructor(NetworkRequest.Builder::class)
        unmockkObject(AppLogger)
    }

    // --- network callback registration ---

    private fun newMonitorWith(cm: ConnectivityManager): NetworkMonitor {
        val ctx = mockk<Context>(relaxed = true)
        every { ctx.getSystemService(Context.CONNECTIVITY_SERVICE) } returns cm
        every { ctx.getSystemService(Context.WIFI_SERVICE) } returns null
        return NetworkMonitor(ctx)
    }

    @Test
    fun `setSsidTracking swaps the callback in both directions`() {
        val cm = mockk<ConnectivityManager>(relaxed = true)
        val monitor = newMonitorWith(cm)

        verify(exactly = 1) { cm.registerDefaultNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }
        verify(exactly = 0) { cm.unregisterNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }

        monitor.setSsidTracking(true)
        verify(exactly = 1) { cm.unregisterNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }
        verify(exactly = 2) { cm.registerDefaultNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }

        monitor.setSsidTracking(false)
        verify(exactly = 2) { cm.unregisterNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }
        verify(exactly = 3) { cm.registerDefaultNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }
    }

    @Test
    fun `setSsidTracking with an unchanged value does not churn the callback`() {
        val cm = mockk<ConnectivityManager>(relaxed = true)
        val monitor = newMonitorWith(cm)

        monitor.setSsidTracking(false)
        monitor.setSsidTracking(false)
        verify(exactly = 1) { cm.registerDefaultNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }

        monitor.setSsidTracking(true)
        monitor.setSsidTracking(true)
        verify(exactly = 2) { cm.registerDefaultNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }
    }

    @Test
    fun `the SSID is only read while tracking is on`() {
        val cm = mockk<ConnectivityManager>(relaxed = true)
        val slot = slot<ConnectivityManager.NetworkCallback>()
        every { cm.registerDefaultNetworkCallback(capture(slot)) } just Runs
        val info = mockk<WifiInfo>(relaxed = true)
        every { info.ssid } returns "\"HomeNet\""
        val wifi = mockk<WifiManager>(relaxed = true)
        every { wifi.connectionInfo } returns info
        val ctx = mockk<Context>(relaxed = true)
        every { ctx.getSystemService(Context.CONNECTIVITY_SERVICE) } returns cm
        every { ctx.getSystemService(Context.WIFI_SERVICE) } returns wifi
        val monitor = NetworkMonitor(ctx)

        slot.captured.onCapabilitiesChanged(mockk(relaxed = true), mockk(relaxed = true))
        assertFalse(monitor.isConnectedToSsid("HomeNet"))
        assertEquals("", monitor.currentSsid)

        monitor.setSsidTracking(true)
        slot.captured.onCapabilitiesChanged(mockk(relaxed = true), mockk(relaxed = true))
        assertTrue(monitor.isConnectedToSsid("HomeNet"))
        assertEquals("HomeNet", monitor.currentSsid)
    }

    @Test
    fun `the plain callback still tracks VPN state`() {
        val cm = mockk<ConnectivityManager>(relaxed = true)
        val slot = slot<ConnectivityManager.NetworkCallback>()
        every { cm.registerDefaultNetworkCallback(capture(slot)) } just Runs
        val monitor = newMonitorWith(cm)

        val caps = mockk<NetworkCapabilities>(relaxed = true)
        every { caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) } returns true
        slot.captured.onCapabilitiesChanged(mockk(relaxed = true), caps)

        assertTrue(monitor.isVpnConnected())
    }

    @Test
    fun `the wifi transport callback notifies the listener on availability and loss`() {
        val cm = mockk<ConnectivityManager>(relaxed = true)
        val slot = slot<ConnectivityManager.NetworkCallback>()
        every { cm.registerNetworkCallback(any<NetworkRequest>(), capture(slot)) } just Runs
        val monitor = newMonitorWith(cm)
        var changes = 0
        monitor.setWifiStateListener { changes++ }

        slot.captured.onAvailable(mockk(relaxed = true))

        assertTrue(monitor.isWifiConnected())
        assertEquals(1, changes)

        slot.captured.onLost(mockk(relaxed = true))

        assertFalse(monitor.isWifiConnected())
        assertEquals(2, changes)
    }

    /** An automatic switch connects the new network before the old one goes. */
    @Test
    fun `a switch between two Wi-Fi networks still notifies`() {
        val cm = mockk<ConnectivityManager>(relaxed = true)
        val slot = slot<ConnectivityManager.NetworkCallback>()
        every { cm.registerNetworkCallback(any<NetworkRequest>(), capture(slot)) } just Runs
        val monitor = newMonitorWith(cm)
        var changes = 0
        monitor.setWifiStateListener { changes++ }

        slot.captured.onAvailable(mockk(relaxed = true))
        slot.captured.onAvailable(mockk(relaxed = true))
        slot.captured.onLost(mockk(relaxed = true))

        assertTrue(monitor.isWifiConnected())
        assertEquals(3, changes)
    }

    @Test
    fun `identical capability deliveries do not notify twice`() {
        // Bandwidth and validation updates arrive without any transport or SSID change; each one
        // used to run a full profile evaluation.
        val cm = mockk<ConnectivityManager>(relaxed = true)
        val slot = slot<ConnectivityManager.NetworkCallback>()
        every { cm.registerDefaultNetworkCallback(capture(slot)) } just Runs
        val monitor = newMonitorWith(cm)
        var changes = 0
        monitor.setWifiStateListener { changes++ }

        val caps = mockk<NetworkCapabilities>(relaxed = true)
        every { caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) } returns true
        slot.captured.onCapabilitiesChanged(mockk(relaxed = true), caps)
        slot.captured.onCapabilitiesChanged(mockk(relaxed = true), caps)
        slot.captured.onCapabilitiesChanged(mockk(relaxed = true), caps)

        assertEquals(1, changes)
    }

    @Test
    fun `a VPN default network does not hide an available Wi-Fi network`() {
        // The VPN network reports the underlying transports on Android 14+, but the app's Wi-Fi
        // transport callback sees the Wi-Fi network regardless of which network is the default.
        val cm = mockk<ConnectivityManager>(relaxed = true)
        val defaultSlot = slot<ConnectivityManager.NetworkCallback>()
        every { cm.registerDefaultNetworkCallback(capture(defaultSlot)) } just Runs
        val wifiSlot = slot<ConnectivityManager.NetworkCallback>()
        every { cm.registerNetworkCallback(any<NetworkRequest>(), capture(wifiSlot)) } just Runs
        val monitor = newMonitorWith(cm)
        var changes = 0
        monitor.setWifiStateListener { changes++ }

        wifiSlot.captured.onAvailable(mockk(relaxed = true))

        assertTrue(monitor.isWifiConnected())
        assertEquals(1, changes)

        val vpnCaps = mockk<NetworkCapabilities>(relaxed = true)
        every { vpnCaps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) } returns true
        every { vpnCaps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) } returns true
        defaultSlot.captured.onCapabilitiesChanged(mockk(relaxed = true), vpnCaps)

        assertTrue(monitor.isVpnConnected())
        assertTrue(monitor.isWifiConnected())
        assertEquals(2, changes)
    }

    @Test
    fun `the unknown SSID placeholder reads as no name`() {
        // Android returns "<unknown ssid>" without location permission or with Location off; that
        // must not be saved as a network name or matched against one.
        val cm = mockk<ConnectivityManager>(relaxed = true)
        val slot = slot<ConnectivityManager.NetworkCallback>()
        every { cm.registerDefaultNetworkCallback(capture(slot)) } just Runs
        val info = mockk<WifiInfo>(relaxed = true)
        every { info.ssid } returns "\"<unknown ssid>\""
        val wifi = mockk<WifiManager>(relaxed = true)
        every { wifi.connectionInfo } returns info
        val ctx = mockk<Context>(relaxed = true)
        every { ctx.getSystemService(Context.CONNECTIVITY_SERVICE) } returns cm
        every { ctx.getSystemService(Context.WIFI_SERVICE) } returns wifi
        val monitor = NetworkMonitor(ctx)

        monitor.setSsidTracking(true)
        slot.captured.onCapabilitiesChanged(mockk(relaxed = true), mockk(relaxed = true))

        assertEquals("", monitor.currentSsid)
        assertFalse(monitor.isConnectedToSsid("<unknown ssid>"))
    }

    @Test
    fun `clearing the listener stops notifications`() {
        val cm = mockk<ConnectivityManager>(relaxed = true)
        val slot = slot<ConnectivityManager.NetworkCallback>()
        every { cm.registerNetworkCallback(any<NetworkRequest>(), capture(slot)) } just Runs
        val monitor = newMonitorWith(cm)
        var changes = 0
        monitor.setWifiStateListener { changes++ }
        monitor.setWifiStateListener(null)

        slot.captured.onAvailable(mockk(relaxed = true))

        assertEquals(0, changes)
    }
}
