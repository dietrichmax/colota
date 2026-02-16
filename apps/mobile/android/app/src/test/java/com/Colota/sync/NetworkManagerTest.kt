package com.Colota.sync

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.lang.reflect.Method

/**
 * Tests for NetworkManager's pure-logic methods.
 * Network I/O and Android ConnectivityManager are not tested here (require instrumented tests).
 */
class NetworkManagerTest {

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
