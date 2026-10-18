package com.Colota.sync.http

import android.content.Context
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import com.Colota.util.AppLogger
import io.mockk.*
import org.junit.After
import org.junit.Before
import com.Colota.network.NetworkMonitor

/** Tests for NetworkManager's request flow. Pool behaviour needs a device. */
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

    // --- testEndpoint ---

    @Test
    fun `testEndpoint invalid URL message goes through the URL mask`() {
        // Plain JUnit has no android.net.Uri, so the mask itself is covered in AppLoggerTest
        every { AppLogger.maskSensitiveUrlValues(any()) } answers { "masked(${firstArg<String>()})" }

        val result = kotlinx.coroutines.runBlocking {
            newManager().testEndpoint(JSONObject(), "htps://ha.example.com/api/webhook/abc")
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
        val result = kotlinx.coroutines.runBlocking { newManager().sendToEndpoint(JSONObject(), "") }

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
            val monitor = mockk<NetworkMonitor>()
            every { monitor.isNetworkAvailable() } returns true

            val result = kotlinx.coroutines.runBlocking {
                NetworkManager(mockk<Context>(relaxed = true), monitor).sendToEndpoint(JSONObject().put("lat", 1.0), "http://127.0.0.1:${server.localPort}/")
            }

            assertEquals(BatchResult.Success, result)
            val sent = headers.get(5, java.util.concurrent.TimeUnit.SECONDS)
            assertTrue("request headers were $sent", sent.any { it.equals("Connection: close", ignoreCase = true) })
        } finally {
            serving.join(5000)
            server.close()
        }
    }

    private fun newManager(): NetworkManager {
        return NetworkManager(mockk<Context>(relaxed = true), mockk<NetworkMonitor>(relaxed = true))
    }
}
