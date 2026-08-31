package com.Colota.sync

import java.net.InetAddress
import java.net.UnknownHostException
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
    fun `isPrivateEndpoint returns false for unresolvable host`() {
        assertFalse(UrlSafety.isPrivateEndpoint("http://this-host-does-not-exist-xyz.invalid/api"))
    }

    @Test
    fun `isPrivateEndpoint returns false for malformed URL`() {
        assertFalse(UrlSafety.isPrivateEndpoint("not-a-url"))
    }

    // --- private-host resolution ---

    @Test
    fun `localhost is private without consulting the resolver`() {
        assertTrue(UrlSafety.isPrivateHost("localhost") { throw AssertionError("resolver must not be called") })
    }

    @Test
    fun `every check re-resolves, so a host that stops resolving privately stops being trusted`() {
        val host = "nas.moved.test"
        val lan = InetAddress.getByName("192.168.1.50")
        val wan = InetAddress.getByName("93.184.216.34")

        assertTrue(UrlSafety.isPrivateHost(host) { lan })
        assertFalse(UrlSafety.isPrivateHost(host) { wan })
        assertFalse(UrlSafety.isPrivateHost(host) { throw UnknownHostException(it) })
        assertTrue(UrlSafety.isPrivateHost(host) { lan })
    }

    @Test
    fun `a failed lookup does not stick, the next check resolves again`() {
        val host = "nas.blip.test"
        val lan = InetAddress.getByName("192.168.1.50")

        assertFalse(UrlSafety.isPrivateHost(host) { throw UnknownHostException(it) })
        assertTrue(UrlSafety.isPrivateHost(host) { lan })
    }
}
