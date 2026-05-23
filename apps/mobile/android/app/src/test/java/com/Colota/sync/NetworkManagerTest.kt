package com.Colota.sync

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
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
        val manager = createNetworkManagerViaReflection()
        assertTrue(manager.isValidProtocol("https://example.com/api"))
    }

    @Test
    fun `isValidProtocol rejects http for public host`() {
        val manager = createNetworkManagerViaReflection()
        assertFalse(manager.isValidProtocol("http://example.com/api"))
    }

    @Test
    fun `isValidProtocol accepts http for localhost`() {
        val manager = createNetworkManagerViaReflection()
        assertTrue(manager.isValidProtocol("http://localhost:8080/api"))
    }

    @Test
    fun `isValidProtocol accepts http for 127_0_0_1`() {
        val manager = createNetworkManagerViaReflection()
        assertTrue(manager.isValidProtocol("http://127.0.0.1:3000/api"))
    }

    @Test
    fun `isValidProtocol accepts http for 192_168 address`() {
        val manager = createNetworkManagerViaReflection()
        assertTrue(manager.isValidProtocol("http://192.168.1.100/api"))
    }

    @Test
    fun `isValidProtocol accepts http for 10_x address`() {
        val manager = createNetworkManagerViaReflection()
        assertTrue(manager.isValidProtocol("http://10.0.0.1/api"))
    }

    @Test
    fun `isValidProtocol accepts http for 172_16 range`() {
        val manager = createNetworkManagerViaReflection()
        assertTrue(manager.isValidProtocol("http://172.16.0.1/api"))
        assertTrue(manager.isValidProtocol("http://172.31.255.255/api"))
    }

    @Test
    fun `isValidProtocol rejects http for 172_32 (outside private range)`() {
        val manager = createNetworkManagerViaReflection()
        assertFalse(manager.isValidProtocol("http://172.32.0.1/api"))
    }

    @Test
    fun `isValidProtocol accepts http for CGNAT range`() {
        val manager = createNetworkManagerViaReflection()
        assertTrue(manager.isValidProtocol("http://100.64.0.1/api"))
        assertTrue(manager.isValidProtocol("http://100.127.255.255/api"))
    }

    @Test
    fun `isValidProtocol rejects ftp protocol`() {
        val manager = createNetworkManagerViaReflection()
        assertFalse(manager.isValidProtocol("ftp://example.com/file"))
    }

    @Test
    fun `isValidProtocol returns false for malformed URL`() {
        val manager = createNetworkManagerViaReflection()
        assertFalse(manager.isValidProtocol("not-a-url"))
    }

    @Test
    fun `isValidProtocol returns false for empty string`() {
        val manager = createNetworkManagerViaReflection()
        assertFalse(manager.isValidProtocol(""))
    }

    @Test
    fun `isValidProtocol accepts https for any host`() {
        val manager = createNetworkManagerViaReflection()
        assertTrue(manager.isValidProtocol("https://192.168.1.1/api"))
        assertTrue(manager.isValidProtocol("https://localhost/api"))
    }

    // --- isPrivateEndpoint (public wrapper) ---

    @Test
    fun `isPrivateEndpoint returns true for private IP endpoint`() {
        val manager = createNetworkManagerViaReflection()
        assertTrue(manager.isPrivateEndpoint("http://192.168.1.1/api"))
    }

    @Test
    fun `isPrivateEndpoint returns true for localhost`() {
        val manager = createNetworkManagerViaReflection()
        assertTrue(manager.isPrivateEndpoint("http://localhost:8080/api"))
    }

    @Test
    fun `isPrivateEndpoint returns false for public host`() {
        val manager = createNetworkManagerViaReflection()
        assertFalse(manager.isPrivateEndpoint("https://example.com/api"))
    }

    @Test
    fun `isPrivateEndpoint returns true for 127_0_0_1`() {
        val manager = createNetworkManagerViaReflection()
        assertTrue(manager.isPrivateEndpoint("http://127.0.0.1/api"))
    }

    @Test
    fun `isPrivateEndpoint returns true for 10_x address`() {
        val manager = createNetworkManagerViaReflection()
        assertTrue(manager.isPrivateEndpoint("http://10.0.0.1/api"))
        assertTrue(manager.isPrivateEndpoint("http://10.255.255.255/api"))
    }

    @Test
    fun `isPrivateEndpoint returns true for 172_16 range`() {
        val manager = createNetworkManagerViaReflection()
        assertTrue(manager.isPrivateEndpoint("http://172.16.0.1/api"))
        assertTrue(manager.isPrivateEndpoint("http://172.31.255.255/api"))
    }

    @Test
    fun `isPrivateEndpoint returns true for CGNAT range`() {
        val manager = createNetworkManagerViaReflection()
        assertTrue(manager.isPrivateEndpoint("http://100.64.0.1/api"))
        assertTrue(manager.isPrivateEndpoint("http://100.127.255.255/api"))
    }

    @Test
    fun `isPrivateEndpoint returns true regardless of protocol`() {
        val manager = createNetworkManagerViaReflection()
        assertTrue(manager.isPrivateEndpoint("http://192.168.1.1/api"))
        assertTrue(manager.isPrivateEndpoint("https://192.168.1.1/api"))
        assertTrue(manager.isPrivateEndpoint("http://localhost/api"))
        assertTrue(manager.isPrivateEndpoint("https://localhost/api"))
    }

    @Test
    fun `isPrivateEndpoint returns false for public domain`() {
        val manager = createNetworkManagerViaReflection()
        assertFalse(manager.isPrivateEndpoint("http://example.com/api"))
        assertFalse(manager.isPrivateEndpoint("https://example.com/api"))
    }

    @Test
    fun `isPrivateEndpoint resolves hostname via DNS`() {
        // localhost resolves to 127.0.0.1 via InetAddress - proves the DNS path works.
        // Testing hostnames like "server.local" -> 192.168.x.x requires mDNS which
        // is not available in unit tests, but the code path is the same: InetAddress.getByName()
        // -> isSiteLocalAddress. The example.com test below proves public DNS resolution works.
        val manager = createNetworkManagerViaReflection()
        assertTrue(manager.isPrivateEndpoint("http://localhost:8080/api"))
    }

    @Test
    fun `isPrivateEndpoint returns false for unresolvable host`() {
        val manager = createNetworkManagerViaReflection()
        assertFalse(manager.isPrivateEndpoint("http://this-host-does-not-exist-xyz.invalid/api"))
    }

    @Test
    fun `isPrivateEndpoint returns false for malformed URL`() {
        val manager = createNetworkManagerViaReflection()
        assertFalse(manager.isPrivateEndpoint("not-a-url"))
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

    private fun invokeMask(headerName: String, headerValue: String): String {
        val method = NetworkManager::class.java.getDeclaredMethod(
            "maskSensitiveHeaderValue", String::class.java, String::class.java
        )
        method.isAccessible = true
        val manager = createNetworkManagerViaReflection()
        return method.invoke(manager, headerName, headerValue) as String
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
