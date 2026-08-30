package com.Colota.util

import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class AppLoggerTest {

    @Test
    fun `maskSensitiveHeaderValue masks authorization header`() {
        assertEquals("Bear***", AppLogger.maskSensitiveHeaderValue("Authorization", "Bearer abcdef12345"))
    }

    @Test
    fun `maskSensitiveHeaderValue masks api-key header`() {
        assertEquals("secr***", AppLogger.maskSensitiveHeaderValue("X-Api-Key", "secret12345"))
    }

    @Test
    fun `maskSensitiveHeaderValue masks token header`() {
        assertEquals("myto***", AppLogger.maskSensitiveHeaderValue("X-Token", "mytoken123"))
    }

    @Test
    fun `maskSensitiveHeaderValue masks password header`() {
        assertEquals("pass***", AppLogger.maskSensitiveHeaderValue("X-Password", "pass1234"))
    }

    @Test
    fun `maskSensitiveHeaderValue does not mask non-sensitive header`() {
        assertEquals("application/json", AppLogger.maskSensitiveHeaderValue("Content-Type", "application/json"))
    }

    @Test
    fun `maskSensitiveHeaderValue masks short value entirely`() {
        assertEquals("***", AppLogger.maskSensitiveHeaderValue("Authorization", "ab"))
    }

    @Test
    fun `maskSensitiveHeaderValue masks exactly 4 char value entirely`() {
        assertEquals("***", AppLogger.maskSensitiveHeaderValue("Authorization", "abcd"))
    }

    @Test
    fun `maskSensitiveHeaderValue masks 5 char value with prefix`() {
        assertEquals("abcd***", AppLogger.maskSensitiveHeaderValue("Authorization", "abcde"))
    }

    @Test
    fun `maskSensitiveHeaderValue is case insensitive for header names`() {
        assertEquals("Bear***", AppLogger.maskSensitiveHeaderValue("AUTHORIZATION", "Bearer token123"))
    }

    @Test
    fun `maskSensitiveUrlValues masks api_key query parameter`() {
        val masked = AppLogger.maskSensitiveUrlValues("https://example.com/data?api_key=secret123")
        assertEquals("https://example.com/data?api_key=secr***", masked)
    }

    @Test
    fun `maskSensitiveUrlValues masks apikey variant without separator`() {
        val masked = AppLogger.maskSensitiveUrlValues("https://example.com/data?apikey=abcdef")
        assertEquals("https://example.com/data?apikey=abcd***", masked)
    }

    @Test
    fun `maskSensitiveUrlValues masks access_token`() {
        val masked = AppLogger.maskSensitiveUrlValues("https://example.com/x?access_token=xyz12345")
        assertEquals("https://example.com/x?access_token=xyz1***", masked)
    }

    @Test
    fun `maskSensitiveUrlValues preserves non-sensitive params`() {
        val masked = AppLogger.maskSensitiveUrlValues("https://example.com/x?lat=1.23&lon=4.56")
        assertEquals("https://example.com/x?lat=1.23&lon=4.56", masked)
    }

    @Test
    fun `maskSensitiveUrlValues masks only the sensitive param when mixed`() {
        val masked = AppLogger.maskSensitiveUrlValues("https://example.com/x?lat=1.23&token=secret123&lon=4.56")
        assertTrue(masked.contains("lat=1.23"))
        assertTrue(masked.contains("lon=4.56"))
        assertTrue(masked.contains("token=secr***"))
        assertFalse(masked.contains("secret123"))
    }

    @Test
    fun `maskSensitiveUrlValues returns input unchanged when no query string`() {
        val url = "https://example.com/data"
        assertEquals(url, AppLogger.maskSensitiveUrlValues(url))
    }

    @Test
    fun `maskSensitiveUrlValues handles short sensitive value`() {
        val masked = AppLogger.maskSensitiveUrlValues("https://example.com/x?token=ab")
        assertEquals("https://example.com/x?token=***", masked)
    }

    @Test
    fun `maskSensitiveUrlValues is case insensitive for query param names`() {
        val masked = AppLogger.maskSensitiveUrlValues("https://example.com/x?API_KEY=secret123")
        assertEquals("https://example.com/x?API_KEY=secr***", masked)
    }

    @Test
    fun `maskSensitiveUrlValues returns input unchanged when URL is malformed`() {
        val malformed = "not a url at all"
        assertEquals(malformed, AppLogger.maskSensitiveUrlValues(malformed))
    }

    @Test
    fun `maskSensitiveUrlValues does not mask author or authority`() {
        val url = "https://example.com/x?author=jdoe&authority=high"
        assertEquals(url, AppLogger.maskSensitiveUrlValues(url))
    }

    @Test
    fun `maskSensitiveUrlValues masks bare auth param`() {
        val masked = AppLogger.maskSensitiveUrlValues("https://example.com/x?auth=abcdefgh")
        assertEquals("https://example.com/x?auth=abcd***", masked)
    }

    @Test
    fun `maskSensitiveUrlValues masks a webhook id in the path`() {
        val masked = AppLogger.maskSensitiveUrlValues(
            "https://ha.example.com/api/webhook/3f9a1c2b7d4e5f6a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a"
        )
        assertEquals("https://ha.example.com/api/webhook/3f9a***", masked)
    }

    @Test
    fun `maskSensitiveUrlValues masks a session token but keeps the device name`() {
        val masked = AppLogger.maskSensitiveUrlValues(
            "https://cloud.example.com/apps/phonetrack/log/owntracks/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/pixel"
        )
        assertEquals("https://cloud.example.com/apps/phonetrack/log/owntracks/a1b2***/pixel", masked)
    }

    @Test
    fun `maskSensitiveUrlValues keeps route words and dates`() {
        val url = "https://example.com/api/v1/owntracks/points/2026/08/29"
        assertEquals(url, AppLogger.maskSensitiveUrlValues(url))
    }

    @Test
    fun `maskSensitiveUrlValues masks a letters-only id because a missed secret costs more than a masked word`() {
        val masked = AppLogger.maskSensitiveUrlValues("https://ha.example.com/api/webhook/my-personal-webhook-id")
        assertEquals("https://ha.example.com/api/webhook/my-p***", masked)
    }

    @Test
    fun `maskSensitiveUrlValues masks from 16 characters`() {
        val kept = "https://example.com/abcdefghijklmno"
        assertEquals(kept, AppLogger.maskSensitiveUrlValues(kept))
        assertEquals("https://example.com/abcd***", AppLogger.maskSensitiveUrlValues("https://example.com/abcdefghijklmnop"))
    }

    @Test
    fun `maskSensitiveUrlValues keeps unresolved URL variables`() {
        val url = "https://example.com/locations/%YEAR/%MONTH/%DAY?id=my-phone"
        assertEquals(url, AppLogger.maskSensitiveUrlValues(url))
    }

    @Test
    fun `maskSensitiveUrlValues masks path token and query key together`() {
        val masked = AppLogger.maskSensitiveUrlValues(
            "https://example.com/hooks/abcdef1234567890abcdef/points?api_key=secret123&lat=1.5"
        )
        assertEquals("https://example.com/hooks/abcd***/points?api_key=secr***&lat=1.5", masked)
    }

    @Test
    fun `maskSensitiveUrlValues masks a token in a URL with an unknown scheme`() {
        val masked = AppLogger.maskSensitiveUrlValues("htps://ha.example.com/api/webhook/abcdef1234567890abcdef")
        assertEquals("htps://ha.example.com/api/webhook/abcd***", masked)
    }
}
