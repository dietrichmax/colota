package com.Colota.sync.http

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class EndpointUrlTest {

    @Test
    fun `resolveUrlVariables substitutes DATE and TIMESTAMP`() {
        val payload = JSONObject().apply { put("tst", 1775308740L) }
        val result = EndpointUrl.resolveUrlVariables("https://server.com/%DATE/%TIMESTAMP.json", payload)
        assertEquals("https://server.com/2026-04-04/1775308740.json", result)
    }

    @Test
    fun `resolveUrlVariables substitutes YEAR MONTH DAY`() {
        val payload = JSONObject().apply { put("tst", 1775308740L) }
        val result = EndpointUrl.resolveUrlVariables("https://s.com/%YEAR/%MONTH/%DAY/data", payload)
        assertEquals("https://s.com/2026/04/04/data", result)
    }

    @Test
    fun `resolveUrlVariables returns endpoint unchanged when no percent`() {
        val payload = JSONObject().apply { put("tst", 1775308740L) }
        val result = EndpointUrl.resolveUrlVariables("https://server.com/api", payload)
        assertEquals("https://server.com/api", result)
    }
}
