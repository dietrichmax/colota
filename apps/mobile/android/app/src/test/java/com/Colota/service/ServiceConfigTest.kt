/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import com.Colota.data.DatabaseHelper
import io.mockk.every
import io.mockk.mockk
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
}
