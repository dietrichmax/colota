/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.data

import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import io.mockk.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Tests for ProfileHelper cache behavior and public API contracts.
 * Database interactions are mocked since unit tests don't have SQLite.
 */
class ProfileHelperTest {

    private lateinit var mockDb: SQLiteDatabase
    private lateinit var mockDbHelper: DatabaseHelper

    @Before
    fun setup() {
        mockDb = mockk(relaxed = true)
        mockDbHelper = mockk {
            every { readableDatabase } returns mockDb
            every { writableDatabase } returns mockDb
        }

        // Use reflection to set the singleton for tests
        mockkObject(DatabaseHelper.Companion)
        every { DatabaseHelper.getInstance(any()) } returns mockDbHelper
    }

    private fun mockCursorWithProfiles(profiles: List<Map<String, Any?>>): Cursor {
        val cursor = mockk<Cursor>(relaxed = true)
        var position = -1

        every { cursor.moveToNext() } answers {
            position++
            position < profiles.size
        }

        // Column index mapping
        val columns = listOf(
            "id", "name", "interval_ms", "min_update_distance",
            "sync_interval_seconds", "priority", "condition_type",
            "speed_threshold", "deactivation_delay_seconds", "enabled", "created_at"
        )

        for ((idx, col) in columns.withIndex()) {
            every { cursor.getColumnIndexOrThrow(col) } returns idx
        }

        every { cursor.getInt(any()) } answers {
            val col = firstArg<Int>()
            val profile = profiles[position]
            val key = columns[col]
            (profile[key] as? Number)?.toInt() ?: 0
        }

        every { cursor.getLong(any()) } answers {
            val col = firstArg<Int>()
            val profile = profiles[position]
            val key = columns[col]
            (profile[key] as? Number)?.toLong() ?: 0L
        }

        every { cursor.getFloat(any()) } answers {
            val col = firstArg<Int>()
            val profile = profiles[position]
            val key = columns[col]
            (profile[key] as? Number)?.toFloat() ?: 0f
        }

        every { cursor.getString(any()) } answers {
            val col = firstArg<Int>()
            val profile = profiles[position]
            val key = columns[col]
            profile[key] as? String ?: ""
        }

        every { cursor.isNull(any()) } answers {
            val col = firstArg<Int>()
            val profile = profiles[position]
            val key = columns[col]
            profile[key] == null
        }

        every { cursor.close() } just Runs

        return cursor
    }

    @Test
    fun `getEnabledProfiles returns profiles from database`() {
        val cursor = mockCursorWithProfiles(listOf(
            mapOf(
                "id" to 1, "name" to "Charging", "interval_ms" to 10000L,
                "min_update_distance" to 0f, "sync_interval_seconds" to 0,
                "priority" to 10, "condition_type" to "charging",
                "speed_threshold" to null, "deactivation_delay_seconds" to 60
            )
        ))

        every { mockDb.query(any(), any(), eq("enabled = 1"), any(), any(), any(), any()) } returns cursor

        val helper = ProfileHelper(mockk(relaxed = true))
        val profiles = helper.getEnabledProfiles()

        assertEquals(1, profiles.size)
        assertEquals("Charging", profiles[0].name)
        assertEquals(10000L, profiles[0].intervalMs)
        assertEquals("charging", profiles[0].conditionType)
        assertNull(profiles[0].speedThreshold)
    }

    @Test
    fun `getEnabledProfiles caches results on second call`() {
        val cursor = mockCursorWithProfiles(listOf(
            mapOf(
                "id" to 1, "name" to "Test", "interval_ms" to 5000L,
                "min_update_distance" to 0f, "sync_interval_seconds" to 0,
                "priority" to 10, "condition_type" to "charging",
                "speed_threshold" to null, "deactivation_delay_seconds" to 30
            )
        ))

        every { mockDb.query(any(), any(), eq("enabled = 1"), any(), any(), any(), any()) } returns cursor

        val helper = ProfileHelper(mockk(relaxed = true))

        helper.getEnabledProfiles()
        helper.getEnabledProfiles()

        // Query should only be called once due to caching
        verify(exactly = 1) { mockDb.query(any(), any(), eq("enabled = 1"), any(), any(), any(), any()) }
    }

    @Test
    fun `invalidateCache causes reload on next call`() {
        val cursor1 = mockCursorWithProfiles(listOf(
            mapOf(
                "id" to 1, "name" to "V1", "interval_ms" to 5000L,
                "min_update_distance" to 0f, "sync_interval_seconds" to 0,
                "priority" to 10, "condition_type" to "charging",
                "speed_threshold" to null, "deactivation_delay_seconds" to 30
            )
        ))
        val cursor2 = mockCursorWithProfiles(listOf(
            mapOf(
                "id" to 1, "name" to "V2", "interval_ms" to 10000L,
                "min_update_distance" to 0f, "sync_interval_seconds" to 0,
                "priority" to 10, "condition_type" to "charging",
                "speed_threshold" to null, "deactivation_delay_seconds" to 30
            )
        ))

        every { mockDb.query(any(), any(), eq("enabled = 1"), any(), any(), any(), any()) } returnsMany listOf(cursor1, cursor2)

        val helper = ProfileHelper(mockk(relaxed = true))

        val first = helper.getEnabledProfiles()
        assertEquals("V1", first[0].name)

        helper.invalidateCache()

        val second = helper.getEnabledProfiles()
        assertEquals("V2", second[0].name)

        verify(exactly = 2) { mockDb.query(any(), any(), eq("enabled = 1"), any(), any(), any(), any()) }
    }

    @Test
    fun `getEnabledProfiles returns empty list on database error`() {
        every { mockDb.query(any(), any(), eq("enabled = 1"), any(), any(), any(), any()) } throws RuntimeException("DB error")

        val helper = ProfileHelper(mockk(relaxed = true))
        val profiles = helper.getEnabledProfiles()

        assertTrue(profiles.isEmpty())
    }

    @Test
    fun `getEnabledProfiles handles speed threshold`() {
        val cursor = mockCursorWithProfiles(listOf(
            mapOf(
                "id" to 1, "name" to "Fast", "interval_ms" to 2000L,
                "min_update_distance" to 10f, "sync_interval_seconds" to 0,
                "priority" to 15, "condition_type" to "speed_above",
                "speed_threshold" to 13.89f, "deactivation_delay_seconds" to 30
            )
        ))

        every { mockDb.query(any(), any(), eq("enabled = 1"), any(), any(), any(), any()) } returns cursor

        val helper = ProfileHelper(mockk(relaxed = true))
        val profiles = helper.getEnabledProfiles()

        assertEquals(1, profiles.size)
        assertEquals(13.89f, profiles[0].speedThreshold!!, 0.01f)
        assertEquals("speed_above", profiles[0].conditionType)
    }

    @Test
    fun `deleteProfile calls database delete`() {
        every { mockDb.delete(any(), any(), any()) } returns 1

        val helper = ProfileHelper(mockk(relaxed = true))
        val result = helper.deleteProfile(42)

        assertTrue(result)
        verify { mockDb.delete(DatabaseHelper.TABLE_PROFILES, "id = ?", arrayOf("42")) }
    }

    @Test
    fun `deleteProfile returns false when no rows affected`() {
        every { mockDb.delete(any(), any(), any()) } returns 0

        val helper = ProfileHelper(mockk(relaxed = true))
        val result = helper.deleteProfile(999)

        assertFalse(result)
    }

}
