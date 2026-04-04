package com.Colota.sync

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.lang.reflect.Method
import com.Colota.util.AppLogger
import io.mockk.*
import org.junit.After
import org.junit.Before

/**
 * Tests for NetworkManager's pure-logic methods.
 * Network I/O and Android ConnectivityManager are not tested here (require instrumented tests).
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

    // --- isValidProtocol ---

    @Test
    fun `isValidProtocol accepts https for public host`() {
        assertTrue(invokeIsValidProtocol("https://example.com/api"))
    }

    @Test
    fun `isValidProtocol rejects http for public host`() {
        assertFalse(invokeIsValidProtocol("http://example.com/api"))
    }

    @Test
    fun `isValidProtocol accepts http for localhost`() {
        assertTrue(invokeIsValidProtocol("http://localhost:8080/api"))
    }

    @Test
    fun `isValidProtocol accepts http for 127_0_0_1`() {
        assertTrue(invokeIsValidProtocol("http://127.0.0.1:3000/api"))
    }

    @Test
    fun `isValidProtocol accepts http for 192_168 address`() {
        assertTrue(invokeIsValidProtocol("http://192.168.1.100/api"))
    }

    @Test
    fun `isValidProtocol accepts http for 10_x address`() {
        assertTrue(invokeIsValidProtocol("http://10.0.0.1/api"))
    }

    @Test
    fun `isValidProtocol rejects ftp protocol`() {
        assertFalse(invokeIsValidProtocol("ftp://example.com/file"))
    }

    @Test(expected = java.net.MalformedURLException::class)
    fun `isValidProtocol rejects javascript protocol via URL parsing`() {
        // javascript:// is not a valid URL, so URL() throws before we even get to validation
        invokeIsValidProtocol("javascript://example.com")
    }

    @Test
    fun `isValidProtocol accepts https for any host`() {
        assertTrue(invokeIsValidProtocol("https://192.168.1.1/api"))
        assertTrue(invokeIsValidProtocol("https://localhost/api"))
    }

    // --- isPrivateHost ---

    @Test
    fun `isPrivateHost returns true for localhost`() {
        assertTrue(invokeIsPrivateHost("localhost"))
    }

    @Test
    fun `isPrivateHost returns true for 127_0_0_1`() {
        assertTrue(invokeIsPrivateHost("127.0.0.1"))
    }

    @Test
    fun `isPrivateHost returns true for 192_168 address`() {
        assertTrue(invokeIsPrivateHost("192.168.0.1"))
        assertTrue(invokeIsPrivateHost("192.168.255.255"))
    }

    @Test
    fun `isPrivateHost returns true for 10_x address`() {
        assertTrue(invokeIsPrivateHost("10.0.0.1"))
        assertTrue(invokeIsPrivateHost("10.255.255.255"))
    }

    @Test
    fun `isPrivateHost returns true for 172_16 range`() {
        assertTrue(invokeIsPrivateHost("172.16.0.1"))
        assertTrue(invokeIsPrivateHost("172.31.255.255"))
    }

    @Test
    fun `isPrivateHost returns false for public IP`() {
        assertFalse(invokeIsPrivateHost("8.8.8.8"))
    }

    @Test
    fun `isPrivateHost returns false for public domain`() {
        assertFalse(invokeIsPrivateHost("example.com"))
    }

    @Test
    fun `isPrivateHost returns false for unresolvable host`() {
        assertFalse(invokeIsPrivateHost("this-host-does-not-exist-xyz.invalid"))
    }

    // --- maskSensitiveHeaderValue ---

    @Test
    fun `maskSensitiveHeaderValue masks authorization header`() {
        val result = invokeMask("Authorization", "Bearer abcdef12345")
        assertEquals("Bear***", result)
    }

    @Test
    fun `maskSensitiveHeaderValue masks api-key header`() {
        val result = invokeMask("X-Api-Key", "secret12345")
        assertEquals("secr***", result)
    }

    @Test
    fun `maskSensitiveHeaderValue masks token header`() {
        val result = invokeMask("X-Token", "mytoken123")
        assertEquals("myto***", result)
    }

    @Test
    fun `maskSensitiveHeaderValue masks password header`() {
        val result = invokeMask("X-Password", "pass1234")
        assertEquals("pass***", result)
    }

    @Test
    fun `maskSensitiveHeaderValue does not mask non-sensitive header`() {
        val result = invokeMask("Content-Type", "application/json")
        assertEquals("application/json", result)
    }

    @Test
    fun `maskSensitiveHeaderValue masks short value entirely`() {
        val result = invokeMask("Authorization", "ab")
        assertEquals("***", result)
    }

    @Test
    fun `maskSensitiveHeaderValue masks exactly 4 char value entirely`() {
        val result = invokeMask("Authorization", "abcd")
        assertEquals("***", result)
    }

    @Test
    fun `maskSensitiveHeaderValue masks 5 char value with prefix`() {
        val result = invokeMask("Authorization", "abcde")
        assertEquals("abcd***", result)
    }

    @Test
    fun `maskSensitiveHeaderValue is case insensitive for header names`() {
        val result = invokeMask("AUTHORIZATION", "Bearer token123")
        assertEquals("Bear***", result)
    }

    // --- buildTraccarJsonPayload ---

    @Test
    fun `buildTraccarJsonPayload maps lat and lon to coords`() {
        val flat = JSONObject().apply {
            put("lat", 52.12345)
            put("lon", -2.12345)
            put("tst", 1739362800L)
        }
        val result = invokeBuildTraccarJsonPayload(flat)
        val coords = result.getJSONObject("location").getJSONObject("coords")
        assertEquals(52.12345, coords.getDouble("latitude"), 0.0001)
        assertEquals(-2.12345, coords.getDouble("longitude"), 0.0001)
    }

    @Test
    fun `buildTraccarJsonPayload uses id field as device_id`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
            put("id", "my-phone")
        }
        val result = invokeBuildTraccarJsonPayload(flat)
        assertEquals("my-phone", result.getString("device_id"))
    }

    @Test
    fun `buildTraccarJsonPayload falls back to device_id field when id absent`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
            put("device_id", "my-device")
        }
        val result = invokeBuildTraccarJsonPayload(flat)
        assertEquals("my-device", result.getString("device_id"))
    }

    @Test
    fun `buildTraccarJsonPayload defaults device_id to colota`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
        }
        val result = invokeBuildTraccarJsonPayload(flat)
        assertEquals("colota", result.getString("device_id"))
    }

    @Test
    fun `buildTraccarJsonPayload includes optional coords fields when present`() {
        val flat = JSONObject().apply {
            put("lat", 52.0); put("lon", 13.0); put("tst", 1000L)
            put("acc", 15.0)
            put("alt", 380.0)
            put("vel", 5.5)
            put("bear", 90.0)
        }
        val result = invokeBuildTraccarJsonPayload(flat)
        val coords = result.getJSONObject("location").getJSONObject("coords")
        assertEquals(15.0, coords.getDouble("accuracy"), 0.001)
        assertEquals(380.0, coords.getDouble("altitude"), 0.001)
        assertEquals(5.5, coords.getDouble("speed"), 0.001)
        assertEquals(90.0, coords.getDouble("heading"), 0.001)
    }

    @Test
    fun `buildTraccarJsonPayload omits optional coords fields when absent`() {
        val flat = JSONObject().apply {
            put("lat", 52.0); put("lon", 13.0); put("tst", 1000L)
        }
        val result = invokeBuildTraccarJsonPayload(flat)
        val coords = result.getJSONObject("location").getJSONObject("coords")
        assertFalse(coords.has("accuracy"))
        assertFalse(coords.has("altitude"))
        assertFalse(coords.has("speed"))
        assertFalse(coords.has("heading"))
    }

    @Test
    fun `buildTraccarJsonPayload includes battery when batt present`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
            put("batt", 85)
            put("bs", 2) // charging
        }
        val result = invokeBuildTraccarJsonPayload(flat)
        val battery = result.getJSONObject("location").getJSONObject("battery")
        assertEquals(0.85, battery.getDouble("level"), 0.001)
        assertTrue(battery.getBoolean("is_charging"))
    }

    @Test
    fun `buildTraccarJsonPayload omits battery when batt absent`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
        }
        val result = invokeBuildTraccarJsonPayload(flat)
        assertFalse(result.getJSONObject("location").has("battery"))
    }

    @Test
    fun `buildTraccarJsonPayload formats timestamp as ISO 8601`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0)
            put("tst", 1739362800L)
        }
        val result = invokeBuildTraccarJsonPayload(flat)
        val timestamp = result.getJSONObject("location").getString("timestamp")
        assertTrue("Expected ISO 8601 format, got: $timestamp", timestamp.contains("T") && timestamp.endsWith("Z"))
    }

    // --- buildTraccarJsonPayload: battery status codes ---

    @Test
    fun `buildTraccarJsonPayload marks bs=3 full as charging`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
            put("batt", 100); put("bs", 3) // full
        }
        val result = invokeBuildTraccarJsonPayload(flat)
        val battery = result.getJSONObject("location").getJSONObject("battery")
        assertTrue(battery.getBoolean("is_charging"))
        assertEquals(1.0, battery.getDouble("level"), 0.001)
    }

    @Test
    fun `buildTraccarJsonPayload marks bs=1 not charging as not charging`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
            put("batt", 50); put("bs", 1) // not charging
        }
        val result = invokeBuildTraccarJsonPayload(flat)
        val battery = result.getJSONObject("location").getJSONObject("battery")
        assertFalse(battery.getBoolean("is_charging"))
    }

    @Test
    fun `buildTraccarJsonPayload marks bs=0 unknown as not charging`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
            put("batt", 50); put("bs", 0)
        }
        val result = invokeBuildTraccarJsonPayload(flat)
        val battery = result.getJSONObject("location").getJSONObject("battery")
        assertFalse(battery.getBoolean("is_charging"))
    }

    // --- buildTraccarJsonPayload: JSON roundtrip (simulates batch sync path) ---

    @Test
    fun `buildTraccarJsonPayload produces identical output after JSON string roundtrip`() {
        val flat = JSONObject().apply {
            put("id", "my-tracker")
            put("lat", 52.12345)
            put("lon", -2.12345)
            put("acc", 15)
            put("alt", 380)
            put("vel", 5.5)
            put("bear", 90.0)
            put("batt", 85)
            put("bs", 2)
            put("tst", 1739362800L)
        }

        // Direct path (instant sync)
        val directResult = invokeBuildTraccarJsonPayload(flat)

        // Roundtrip path (batch sync: toString -> DB -> JSONObject parse)
        val serialized = flat.toString()
        val roundtripped = JSONObject(serialized)
        val roundtripResult = invokeBuildTraccarJsonPayload(roundtripped)

        // All fields must match
        assertEquals(
            directResult.getString("device_id"),
            roundtripResult.getString("device_id")
        )
        val directCoords = directResult.getJSONObject("location").getJSONObject("coords")
        val roundtripCoords = roundtripResult.getJSONObject("location").getJSONObject("coords")
        assertEquals(directCoords.getDouble("latitude"), roundtripCoords.getDouble("latitude"), 0.00001)
        assertEquals(directCoords.getDouble("longitude"), roundtripCoords.getDouble("longitude"), 0.00001)
        assertEquals(directCoords.getDouble("accuracy"), roundtripCoords.getDouble("accuracy"), 0.001)
        assertEquals(directCoords.getDouble("altitude"), roundtripCoords.getDouble("altitude"), 0.001)
        assertEquals(directCoords.getDouble("speed"), roundtripCoords.getDouble("speed"), 0.001)
        assertEquals(directCoords.getDouble("heading"), roundtripCoords.getDouble("heading"), 0.001)

        val directBatt = directResult.getJSONObject("location").getJSONObject("battery")
        val roundtripBatt = roundtripResult.getJSONObject("location").getJSONObject("battery")
        assertEquals(directBatt.getDouble("level"), roundtripBatt.getDouble("level"), 0.001)
        assertEquals(directBatt.getBoolean("is_charging"), roundtripBatt.getBoolean("is_charging"))

        assertEquals(
            directResult.getJSONObject("location").getString("timestamp"),
            roundtripResult.getJSONObject("location").getString("timestamp")
        )
    }

    @Test
    fun `buildTraccarJsonPayload handles minimal payload after roundtrip`() {
        val flat = JSONObject().apply {
            put("lat", 0.0)
            put("lon", 0.0)
            put("tst", 1000L)
        }

        val roundtripped = JSONObject(flat.toString())
        val result = invokeBuildTraccarJsonPayload(roundtripped)

        assertEquals("colota", result.getString("device_id"))
        val coords = result.getJSONObject("location").getJSONObject("coords")
        assertEquals(0.0, coords.getDouble("latitude"), 0.001)
        assertFalse(coords.has("speed"))
        assertFalse(coords.has("heading"))
        assertFalse(result.getJSONObject("location").has("battery"))
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

    // --- Reflection helpers to access private methods ---

    private fun invokeIsValidProtocol(urlStr: String): Boolean {
        val url = java.net.URL(urlStr)
        val method = NetworkManager::class.java.getDeclaredMethod("isValidProtocol", java.net.URL::class.java)
        method.isAccessible = true
        // Need an instance — create with mocked context
        val manager = createNetworkManagerViaReflection()
        return method.invoke(manager, url) as Boolean
    }

    private fun invokeIsPrivateHost(host: String): Boolean {
        val method = NetworkManager::class.java.getDeclaredMethod("isPrivateHost", String::class.java)
        method.isAccessible = true
        val manager = createNetworkManagerViaReflection()
        return method.invoke(manager, host) as Boolean
    }

    private fun invokeMask(headerName: String, headerValue: String): String {
        val method = NetworkManager::class.java.getDeclaredMethod(
            "maskSensitiveHeaderValue", String::class.java, String::class.java
        )
        method.isAccessible = true
        val manager = createNetworkManagerViaReflection()
        return method.invoke(manager, headerName, headerValue) as String
    }

    private fun invokeBuildTraccarJsonPayload(flat: JSONObject): JSONObject {
        val method = NetworkManager::class.java.getDeclaredMethod("buildTraccarJsonPayload", JSONObject::class.java)
        method.isAccessible = true
        val manager = createNetworkManagerViaReflection()
        return method.invoke(manager, flat) as JSONObject
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
