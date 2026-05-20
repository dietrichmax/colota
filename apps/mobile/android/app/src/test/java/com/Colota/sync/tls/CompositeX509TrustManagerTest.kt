package com.Colota.sync.tls

import io.mockk.*
import org.junit.Assert.*
import org.junit.Test
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.X509TrustManager

/**
 * Pure-logic tests for [CompositeX509TrustManager]. The "any delegate accepts"
 * semantics matter for the user-CA + system-CA layering, so this exercises:
 * - accept-on-first wins
 * - fall-through when an earlier delegate rejects
 * - re-throw of the LAST error when all reject (not the first)
 * - issuer aggregation
 */
class CompositeX509TrustManagerTest {

    private val chain: Array<X509Certificate> = arrayOf(mockk(relaxed = true))
    private val authType = "RSA"

    @Test
    fun `checkServerTrusted returns when first delegate accepts and skips remaining`() {
        val accepting = mockk<X509TrustManager>(relaxed = true)
        val second = mockk<X509TrustManager>(relaxed = true)
        // accepting.checkServerTrusted does not throw (relaxed mock returns Unit)

        CompositeX509TrustManager(listOf(accepting, second))
            .checkServerTrusted(chain, authType)

        verify(exactly = 1) { accepting.checkServerTrusted(chain, authType) }
        verify(exactly = 0) { second.checkServerTrusted(any(), any()) }
    }

    @Test
    fun `checkServerTrusted falls through when first rejects and later accepts`() {
        val rejecting = mockk<X509TrustManager>()
        every { rejecting.checkServerTrusted(any(), any()) } throws CertificateException("system says no")
        val accepting = mockk<X509TrustManager>(relaxed = true)

        // Should not throw
        CompositeX509TrustManager(listOf(rejecting, accepting))
            .checkServerTrusted(chain, authType)

        verify(exactly = 1) { rejecting.checkServerTrusted(any(), any()) }
        verify(exactly = 1) { accepting.checkServerTrusted(any(), any()) }
    }

    @Test
    fun `checkServerTrusted throws the LAST delegate's error when all reject`() {
        val first = mockk<X509TrustManager>()
        every { first.checkServerTrusted(any(), any()) } throws CertificateException("first")
        val second = mockk<X509TrustManager>()
        every { second.checkServerTrusted(any(), any()) } throws CertificateException("last")

        try {
            CompositeX509TrustManager(listOf(first, second)).checkServerTrusted(chain, authType)
            fail("Expected CertificateException")
        } catch (e: CertificateException) {
            assertEquals("last", e.message)
        }
    }

    @Test
    fun `getAcceptedIssuers concatenates issuers from all delegates`() {
        val issuerA = mockk<X509Certificate>(relaxed = true)
        val issuerB = mockk<X509Certificate>(relaxed = true)
        val issuerC = mockk<X509Certificate>(relaxed = true)

        val first = mockk<X509TrustManager>()
        every { first.acceptedIssuers } returns arrayOf(issuerA, issuerB)
        val second = mockk<X509TrustManager>()
        every { second.acceptedIssuers } returns arrayOf(issuerC)

        val accepted = CompositeX509TrustManager(listOf(first, second)).acceptedIssuers

        assertEquals(3, accepted.size)
        assertTrue(accepted.contentEquals(arrayOf(issuerA, issuerB, issuerC)))
    }

    @Test
    fun `checkClientTrusted delegates to the first delegate only`() {
        val first = mockk<X509TrustManager>(relaxed = true)
        val second = mockk<X509TrustManager>(relaxed = true)

        CompositeX509TrustManager(listOf(first, second))
            .checkClientTrusted(chain, authType)

        verify(exactly = 1) { first.checkClientTrusted(chain, authType) }
        verify(exactly = 0) { second.checkClientTrusted(any(), any()) }
    }
}
