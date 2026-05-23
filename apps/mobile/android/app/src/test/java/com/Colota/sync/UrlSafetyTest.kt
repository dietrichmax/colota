package com.Colota.sync

import org.junit.Assert.*
import org.junit.Test

class UrlSafetyTest {

    // --- isValidProtocol ---

    @Test
    fun `isValidProtocol accepts https for public host`() {
        assertTrue(UrlSafety.isValidProtocol("https://example.com/api"))
    }

    @Test
    fun `isValidProtocol rejects http for public host`() {
        assertFalse(UrlSafety.isValidProtocol("http://example.com/api"))
    }

    @Test
    fun `isValidProtocol accepts http for localhost`() {
        assertTrue(UrlSafety.isValidProtocol("http://localhost:8080/api"))
    }

    @Test
    fun `isValidProtocol accepts http for 127_0_0_1`() {
        assertTrue(UrlSafety.isValidProtocol("http://127.0.0.1:3000/api"))
    }

    @Test
    fun `isValidProtocol accepts http for 192_168 address`() {
        assertTrue(UrlSafety.isValidProtocol("http://192.168.1.100/api"))
    }

    @Test
    fun `isValidProtocol accepts http for 10_x address`() {
        assertTrue(UrlSafety.isValidProtocol("http://10.0.0.1/api"))
    }

    @Test
    fun `isValidProtocol accepts http for 172_16 range`() {
        assertTrue(UrlSafety.isValidProtocol("http://172.16.0.1/api"))
        assertTrue(UrlSafety.isValidProtocol("http://172.31.255.255/api"))
    }

    @Test
    fun `isValidProtocol rejects http for 172_32 (outside private range)`() {
        assertFalse(UrlSafety.isValidProtocol("http://172.32.0.1/api"))
    }

    @Test
    fun `isValidProtocol accepts http for CGNAT range`() {
        assertTrue(UrlSafety.isValidProtocol("http://100.64.0.1/api"))
        assertTrue(UrlSafety.isValidProtocol("http://100.127.255.255/api"))
    }

    @Test
    fun `isValidProtocol rejects ftp protocol`() {
        assertFalse(UrlSafety.isValidProtocol("ftp://example.com/file"))
    }

    @Test
    fun `isValidProtocol returns false for malformed URL`() {
        assertFalse(UrlSafety.isValidProtocol("not-a-url"))
    }

    @Test
    fun `isValidProtocol returns false for empty string`() {
        assertFalse(UrlSafety.isValidProtocol(""))
    }

    @Test
    fun `isValidProtocol accepts https for any host`() {
        assertTrue(UrlSafety.isValidProtocol("https://192.168.1.1/api"))
        assertTrue(UrlSafety.isValidProtocol("https://localhost/api"))
    }

    // --- isPrivateEndpoint ---

    @Test
    fun `isPrivateEndpoint returns true for private IP endpoint`() {
        assertTrue(UrlSafety.isPrivateEndpoint("http://192.168.1.1/api"))
    }

    @Test
    fun `isPrivateEndpoint returns true for localhost`() {
        assertTrue(UrlSafety.isPrivateEndpoint("http://localhost:8080/api"))
    }

    @Test
    fun `isPrivateEndpoint returns false for public host`() {
        assertFalse(UrlSafety.isPrivateEndpoint("https://example.com/api"))
    }

    @Test
    fun `isPrivateEndpoint returns true for 127_0_0_1`() {
        assertTrue(UrlSafety.isPrivateEndpoint("http://127.0.0.1/api"))
    }

    @Test
    fun `isPrivateEndpoint returns true for 10_x address`() {
        assertTrue(UrlSafety.isPrivateEndpoint("http://10.0.0.1/api"))
        assertTrue(UrlSafety.isPrivateEndpoint("http://10.255.255.255/api"))
    }

    @Test
    fun `isPrivateEndpoint returns true for 172_16 range`() {
        assertTrue(UrlSafety.isPrivateEndpoint("http://172.16.0.1/api"))
        assertTrue(UrlSafety.isPrivateEndpoint("http://172.31.255.255/api"))
    }

    @Test
    fun `isPrivateEndpoint returns true for CGNAT range`() {
        assertTrue(UrlSafety.isPrivateEndpoint("http://100.64.0.1/api"))
        assertTrue(UrlSafety.isPrivateEndpoint("http://100.127.255.255/api"))
    }

    @Test
    fun `isPrivateEndpoint returns true regardless of protocol`() {
        assertTrue(UrlSafety.isPrivateEndpoint("http://192.168.1.1/api"))
        assertTrue(UrlSafety.isPrivateEndpoint("https://192.168.1.1/api"))
        assertTrue(UrlSafety.isPrivateEndpoint("http://localhost/api"))
        assertTrue(UrlSafety.isPrivateEndpoint("https://localhost/api"))
    }

    @Test
    fun `isPrivateEndpoint returns false for public domain`() {
        assertFalse(UrlSafety.isPrivateEndpoint("http://example.com/api"))
        assertFalse(UrlSafety.isPrivateEndpoint("https://example.com/api"))
    }

    @Test
    fun `isPrivateEndpoint resolves hostname via DNS`() {
        // localhost resolves to 127.0.0.1 via InetAddress - proves the DNS path works.
        // Testing hostnames like "server.local" -> 192.168.x.x requires mDNS which
        // is not available in unit tests, but the code path is the same: InetAddress.getByName()
        // -> isSiteLocalAddress. The example.com test below proves public DNS resolution works.
        assertTrue(UrlSafety.isPrivateEndpoint("http://localhost:8080/api"))
    }

    @Test
    fun `isPrivateEndpoint returns false for unresolvable host`() {
        assertFalse(UrlSafety.isPrivateEndpoint("http://this-host-does-not-exist-xyz.invalid/api"))
    }

    @Test
    fun `isPrivateEndpoint returns false for malformed URL`() {
        assertFalse(UrlSafety.isPrivateEndpoint("not-a-url"))
    }
}
