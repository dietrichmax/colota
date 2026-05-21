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
import io.mockk.unmockkObject
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.zip.ZipInputStream

@RunWith(RobolectricTestRunner::class)
class BackupBuilderTest {

    private lateinit var db: DatabaseHelper
    private lateinit var secureStorage: SecureStorageHelper
    private lateinit var builder: BackupBuilder

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
            "auth_bearer_token" to "test-token-12345",
        )

        builder = BackupBuilder(context, db, secureStorage)
    }

    @After
    fun tearDown() {
        db.close()
        resetDbSingleton()
        unmockkObject(AppLogger)
    }

    @Test
    fun `backup round-trip recovers database, secrets, and manifest`() {
        seedDatabase()

        val encrypted = ByteArrayOutputStream().apply {
            builder.build(this, password)
        }.toByteArray()

        val zipBytes = decryptToZip(encrypted)
        val entries = readZipEntries(zipBytes)

        assertNotNull(entries["manifest.json"])
        assertNotNull(entries["secrets.json"])
        assertNotNull(entries["db/colota.sqlite"])

        val manifest = JSONObject(String(entries.getValue("manifest.json"), Charsets.UTF_8))
        assertEquals(DatabaseHelper.DATABASE_VERSION, manifest.getJSONObject("schema").getInt("db"))
        assertTrue("createdAt missing", manifest.getString("createdAt").isNotBlank())
        assertTrue("appVersion missing", manifest.getString("appVersion").isNotBlank())

        val secrets = JSONObject(String(entries.getValue("secrets.json"), Charsets.UTF_8))
        assertEquals("bearer", secrets.getString("auth_type"))
        assertEquals("test-token-12345", secrets.getString("auth_bearer_token"))

        val dbBytes = entries.getValue("db/colota.sqlite")
        assertTrue("DB snapshot too small", dbBytes.size > 1024)
        assertEquals("SQLite format 3", String(dbBytes, 0, 15, Charsets.US_ASCII))
    }

    @Test
    fun `cacheDir backup_temp is cleared after build`() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val workDir = File(context.cacheDir, "backup_temp")
        workDir.mkdirs()
        File(workDir, "stale").writeText("leftover")

        builder.build(ByteArrayOutputStream(), password)

        assertFalse("stale temp file must be cleaned", File(workDir, "stale").exists())
    }

    @Test
    fun `cacheDir backup_temp is cleared even if encrypt fails`() {
        every { secureStorage.exportPlaintextForBackup() } throws RuntimeException("boom")

        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val workDir = File(context.cacheDir, "backup_temp")

        try {
            builder.build(ByteArrayOutputStream(), password)
        } catch (_: RuntimeException) {
            // expected
        }

        assertFalse("workDir must be removed on failure", workDir.exists())
    }

    private fun seedDatabase() {
        val sqlite = db.writableDatabase
        for (i in 0..9) {
            val values = ContentValues().apply {
                put("latitude", 52.5 + i * 0.001)
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

    private fun decryptToZip(encrypted: ByteArray): ByteArray {
        val out = ByteArrayOutputStream()
        BackupCrypto().decrypt(ByteArrayInputStream(encrypted), out, password)
        return out.toByteArray()
    }

    private fun readZipEntries(zipBytes: ByteArray): Map<String, ByteArray> {
        val result = mutableMapOf<String, ByteArray>()
        ZipInputStream(ByteArrayInputStream(zipBytes)).use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                result[entry.name] = zip.readBytes()
                entry = zip.nextEntry
            }
        }
        return result
    }

    private fun resetDbSingleton() {
        val field = DatabaseHelper::class.java.getDeclaredField("INSTANCE")
        field.isAccessible = true
        field.set(null, null)
    }
}
