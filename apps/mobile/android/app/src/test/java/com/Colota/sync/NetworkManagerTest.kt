package com.Colota.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import com.Colota.util.AppLogger
import io.mockk.*
import org.junit.After
import org.junit.Before

/**
 * Tests for NetworkManager's pure-logic methods, plus callback registration against a mocked
 * ConnectivityManager. Network I/O still needs instrumented tests.
 */
class NetworkManagerTest {

    @Before
    fun setUp() {
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

    // --- network callback registration ---

    private fun newManagerWith(cm: ConnectivityManager): NetworkManager {
        val ctx = mockk<Context>(relaxed = true)
        every { ctx.getSystemService(Context.CONNECTIVITY_SERVICE) } returns cm
        every { ctx.getSystemService(Context.WIFI_SERVICE) } returns null
        return NetworkManager(ctx)
    }

    @Test
    fun `setSsidTracking swaps the callback in both directions`() {
        val cm = mockk<ConnectivityManager>(relaxed = true)
        val manager = newManagerWith(cm)

        verify(exactly = 1) { cm.registerDefaultNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }
        verify(exactly = 0) { cm.unregisterNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }

        manager.setSsidTracking(true)
        verify(exactly = 1) { cm.unregisterNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }
        verify(exactly = 2) { cm.registerDefaultNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }

        manager.setSsidTracking(false)
        verify(exactly = 2) { cm.unregisterNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }
        verify(exactly = 3) { cm.registerDefaultNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }
    }

    @Test
    fun `setSsidTracking with an unchanged value does not churn the callback`() {
        val cm = mockk<ConnectivityManager>(relaxed = true)
        val manager = newManagerWith(cm)

        manager.setSsidTracking(false)
        manager.setSsidTracking(false)
        verify(exactly = 1) { cm.registerDefaultNetworkCallback(any<ConnectivityManager.NetworkCallback>()) }

        manager.setSsidTracking(true)
        manager.setSsidTracking(true)
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
        val manager = NetworkManager(ctx)

        slot.captured.onCapabilitiesChanged(mockk(relaxed = true), mockk(relaxed = true))
        assertFalse(manager.isConnectedToSsid("HomeNet"))

        manager.setSsidTracking(true)
        slot.captured.onCapabilitiesChanged(mockk(relaxed = true), mockk(relaxed = true))
        assertTrue(manager.isConnectedToSsid("HomeNet"))
    }

    @Test
    fun `the plain callback still tracks VPN state`() {
        val cm = mockk<ConnectivityManager>(relaxed = true)
        val slot = slot<ConnectivityManager.NetworkCallback>()
        every { cm.registerDefaultNetworkCallback(capture(slot)) } just Runs
        val manager = newManagerWith(cm)

        val caps = mockk<NetworkCapabilities>(relaxed = true)
        every { caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) } returns true
        slot.captured.onCapabilitiesChanged(mockk(relaxed = true), caps)

        assertTrue(manager.isVpnConnected())
    }

    // --- buildQueryString ---

    @Test
    fun `buildQueryString builds correct query for simple payload`() {
        val payload = JSONObject().apply {
            put("lat", 52.52)
            put("lon", 13.405)
            put("tst", 1700000000)
        }

        val result = invokeBuildQueryString(payload)

        // Verify each key=value pair is present (order may vary)
        assertTrue(result.contains("lat=52.52"))
        assertTrue(result.contains("lon=13.405"))
        assertTrue(result.contains("tst=1700000000"))
        assertEquals(2, result.count { it == '&' }) // 3 params = 2 ampersands
    }

    @Test
    fun `buildQueryString renders whole-number doubles as integers`() {
        // JS numbers cross the RN bridge as doubles, so a Test Connection unix
        // timestamp serializes as 1.780257432E9. Traccar's OsmAnd endpoint rejects
        // a scientific-notation timestamp and drops the connection without
        // replying (okhttp surfaces this as "unexpected end of stream").
        val payload = JSONObject().apply {
            put("tst", 1780257432.0)
            put("acc", 5.0)
            put("lat", 48.0685105)
        }

        val result = invokeBuildQueryString(payload)

        assertTrue(result.contains("tst=1780257432"))
        assertFalse("scientific notation breaks Traccar's parser", result.contains("1.780257432E9"))
        assertFalse("whole-number doubles must drop the .0", result.contains("acc=5.0"))
        assertTrue("fractional values keep their decimals", result.contains("lat=48.0685105"))
    }

    @Test
    fun `buildQueryString URL-encodes special characters`() {
        val payload = JSONObject().put("name", "hello world&more")

        val result = invokeBuildQueryString(payload)

        assertTrue(result.contains("name=hello+world%26more") || result.contains("name=hello%20world%26more"))
    }

    @Test
    fun `buildQueryString returns empty string for empty payload`() {
        val payload = JSONObject()
        val result = invokeBuildQueryString(payload)
        assertEquals("", result)
    }

    // --- resolveUrlVariables ---

    @Test
    fun `resolveUrlVariables substitutes DATE and TIMESTAMP`() {
        val payload = JSONObject().apply { put("tst", 1775308740L) }
        val manager = createNetworkManagerViaReflection()
        val result = manager.resolveUrlVariables("https://server.com/%DATE/%TIMESTAMP.json", payload)
        assertEquals("https://server.com/2026-04-04/1775308740.json", result)
    }

    @Test
    fun `resolveUrlVariables substitutes YEAR MONTH DAY`() {
        val payload = JSONObject().apply { put("tst", 1775308740L) }
        val manager = createNetworkManagerViaReflection()
        val result = manager.resolveUrlVariables("https://s.com/%YEAR/%MONTH/%DAY/data", payload)
        assertEquals("https://s.com/2026/04/04/data", result)
    }

    @Test
    fun `resolveUrlVariables returns endpoint unchanged when no percent`() {
        val payload = JSONObject().apply { put("tst", 1775308740L) }
        val manager = createNetworkManagerViaReflection()
        val result = manager.resolveUrlVariables("https://server.com/api", payload)
        assertEquals("https://server.com/api", result)
    }

    // --- readErrorBody ---

    /**
     * A rate-limited flush logs one error body per rejected point. Field logs showed ~110 nginx
     * 429 pages in two seconds, 7 lines each, crowding real events out of the rolling log file.
     */
    @Test
    fun `an html error page is logged as a single bounded line`() {
        val nginx429 = """
            <html>
            <head><title>429 Too Many Requests</title></head>
            <body>
            <center><h1>429 Too Many Requests</h1></center>
            <hr><center>nginx</center>
            </body>
            </html>
        """.trimIndent()

        val logged = invokeReadErrorBody(nginx429)

        assertFalse("must not span lines", logged.contains("\n"))
        assertTrue("must stay bounded", logged.length <= 200)
        assertTrue("must keep the useful part", logged.contains("429 Too Many Requests"))
    }

    @Test
    fun `a body longer than the cap is truncated`() {
        val logged = invokeReadErrorBody("x".repeat(5000))

        assertEquals(200, logged.length)
    }

    @Test
    fun `a missing body reports that rather than throwing`() {
        assertEquals("No error body", invokeReadErrorBody(null))
    }

    // --- Reflection helpers to access private methods ---

    // --- testEndpoint ---

    @Test
    fun `testEndpoint invalid URL message goes through the URL mask`() {
        // Plain JUnit has no android.net.Uri, so the mask itself is covered in AppLoggerTest
        every { AppLogger.maskSensitiveUrlValues(any()) } answers { "masked(${firstArg<String>()})" }

        val result = kotlinx.coroutines.runBlocking {
            createNetworkManagerViaReflection().testEndpoint(JSONObject(), "htps://ha.example.com/api/webhook/abc")
        }

        assertFalse(result.ok)
        assertEquals("Invalid URL: masked(htps://ha.example.com/api/webhook/abc)", result.errorMessage)
    }

    private fun invokeReadErrorBody(body: String?): String {
        val connection = io.mockk.mockk<java.net.HttpURLConnection>(relaxed = true)
        io.mockk.every { connection.errorStream } returns body?.byteInputStream()
        val method = NetworkManager::class.java
            .getDeclaredMethod("readErrorBody", java.net.HttpURLConnection::class.java)
        method.isAccessible = true
        return method.invoke(createNetworkManagerViaReflection(), connection) as String
    }


    private fun invokeBuildQueryString(payload: JSONObject): String {
        val method = NetworkManager::class.java.getDeclaredMethod("buildQueryString", JSONObject::class.java)
        method.isAccessible = true
        val manager = createNetworkManagerViaReflection()
        return method.invoke(manager, payload) as String
    }

    private fun createNetworkManagerViaReflection(): NetworkManager {
        val constructor = NetworkManager::class.java.getDeclaredConstructors().first()
        constructor.isAccessible = true
        val context = io.mockk.mockk<android.content.Context>(relaxed = true)
        val connectivityManager = io.mockk.mockk<android.net.ConnectivityManager>(relaxed = true)
        io.mockk.every {
            context.getSystemService(android.content.Context.CONNECTIVITY_SERVICE)
        } returns connectivityManager
        return constructor.newInstance(context) as NetworkManager
    }
}
