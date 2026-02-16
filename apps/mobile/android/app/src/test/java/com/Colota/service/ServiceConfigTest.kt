/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.content.Intent
import android.os.Bundle
import com.Colota.data.DatabaseHelper
import com.facebook.react.bridge.JavaOnlyMap
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.Assert.*
import org.junit.Test

class ServiceConfigTest {

    private fun mockDbHelper(settings: Map<String, String>): DatabaseHelper {
        return mockk {
            every { getAllSettings() } returns settings
        }
    }

    private val baseSettings = mapOf(
        "endpoint" to "https://example.com",
        "interval" to "5000",
        "minUpdateDistance" to "0",
        "syncInterval" to "0",
        "maxRetries" to "5",
        "accuracyThreshold" to "50.0",
        "filterInaccurateLocations" to "false",
        "retryInterval" to "30",
        "isOfflineMode" to "false",
        "isWifiOnlySync" to "false",
        "httpMethod" to "POST"
    )

    // --- fromDatabase ---

    @Test
    fun `fromDatabase defaults isWifiOnlySync to false`() {
        val db = mockDbHelper(baseSettings - "isWifiOnlySync")
        val config = ServiceConfig.fromDatabase(db)
        assertFalse(config.isWifiOnlySync)
    }

    @Test
    fun `fromDatabase reads isWifiOnlySync true`() {
        val db = mockDbHelper(baseSettings + ("isWifiOnlySync" to "true"))
        val config = ServiceConfig.fromDatabase(db)
        assertTrue(config.isWifiOnlySync)
    }

    @Test
    fun `fromDatabase reads isWifiOnlySync false`() {
        val db = mockDbHelper(baseSettings + ("isWifiOnlySync" to "false"))
        val config = ServiceConfig.fromDatabase(db)
        assertFalse(config.isWifiOnlySync)
    }

    @Test
    fun `fromDatabase reads all fields correctly`() {
        val db = mockDbHelper(baseSettings)
        val config = ServiceConfig.fromDatabase(db)

        assertEquals("https://example.com", config.endpoint)
        assertEquals(5000L, config.interval)
        assertEquals(0f, config.minUpdateDistance, 0.001f)
        assertEquals(0, config.syncIntervalSeconds)
        assertEquals(5, config.maxRetries)
        assertEquals(50.0f, config.accuracyThreshold, 0.001f)
        assertFalse(config.filterInaccurateLocations)
        assertEquals(30, config.retryIntervalSeconds)
        assertFalse(config.isOfflineMode)
        assertEquals("POST", config.httpMethod)
    }

    @Test
    fun `fromDatabase uses defaults for missing settings`() {
        val db = mockDbHelper(emptyMap())
        val config = ServiceConfig.fromDatabase(db)

        assertEquals("", config.endpoint)
        assertEquals(5000L, config.interval)
        assertEquals(0f, config.minUpdateDistance, 0.001f)
        assertEquals(0, config.syncIntervalSeconds)
        assertEquals(5, config.maxRetries)
        assertEquals(50.0f, config.accuracyThreshold, 0.001f)
        assertFalse(config.filterInaccurateLocations)
        assertEquals(30, config.retryIntervalSeconds)
        assertFalse(config.isOfflineMode)
        assertFalse(config.isWifiOnlySync)
        assertEquals("POST", config.httpMethod)
    }

    @Test
    fun `fromDatabase handles malformed numeric values with defaults`() {
        val db = mockDbHelper(mapOf(
            "interval" to "not_a_number",
            "syncInterval" to "abc",
            "maxRetries" to "",
            "accuracyThreshold" to "xyz",
            "retryInterval" to "---"
        ))
        val config = ServiceConfig.fromDatabase(db)

        assertEquals(5000L, config.interval)
        assertEquals(0, config.syncIntervalSeconds)
        assertEquals(5, config.maxRetries)
        assertEquals(50.0f, config.accuracyThreshold, 0.001f)
        assertEquals(30, config.retryIntervalSeconds)
    }

    @Test
    fun `fromDatabase reads fieldMap and customFields`() {
        val db = mockDbHelper(baseSettings + mapOf(
            "fieldMap" to """{"lat":"latitude","lon":"longitude"}""",
            "customFields" to """[{"key":"_type","value":"location"}]"""
        ))
        val config = ServiceConfig.fromDatabase(db)

        assertEquals("""{"lat":"latitude","lon":"longitude"}""", config.fieldMap)
        assertEquals("""[{"key":"_type","value":"location"}]""", config.customFields)
    }

    // --- data class defaults ---

    @Test
    fun `default constructor sets isWifiOnlySync to false`() {
        val config = ServiceConfig()
        assertFalse(config.isWifiOnlySync)
    }

    @Test
    fun `constructor accepts isWifiOnlySync true`() {
        val config = ServiceConfig(isWifiOnlySync = true)
        assertTrue(config.isWifiOnlySync)
    }

    @Test
    fun `default constructor sets all defaults correctly`() {
        val config = ServiceConfig()

        assertEquals("", config.endpoint)
        assertEquals(5000L, config.interval)
        assertEquals(0f, config.minUpdateDistance, 0.001f)
        assertEquals(0, config.syncIntervalSeconds)
        assertEquals(5, config.maxRetries)
        assertEquals(50.0f, config.accuracyThreshold, 0.001f)
        assertFalse(config.filterInaccurateLocations)
        assertEquals(30, config.retryIntervalSeconds)
        assertFalse(config.isOfflineMode)
        assertFalse(config.isWifiOnlySync)
        assertNull(config.fieldMap)
        assertNull(config.customFields)
        assertEquals("POST", config.httpMethod)
    }

    // --- isOfflineMode and isWifiOnlySync are independent ---

    @Test
    fun `isOfflineMode and isWifiOnlySync are independent`() {
        val db = mockDbHelper(
            baseSettings + ("isOfflineMode" to "true") + ("isWifiOnlySync" to "false")
        )
        val config = ServiceConfig.fromDatabase(db)
        assertTrue(config.isOfflineMode)
        assertFalse(config.isWifiOnlySync)
    }

    // --- fromIntent with mocked Bundle ---

    @Test
    fun `fromIntent falls back to database when no extras`() {
        val intent = mockk<Intent> {
            every { extras } returns null
        }
        val db = mockDbHelper(baseSettings)
        val config = ServiceConfig.fromIntent(intent, db)

        assertEquals("https://example.com", config.endpoint)
        assertEquals(5000L, config.interval)
    }

    @Test
    fun `fromIntent reads endpoint from extras`() {
        val bundle = mockk<Bundle> {
            every { getString("endpoint") } returns "https://override.com"
            every { containsKey(any()) } returns false
            every { containsKey("endpoint") } returns true
        }
        val intent = mockk<Intent> {
            every { extras } returns bundle
        }
        val db = mockDbHelper(baseSettings)
        val config = ServiceConfig.fromIntent(intent, db)

        assertEquals("https://override.com", config.endpoint)
        // Other fields fall back to DB
        assertEquals(5000L, config.interval)
        assertEquals(0, config.syncIntervalSeconds)
    }

    @Test
    fun `fromIntent reads all fields from extras`() {
        val bundle = mockk<Bundle> {
            every { getString("endpoint") } returns "https://test.com/api"
            every { containsKey(any()) } returns true
            every { getLong("interval") } returns 10000L
            every { getFloat("minUpdateDistance") } returns 5.0f
            every { getInt("syncInterval") } returns 300
            every { getInt("maxRetries") } returns 10
            every { getFloat("accuracyThreshold") } returns 25.0f
            every { getBoolean("filterInaccurateLocations") } returns true
            every { getInt("retryInterval") } returns 60
            every { getBoolean("isOfflineMode") } returns true
            every { getBoolean("isWifiOnlySync") } returns true
            every { getString("fieldMap") } returns """{"lat":"latitude"}"""
            every { getString("customFields") } returns """{"_type":"location"}"""
            every { getString("httpMethod") } returns "GET"
        }
        val intent = mockk<Intent> {
            every { extras } returns bundle
        }
        val db = mockDbHelper(emptyMap())
        val config = ServiceConfig.fromIntent(intent, db)

        assertEquals("https://test.com/api", config.endpoint)
        assertEquals(10000L, config.interval)
        assertEquals(5.0f, config.minUpdateDistance, 0.001f)
        assertEquals(300, config.syncIntervalSeconds)
        assertEquals(10, config.maxRetries)
        assertEquals(25.0f, config.accuracyThreshold, 0.001f)
        assertTrue(config.filterInaccurateLocations)
        assertEquals(60, config.retryIntervalSeconds)
        assertTrue(config.isOfflineMode)
        assertTrue(config.isWifiOnlySync)
        assertEquals("""{"lat":"latitude"}""", config.fieldMap)
        assertEquals("GET", config.httpMethod)
    }

    // --- toIntent ---

    @Test
    fun `toIntent puts all fields into intent`() {
        val config = ServiceConfig(
            endpoint = "https://test.com",
            interval = 10000L,
            syncIntervalSeconds = 300,
            httpMethod = "GET"
        )
        val intent = mockk<Intent>(relaxed = true)
        config.toIntent(intent)

        verify { intent.putExtra("endpoint", "https://test.com") }
        verify { intent.putExtra("interval", 10000L) }
        verify { intent.putExtra("syncInterval", 300) }
        verify { intent.putExtra("httpMethod", "GET") }
    }

    // --- fromReadableMap ---

    @Test
    fun `fromReadableMap overrides db values with map values`() {
        val db = mockDbHelper(baseSettings)
        val map = JavaOnlyMap().apply {
            putString("endpoint", "https://override.com")
            putDouble("interval", 15000.0)
            putInt("syncInterval", 120)
            putBoolean("isOfflineMode", true)
        }

        val config = ServiceConfig.fromReadableMap(map, db)

        assertEquals("https://override.com", config.endpoint)
        assertEquals(15000L, config.interval)
        assertEquals(120, config.syncIntervalSeconds)
        assertTrue(config.isOfflineMode)
        // Unset values fall back to DB
        assertEquals(5, config.maxRetries)
        assertFalse(config.isWifiOnlySync)
    }

    @Test
    fun `fromReadableMap falls back to db for all missing keys`() {
        val db = mockDbHelper(baseSettings)
        val map = JavaOnlyMap() // empty

        val config = ServiceConfig.fromReadableMap(map, db)

        assertEquals("https://example.com", config.endpoint)
        assertEquals(5000L, config.interval)
        assertEquals(0, config.syncIntervalSeconds)
    }

    @Test
    fun `fromReadableMap parses fieldMap from ReadableMap`() {
        val db = mockDbHelper(baseSettings)
        val fieldMapObj = JavaOnlyMap().apply {
            putString("lat", "latitude")
            putString("lon", "longitude")
        }
        val map = JavaOnlyMap().apply {
            putMap("fieldMap", fieldMapObj)
        }

        val config = ServiceConfig.fromReadableMap(map, db)

        assertNotNull(config.fieldMap)
        assertTrue(config.fieldMap!!.contains("latitude"))
        assertTrue(config.fieldMap!!.contains("longitude"))
    }

    @Test
    fun `fromReadableMap parses customFields from ReadableMap`() {
        val db = mockDbHelper(baseSettings)
        val customFieldsObj = JavaOnlyMap().apply {
            putString("_type", "location")
            putString("device", "phone1")
        }
        val map = JavaOnlyMap().apply {
            putMap("customFields", customFieldsObj)
        }

        val config = ServiceConfig.fromReadableMap(map, db)

        assertNotNull(config.customFields)
        assertTrue(config.customFields!!.contains("location"))
        assertTrue(config.customFields!!.contains("phone1"))
    }

    @Test
    fun `fromReadableMap reads httpMethod`() {
        val db = mockDbHelper(baseSettings)
        val map = JavaOnlyMap().apply {
            putString("httpMethod", "GET")
        }

        val config = ServiceConfig.fromReadableMap(map, db)
        assertEquals("GET", config.httpMethod)
    }

    @Test
    fun `fromReadableMap reads accuracy settings`() {
        val db = mockDbHelper(baseSettings)
        val map = JavaOnlyMap().apply {
            putDouble("accuracyThreshold", 25.0)
            putBoolean("filterInaccurateLocations", true)
        }

        val config = ServiceConfig.fromReadableMap(map, db)

        assertEquals(25.0f, config.accuracyThreshold, 0.001f)
        assertTrue(config.filterInaccurateLocations)
    }
}
