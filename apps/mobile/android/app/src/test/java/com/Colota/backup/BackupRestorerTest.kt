/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.backup

import android.content.ContentValues
import androidx.test.core.app.ApplicationProvider
import com.Colota.data.DatabaseHelper
import com.Colota.util.AppLogger
import com.Colota.util.SecureStorageHelper
import io.mockk.Runs
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.slot
import io.mockk.unmockkObject
import io.mockk.verify
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

@RunWith(RobolectricTestRunner::class)
class BackupRestorerTest {

    private lateinit var db: DatabaseHelper
    private lateinit var secureStorage: SecureStorageHelper
    private lateinit var builder: BackupBuilder
    private lateinit var restorer: BackupRestorer

    private val password = "correct horse battery staple".toCharArray()

    @Before
    fun setUp() {
        resetDbSingleton()
        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs

        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        db = DatabaseHelper.getInstance(context)

        secureStorage = mockk(relaxed = true)
        every { secureStorage.exportPlaintextForBackup() } returns mapOf(
            "auth_type" to "bearer",
            "auth_bearer_token" to "secret-token-99",
        )

        builder = BackupBuilder(context, db, secureStorage)
        restorer = BackupRestorer(context, secureStorage)
    }

    @After
    fun tearDown() {
        DatabaseHelper.getInstance(
            ApplicationProvider.getApplicationContext<android.content.Context>()
        ).close()
        resetDbSingleton()
        unmockkObject(AppLogger)
    }

    @Test
    fun `round-trip restores rows seeded before backup`() {
        seedDatabase(latPrefix = 51.0)
        val backup = backupBytes()

        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        DatabaseHelper.getInstance(context).writableDatabase
            .delete(DatabaseHelper.TABLE_LOCATIONS, null, null)
        assertEquals(0, countLocations())

        restorer.restore(ByteArrayInputStream(backup), password)

        assertEquals(10, countLocations())
        assertEquals("dark", DatabaseHelper.getInstance(context).getSetting("themeMode"))
    }

    @Test
    fun `restore re-imports secrets via SecureStorageHelper`() {
        seedDatabase(latPrefix = 51.0)
        val backup = backupBytes()

        val captured = slot<Map<String, String>>()
        every { secureStorage.importPlaintextFromBackup(capture(captured)) } just Runs

        restorer.restore(ByteArrayInputStream(backup), password)

        verify { secureStorage.importPlaintextFromBackup(any()) }
        assertEquals("bearer", captured.captured["auth_type"])
        assertEquals("secret-token-99", captured.captured["auth_bearer_token"])
    }

    @Test
    fun `wrong password leaves live database untouched`() {
        seedDatabase(latPrefix = 51.0)
        val originalCount = countLocations()
        val backup = backupBytes()

        try {
            restorer.restore(ByteArrayInputStream(backup), "wrong".toCharArray())
            fail("Expected WRONG_PASSWORD")
        } catch (e: BackupException) {
            assertEquals(BackupError.WRONG_PASSWORD, e.error)
        }

        assertEquals(originalCount, countLocations())
    }

    @Test
    fun `bad magic is rejected before any DB swap`() {
        seedDatabase(latPrefix = 51.0)
        val originalCount = countLocations()
        val backup = backupBytes()
        backup[0] = 'X'.code.toByte()

        try {
            restorer.restore(ByteArrayInputStream(backup), password)
            fail("Expected BAD_MAGIC")
        } catch (e: BackupException) {
            assertEquals(BackupError.BAD_MAGIC, e.error)
        }

        assertEquals(originalCount, countLocations())
    }

    @Test
    fun `restore_temp is cleaned up on success`() {
        seedDatabase(latPrefix = 51.0)
        val backup = backupBytes()

        restorer.restore(ByteArrayInputStream(backup), password)

        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val workDir = java.io.File(context.cacheDir, "restore_temp")
        assertTrue("workDir must be removed after restore", !workDir.exists())
    }

    @Test
    fun `restore_temp is cleaned up on wrong password`() {
        seedDatabase(latPrefix = 51.0)
        val backup = backupBytes()

        try {
            restorer.restore(ByteArrayInputStream(backup), "wrong".toCharArray())
        } catch (_: BackupException) {
            // expected
        }

        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val workDir = java.io.File(context.cacheDir, "restore_temp")
        assertTrue("workDir must be removed even on failure", !workDir.exists())
    }

    private fun seedDatabase(latPrefix: Double) {
        val sqlite = db.writableDatabase
        for (i in 0..9) {
            val values = ContentValues().apply {
                put("latitude", latPrefix + i * 0.001)
                put("longitude", 13.4 + i * 0.001)
                put("accuracy", 5)
                put("timestamp", System.currentTimeMillis() / 1000 + i)
                put("created_at", System.currentTimeMillis())
                put("sent", 0)
            }
            val id = sqlite.insert(DatabaseHelper.TABLE_LOCATIONS, null, values)
            check(id != -1L) { "seed insert failed at row $i" }
        }
        db.saveSetting("themeMode", "dark")
    }

    private fun backupBytes(): ByteArray {
        return ByteArrayOutputStream().apply {
            builder.build(this, password)
        }.toByteArray()
    }

    private fun countLocations(): Int {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        return DatabaseHelper.getInstance(context).writableDatabase
            .rawQuery("SELECT COUNT(*) FROM ${DatabaseHelper.TABLE_LOCATIONS}", null).use {
                if (it.moveToFirst()) it.getInt(0) else 0
            }
    }

    private fun resetDbSingleton() {
        val field = DatabaseHelper::class.java.getDeclaredField("INSTANCE")
        field.isAccessible = true
        field.set(null, null)
    }
}
