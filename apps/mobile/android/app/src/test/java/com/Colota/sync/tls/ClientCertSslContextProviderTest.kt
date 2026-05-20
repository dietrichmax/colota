package com.Colota.sync.tls

import com.Colota.util.AppLogger
import io.mockk.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Tests static helpers on [ClientCertSslContextProvider].
 *
 * The instance methods ([get], [invalidate]) depend on a real Android Context
 * for [SecureStorageHelper], so they're exercised via the bridge integration
 * tests rather than here. The AndroidKeyStore-backed paths likewise need a
 * real Android runtime - covered via the test stack rather than unit tests.
 */
class ClientCertSslContextProviderTest {

    @Before
    fun setUp() {
        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs
    }

    @After
    fun tearDown() = unmockkObject(AppLogger)

    @Test
    fun `parseCaInfo extracts subject and issuer from a PEM-encoded self-signed CA`() {
        val info = ClientCertSslContextProvider.parseCaInfo(VALID_CA_PEM_BYTES)
        assertTrue("Subject was: ${info.subject}", info.subject.contains("colota-test-ca"))
        // Self-signed - issuer matches subject
        assertEquals(info.subject, info.issuer)
        assertTrue("Expected notAfter in future", info.notAfter > System.currentTimeMillis())
    }

    @Test
    fun `buildTrustManagers returns a CompositeX509TrustManager backed by user CA + system`() {
        val tms = ClientCertSslContextProvider.buildTrustManagers(VALID_CA_PEM_BYTES)
        assertEquals(1, tms.size)
        val composite = tms[0]
        assertTrue(composite is CompositeX509TrustManager)
        // Composite includes BOTH user CA and system roots. System trust store
        // has many CAs (DigiCert, ISRG Root, etc.); test fixture adds 1.
        val accepted = (composite as CompositeX509TrustManager).acceptedIssuers
        assertTrue("Expected >1 accepted issuer (user CA + system roots), got ${accepted.size}", accepted.size > 1)
        // User CA subject must be in the accepted list
        assertTrue(
            "Test CA not in accepted issuers",
            accepted.any { it.subjectDN.name.contains("colota-test-ca") }
        )
    }

    companion object {
        /**
         * Self-signed CA PEM, 100-year validity, generated via:
         *   openssl genrsa -out ca.key 2048
         *   openssl req -x509 -new -key ca.key -days 36500 -out ca.crt \
         *     -subj "/CN=colota-test-ca/O=Colota Tests"
         *
         * CertificateFactory accepts both PEM and DER; here we exercise PEM.
         */
        val VALID_CA_PEM_BYTES: ByteArray = (
            "-----BEGIN CERTIFICATE-----\n" +
                "MIIDQzCCAiugAwIBAgIUebnL5/SjKZy8pumffhaPHVy2shkwDQYJKoZIhvcNAQEL\n" +
                "BQAwMDEXMBUGA1UEAwwOY29sb3RhLXRlc3QtY2ExFTATBgNVBAoMDENvbG90YSBU\n" +
                "ZXN0czAgFw0yNjA1MTkxMDEwMzFaGA8yMTI2MDQyNTEwMTAzMVowMDEXMBUGA1UE\n" +
                "AwwOY29sb3RhLXRlc3QtY2ExFTATBgNVBAoMDENvbG90YSBUZXN0czCCASIwDQYJ\n" +
                "KoZIhvcNAQEBBQADggEPADCCAQoCggEBALyRH2cUiHIqqcE1mQO/9BxlrAk/ntr3\n" +
                "G/J3tGpinTS6LZfVqe53j5cRwMWzApHXjfYMbQ6YiGvY2bu3CyQMgZtzG1w1JG2H\n" +
                "fDW7jJlLMzgGsKiQh3R01vus6KLQZySSoqJ/s8K7EwwgFQ6ygMvbXv1IeUk9wUyl\n" +
                "+gTiEdFcPB8J5k0sT6Syab8Ykjaj+m2D/BwkwdxyjOXc498ehNbcladn1ZqwrwOL\n" +
                "ht4g/+qy0VXjQkKPDtld302xCf1bE1ryt8LD/MgVmWutZbjtvtxclEFPlxF6QNk2\n" +
                "VoriulO2DZYEJm0PGv3vIoWijmM9vEjzl5/p0kKd1izuilzSLYbCyG8CAwEAAaNT\n" +
                "MFEwHQYDVR0OBBYEFEXdqd97LSttahNgIXLymzeWgj0FMB8GA1UdIwQYMBaAFEXd\n" +
                "qd97LSttahNgIXLymzeWgj0FMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQEL\n" +
                "BQADggEBAFQPPvUSnCIT5f7U/4UczRufwJ7iSYFosBW45NpyPI/hgTafM/Han7qh\n" +
                "N5umCfriNsLbQD+WFf1SgS0tNBWJHHKXZb2/i6coXk74KEIYRXoIaN8j+eWJ65hC\n" +
                "HNdcu2SMXIritxrMFgmoE4tVKRdnYZbS+BNdsuzIqFPBuZ/ebu7pv7BU2lChqYkK\n" +
                "4myHDB9LSJMIauWnGqSd4Il2jtx4S2riNE7Tylja9FxdDyKtKrP4ZnRH4FB9sdth\n" +
                "+7i6xIJdzNB6rOl+09/s2JH7NPDgP80fcx5Zq/qvXg+YrMPJsGIpiOAosJOpPwKI\n" +
                "yBJziS89XwtAI6MZEfj1ajNj9Zid4SY=\n" +
                "-----END CERTIFICATE-----\n"
            ).toByteArray()
    }
}
