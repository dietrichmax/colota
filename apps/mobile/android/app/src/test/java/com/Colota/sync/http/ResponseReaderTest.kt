package com.Colota.sync.http

import android.content.Context
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import com.Colota.util.AppLogger
import io.mockk.*
import org.junit.After
import org.junit.Before

class ResponseReaderTest {

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

        val logged = readErrorBody(nginx429)

        assertFalse("must not span lines", logged.contains("\n"))
        assertTrue("must stay bounded", logged.length <= 200)
        assertTrue("must keep the useful part", logged.contains("429 Too Many Requests"))
    }

    @Test
    fun `a body longer than the cap is truncated`() {
        val logged = readErrorBody("x".repeat(5000))

        assertEquals(200, logged.length)
    }

    @Test
    fun `a missing body reports that rather than throwing`() {
        assertEquals("No error body", readErrorBody(null))
    }

    @Test
    fun `a rate-limited batch carries the server's Retry-After`() {
        val connection = io.mockk.mockk<java.net.HttpURLConnection>(relaxed = true)
        io.mockk.every { connection.responseCode } returns 429
        io.mockk.every { connection.getHeaderField("Retry-After") } returns "30"
        assertEquals(BatchResult.RateLimited(30), ResponseReader.readBatchResponse(connection, 50))
    }

    // Android keeps a connection whose reply was never closed pooled for minutes, TLS buffers included.
    @Test
    fun `an accepted batch closes the reply it does not read`() {
        val reply = mockk<java.io.InputStream>(relaxed = true)
        val connection = mockk<java.net.HttpURLConnection>(relaxed = true)
        every { connection.responseCode } returns 200
        every { connection.errorStream } returns null
        every { connection.inputStream } returns reply

        assertEquals(BatchResult.Success, ResponseReader.readBatchResponse(connection, 50))

        verify(exactly = 1) { reply.close() }
    }

    @Test
    fun `a rate-limited batch closes the error page it does not read`() {
        val page = mockk<java.io.InputStream>(relaxed = true)
        val connection = mockk<java.net.HttpURLConnection>(relaxed = true)
        every { connection.responseCode } returns 429
        every { connection.errorStream } returns page

        ResponseReader.readBatchResponse(connection, 50)

        verify(exactly = 1) { page.close() }
    }

    @Test
    fun `a reply that fails to open does not turn an accepted batch into a failure`() {
        val connection = mockk<java.net.HttpURLConnection>(relaxed = true)
        every { connection.responseCode } returns 204
        every { connection.errorStream } returns null
        every { connection.inputStream } throws java.io.IOException("stream closed")

        assertEquals(BatchResult.Success, ResponseReader.readBatchResponse(connection, 50))
    }

    @Test
    fun `an accepted upload closes the reply it does not read`() {
        val reply = mockk<java.io.InputStream>(relaxed = true)
        val connection = mockk<java.net.HttpURLConnection>(relaxed = true)
        every { connection.responseCode } returns 200
        every { connection.errorStream } returns null
        every { connection.inputStream } returns reply

        assertTrue(ResponseReader.readResponse(connection).ok)

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

        val result = ResponseReader.readResponse(connection)

        assertFalse(result.ok)
        assertEquals(307, result.httpStatus)
        verify(exactly = 1) { reply.close() }
    }

    private fun readErrorBody(body: String?): String {
        val connection = mockk<java.net.HttpURLConnection>(relaxed = true)
        every { connection.errorStream } returns body?.byteInputStream()
        return ResponseReader.readErrorBody(connection)
    }
}
