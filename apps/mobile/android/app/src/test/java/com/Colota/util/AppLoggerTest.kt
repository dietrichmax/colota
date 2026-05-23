package com.Colota.util

import org.junit.Assert.*
import org.junit.Test

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
}
