package com.Colota.sync.http

import org.junit.Assert.assertEquals
import org.junit.Test

class RequestBuilderTest {

    @Test
    fun `a custom Connection header cannot switch connection reuse back on`() {
        for (isGet in listOf(false, true)) {
            val connection = RequestBuilder.open(java.net.URL("http://127.0.0.1:9/"), isGet, mapOf("Connection" to "keep-alive")) { null }

            assertEquals("close", connection.getRequestProperty("Connection"))
        }
    }
}
