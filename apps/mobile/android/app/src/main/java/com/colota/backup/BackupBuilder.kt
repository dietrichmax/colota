/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.backup

import android.app.ActivityManager
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import com.Colota.BuildConfig
import com.Colota.data.DatabaseHelper
import com.Colota.util.SecureStorageHelper
import org.json.JSONObject
import java.io.File
import java.io.OutputStream
import java.time.Instant
import java.util.zip.Deflater
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class BackupBuilder @JvmOverloads constructor(
    private val context: Context,
    private val databaseHelper: DatabaseHelper = DatabaseHelper.getInstance(context),
    private val secureStorageHelper: SecureStorageHelper = SecureStorageHelper.getInstance(context),
    private val crypto: BackupCrypto = BackupCrypto(),
) {

    fun build(output: OutputStream, password: CharArray) {
        val workDir = File(context.cacheDir, WORK_DIR_NAME).apply {
            deleteRecursively()
            mkdirs()
        }
        try {
            val dbSnapshot = File(workDir, "db.sqlite")
            databaseHelper.snapshotTo(dbSnapshot)
            verifySnapshotIntegrity(dbSnapshot)

            val secrets = secureStorageHelper.exportPlaintextForBackup()
            val secretsJson = JSONObject(secrets).toString()

            val manifestJson = buildManifest().toString()

            val zipFile = File(workDir, "bundle.zip")
            zipFile.outputStream().buffered().use { zipOut ->
                ZipOutputStream(zipOut).use { zip ->
                    zip.setLevel(Deflater.BEST_SPEED)
                    addEntry(zip, "manifest.json", manifestJson.toByteArray(Charsets.UTF_8))
                    addEntry(zip, "secrets.json", secretsJson.toByteArray(Charsets.UTF_8))
                    addDeflatedFileEntry(zip, "db/colota.sqlite", dbSnapshot)
                }
            }

            val argon2MemoryKib = pickArgon2MemoryKib()
            zipFile.inputStream().buffered().use { zipIn ->
                crypto.encrypt(
                    zipIn, output, password,
                    argon2MemoryKib = argon2MemoryKib,
                )
            }
        } finally {
            workDir.deleteRecursively()
        }
    }

    private fun buildManifest(): JSONObject {
        return JSONObject().apply {
            put("schema", JSONObject().apply { put("db", DatabaseHelper.DATABASE_VERSION) })
            put("createdAt", Instant.now().toString())
            put("appVersion", BuildConfig.VERSION_NAME)
            put("appBuild", BuildConfig.VERSION_CODE)
        }
    }

    private fun addEntry(zip: ZipOutputStream, name: String, data: ByteArray) {
        zip.putNextEntry(ZipEntry(name))
        zip.write(data)
        zip.closeEntry()
    }

    private fun addDeflatedFileEntry(zip: ZipOutputStream, name: String, file: File) {
        zip.putNextEntry(ZipEntry(name))
        file.inputStream().buffered().use { it.copyTo(zip) }
        zip.closeEntry()
    }

    // integrity_check (vs quick_check) catches cross-page corruption from a torn copy
    // on the API < 30 fallback path. Slower but only runs on the snapshot, not the live DB.
    private fun verifySnapshotIntegrity(dbFile: File) {
        val db = SQLiteDatabase.openDatabase(dbFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
        val result = try {
            db.rawQuery("PRAGMA integrity_check", null).use { c ->
                if (c.moveToFirst()) c.getString(0) else "no result"
            }
        } finally {
            db.close()
        }
        if (result != "ok") {
            throw IllegalStateException(
                "Snapshot integrity check failed ($result). Try again, ideally with tracking paused."
            )
        }
    }

    // Pick by device class only. Transient availMem would silently weaken the
    // backup based on whatever the user had open at the moment; deriveKey
    // catches OOM and surfaces it as a real error if 64 MiB truly won't fit.
    private fun pickArgon2MemoryKib(): Int {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            ?: return BackupFormat.ARGON2_MEMORY_KIB
        return if (am.isLowRamDevice) {
            BackupFormat.ARGON2_MEMORY_KIB_LOW_RAM
        } else {
            BackupFormat.ARGON2_MEMORY_KIB
        }
    }

    companion object {
        private const val WORK_DIR_NAME = "backup_temp"
    }
}
