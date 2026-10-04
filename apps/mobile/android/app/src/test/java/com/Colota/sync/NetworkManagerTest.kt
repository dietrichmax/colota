package com.Colota.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkRequest
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

        // With returnDefaultValues the mocked Builder chain returns null and every NetworkManager
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
        assertEquals("", manager.currentSsid)

        manager.setSsidTracking(true)
        slot.captured.onCapabilitiesChanged(mockk(relaxed = true), mockk(relaxed = true))
        assertTrue(manager.isConnectedToSsid("HomeNet"))
        assertEquals("HomeNet", manager.currentSsid)
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

    @Test
    fun `the wifi transport callback notifies the listener on availability and loss`() {
        val cm = mockk<ConnectivityManager>(relaxed = true)
        val slot = slot<ConnectivityManager.NetworkCallback>()
        every { cm.registerNetworkCallback(any<NetworkRequest>(), capture(slot)) } just Runs
        val manager = newManagerWith(cm)
        var changes = 0
        manager.setWifiStateListener { changes++ }

        slot.captured.onAvailable(mockk(relaxed = true))

        assertTrue(manager.isWifiConnected())
        assertEquals(1, changes)

        slot.captured.onLost(mockk(relaxed = true))

        assertFalse(manager.isWifiConnected())
        assertEquals(2, changes)
    }

    /** An automatic switch connects the new network before the old one goes. */
    @Test
    fun `a switch between two Wi-Fi networks still notifies`() {
        val cm = mockk<ConnectivityManager>(relaxed = true)
        val slot = slot<ConnectivityManager.NetworkCallback>()
        every { cm.registerNetworkCallback(any<NetworkRequest>(), capture(slot)) } just Runs
        val manager = newManagerWith(cm)
        var changes = 0
        manager.setWifiStateListener { changes++ }

        slot.captured.onAvailable(mockk(relaxed = true))
        slot.captured.onAvailable(mockk(relaxed = true))
        slot.captured.onLost(mockk(relaxed = true))

        assertTrue(manager.isWifiConnected())
        assertEquals(3, changes)
    }

    @Test
    fun `identical capability deliveries do not notify twice`() {
        // Bandwidth and validation updates arrive without any transport or SSID change; each one
        // used to run a full profile evaluation.
        val cm = mockk<ConnectivityManager>(relaxed = true)
        val slot = slot<ConnectivityManager.NetworkCallback>()
        every { cm.registerDefaultNetworkCallback(capture(slot)) } just Runs
        val manager = newManagerWith(cm)
        var changes = 0
        manager.setWifiStateListener { changes++ }

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
        val manager = newManagerWith(cm)
        var changes = 0
        manager.setWifiStateListener { changes++ }

        wifiSlot.captured.onAvailable(mockk(relaxed = true))

        assertTrue(manager.isWifiConnected())
        assertEquals(1, changes)

        val vpnCaps = mockk<NetworkCapabilities>(relaxed = true)
        every { vpnCaps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) } returns true
        every { vpnCaps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) } returns true
        defaultSlot.captured.onCapabilitiesChanged(mockk(relaxed = true), vpnCaps)

        assertTrue(manager.isVpnConnected())
        assertTrue(manager.isWifiConnected())
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
        val manager = NetworkManager(ctx)

        manager.setSsidTracking(true)
        slot.captured.onCapabilitiesChanged(mockk(relaxed = true), mockk(relaxed = true))

        assertEquals("", manager.currentSsid)
        assertFalse(manager.isConnectedToSsid("<unknown ssid>"))
    }

    @Test
    fun `clearing the listener stops notifications`() {
        val cm = mockk<ConnectivityManager>(relaxed = true)
        val slot = slot<ConnectivityManager.NetworkCallback>()
        every { cm.registerNetworkCallback(any<NetworkRequest>(), capture(slot)) } just Runs
        val manager = newManagerWith(cm)
        var changes = 0
        manager.setWifiStateListener { changes++ }
        manager.setWifiStateListener(null)

        slot.captured.onAvailable(mockk(relaxed = true))

        assertEquals(0, changes)
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

    // --- verdicts ---

    @Test
    fun `a status maps to the verdict the sync pass acts on`() {
        assertEquals(BatchResult.Success, verdictFor(204, null))
        assertEquals(BatchResult.RateLimited(30), verdictFor(429, 30))
        assertEquals(BatchResult.ClientError(400), verdictFor(400, null))
        assertEquals(BatchResult.ServerError(503), verdictFor(503, null))
    }

    @Test
    fun `a send that never got a response is a network error`() {
        val result = kotlinx.coroutines.runBlocking { createNetworkManagerViaReflection().sendToEndpoint(JSONObject(), "") }

        assertEquals(BatchResult.NetworkError, result)
    }

    @Test
    fun `Retry-After is read as seconds or as an HTTP date`() {
        val now = java.time.ZonedDateTime.parse(
            "Sat, 19 Sep 2026 12:00:00 GMT", java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME
        ).toInstant().toEpochMilli()

        assertEquals(120L, parseRetryAfter("120", now))
        assertEquals(90L, parseRetryAfter("Sat, 19 Sep 2026 12:01:30 GMT", now))
        assertEquals("a date in the past means now", 0L, parseRetryAfter("Sat, 19 Sep 2026 11:00:00 GMT", now))
        assertNull(parseRetryAfter("soon", now))
        assertNull(parseRetryAfter(null, now))
    }

    @Test
    fun `a rate-limited batch carries the server's Retry-After`() {
        val connection = io.mockk.mockk<java.net.HttpURLConnection>(relaxed = true)
        io.mockk.every { connection.responseCode } returns 429
        io.mockk.every { connection.getHeaderField("Retry-After") } returns "30"
        val method = NetworkManager::class.java.getDeclaredMethod(
            "readBatchResponse", java.net.HttpURLConnection::class.java, Int::class.javaPrimitiveType
        )
        method.isAccessible = true

        assertEquals(BatchResult.RateLimited(30), method.invoke(createNetworkManagerViaReflection(), connection, 50))
    }

    // --- releasing the connection ---

    private fun readBatchResponse(connection: java.net.HttpURLConnection): Any? {
        val method = NetworkManager::class.java.getDeclaredMethod(
            "readBatchResponse", java.net.HttpURLConnection::class.java, Int::class.javaPrimitiveType
        )
        method.isAccessible = true
        return method.invoke(createNetworkManagerViaReflection(), connection, 50)
    }

    // Android keeps a connection whose reply was never closed pooled for minutes, TLS buffers included.
    @Test
    fun `an accepted batch closes the reply it does not read`() {
        val reply = mockk<java.io.InputStream>(relaxed = true)
        val connection = mockk<java.net.HttpURLConnection>(relaxed = true)
        every { connection.responseCode } returns 200
        every { connection.errorStream } returns null
        every { connection.inputStream } returns reply

        assertEquals(BatchResult.Success, readBatchResponse(connection))

        verify(exactly = 1) { reply.close() }
    }

    @Test
    fun `a rate-limited batch closes the error page it does not read`() {
        val page = mockk<java.io.InputStream>(relaxed = true)
        val connection = mockk<java.net.HttpURLConnection>(relaxed = true)
        every { connection.responseCode } returns 429
        every { connection.errorStream } returns page

        readBatchResponse(connection)

        verify(exactly = 1) { page.close() }
    }

    @Test
    fun `a reply that fails to open does not turn an accepted batch into a failure`() {
        val connection = mockk<java.net.HttpURLConnection>(relaxed = true)
        every { connection.responseCode } returns 204
        every { connection.errorStream } returns null
        every { connection.inputStream } throws java.io.IOException("stream closed")

        assertEquals(BatchResult.Success, readBatchResponse(connection))
    }

    private fun readResponse(connection: java.net.HttpURLConnection): TestEndpointResult {
        val method = NetworkManager::class.java.getDeclaredMethod("readResponse", java.net.HttpURLConnection::class.java)
        method.isAccessible = true
        return method.invoke(createNetworkManagerViaReflection(), connection) as TestEndpointResult
    }

    @Test
    fun `an accepted upload closes the reply it does not read`() {
        val reply = mockk<java.io.InputStream>(relaxed = true)
        val connection = mockk<java.net.HttpURLConnection>(relaxed = true)
        every { connection.responseCode } returns 200
        every { connection.errorStream } returns null
        every { connection.inputStream } returns reply

        assertTrue(readResponse(connection).ok)

        verify(exactly = 1) { reply.close() }
    }

    // Android offers no error stream below 400, so a redirect it does not follow has only the plain one.
    @Test
    fun `a redirect that is not followed is a failure whose reply is still closed`() {
        val reply = mockk<java.io.InputStream>(relaxed = true)
        val connection = mockk<java.net.HttpURLConnection>(relaxed = true)
        every { connection.responseCode } returns 307
        every { connection.errorStream } returns null
        every { connection.inputStream } returns reply

        val result = readResponse(connection)

        assertFalse(result.ok)
        assertEquals(307, result.httpStatus)
        verify(exactly = 1) { reply.close() }
    }

    @Test
    fun `a custom Connection header cannot switch connection reuse back on`() {
        val method = NetworkManager::class.java.getDeclaredMethod(
            "buildConnection", java.net.URL::class.java, Boolean::class.javaPrimitiveType, Map::class.java
        )
        method.isAccessible = true

        for (isGet in listOf(false, true)) {
            val connection = method.invoke(
                createNetworkManagerViaReflection(), java.net.URL("http://127.0.0.1:9/"), isGet, mapOf("Connection" to "keep-alive")
            ) as java.net.HttpURLConnection

            assertEquals("close", connection.getRequestProperty("Connection"))
        }
    }

    // Without the header a closed reply is pooled for reuse, and a stale pooled connection fails a streamed POST.
    @Test
    fun `an upload asks the server to close the connection and still counts as sent`() {
        val server = java.net.ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1"))
        val headers = java.util.concurrent.CompletableFuture<List<String>>()
        val serving = Thread {
            try {
                server.accept().use { socket ->
                    val input = socket.getInputStream().bufferedReader(Charsets.ISO_8859_1)
                    val lines = generateSequence { input.readLine() }.takeWhile { it.isNotEmpty() }.toList()
                    val length = lines.first { it.startsWith("Content-Length", ignoreCase = true) }.substringAfter(":").trim().toInt()
                    repeat(length) { input.read() }
                    headers.complete(lines)
                    val body = """{"ok":true}"""
                    socket.getOutputStream().write(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n$body".toByteArray()
                    )
                }
            } catch (e: Exception) {
                headers.completeExceptionally(e)
            }
        }.apply { start() }
        try {
            val caps = mockk<NetworkCapabilities>(relaxed = true)
            every { caps.hasCapability(any()) } returns true
            val cm = mockk<ConnectivityManager>(relaxed = true)
            every { cm.getNetworkCapabilities(any()) } returns caps

            val result = kotlinx.coroutines.runBlocking {
                newManagerWith(cm).sendToEndpoint(JSONObject().put("lat", 1.0), "http://127.0.0.1:${server.localPort}/")
            }

            assertEquals(BatchResult.Success, result)
            val sent = headers.get(5, java.util.concurrent.TimeUnit.SECONDS)
            assertTrue("request headers were $sent", sent.any { it.equals("Connection: close", ignoreCase = true) })
        } finally {
            serving.join(5000)
            server.close()
        }
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
