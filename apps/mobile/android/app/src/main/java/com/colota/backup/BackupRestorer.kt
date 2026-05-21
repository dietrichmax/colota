/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.backup

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import com.Colota.data.DatabaseHelper
import com.Colota.util.SecureStorageHelper
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.io.PipedInputStream
import java.io.PipedOutputStream
import java.util.zip.ZipInputStream

// DB is swapped only after migration + integrity pass; secrets are applied
// after the swap, so a failed secrets commit leaves a restored DB with the
// destination's prior credentials. Surfaced as an exception so the caller
// can warn the user rather than silently desyncing.
class BackupRestorer @JvmOverloads constructor(
    private val context: Context,
    private val secureStorageHelper: SecureStorageHelper = SecureStorageHelper.getInstance(context),
    private val crypto: BackupCrypto = BackupCrypto(),
) {

    fun restore(input: InputStream, password: CharArray) {
        val workDir = File(context.cacheDir, WORK_DIR_NAME).apply {
            deleteRecursively()
            mkdirs()
        }
        try {
            val extracted = decryptAndExtract(input, password, workDir)

            val manifestBytes = extracted.manifest
                ?: throw BackupException(BackupError.MISSING_ENTRY, MANIFEST_ENTRY)
            val dbFile = extracted.dbFile
                ?: throw BackupException(BackupError.MISSING_ENTRY, DB_ENTRY)

            val manifest = JSONObject(String(manifestBytes, Charsets.UTF_8))
            val backupSchema = manifest.optJSONObject("schema")?.optInt("db", -1) ?: -1
            if (backupSchema > DatabaseHelper.DATABASE_VERSION) {
                throw BackupException(
                    BackupError.UNSUPPORTED_SCHEMA,
                    "Backup schema $backupSchema is newer than installed app schema " +
                            "${DatabaseHelper.DATABASE_VERSION}; upgrade Colota first."
                )
            }

            verifyDatabaseIntegrity(dbFile)

            // Migrate before the swap so a failure leaves the live DB untouched.
            try {
                DatabaseHelper.migrateCandidate(dbFile)
            } catch (e: IllegalStateException) {
                throw BackupException(BackupError.UNSUPPORTED_SCHEMA, e.message ?: "Migration refused", e)
            } catch (e: Exception) {
                throw BackupException(BackupError.INTEGRITY_FAIL, "Schema migration failed: ${e.message}", e)
            }

            val secretsMap = extracted.secrets?.let { parseSecrets(it) }

            DatabaseHelper.replaceLiveDatabase(context, dbFile)

            if (secretsMap != null) {
                try {
                    secureStorageHelper.importPlaintextFromBackup(secretsMap)
                } catch (e: Exception) {
                    throw BackupException(
                        BackupError.SECRETS_PARTIAL,
                        "Database restored, but credentials could not be applied. Re-enter them in Connection settings.",
                        e,
                    )
                }
            }
        } finally {
            workDir.deleteRecursively()
        }
    }

    private fun decryptAndExtract(
        input: InputStream,
        password: CharArray,
        destDir: File,
    ): ExtractedEntries {
        val pipeBuffer = 1024 * 1024
        val pipedOut = PipedOutputStream()
        val pipedIn = PipedInputStream(pipedOut, pipeBuffer)

        // Read decryptError after join() for happens-before.
        var decryptError: Throwable? = null

        val decryptThread = Thread({
            try {
                pipedOut.use { crypto.decrypt(input, it, password) }
            } catch (t: Throwable) {
                decryptError = t
                try { pipedOut.close() } catch (_: Exception) {}
            }
        }, "BackupRestoreDecryptor").apply { isDaemon = true }
        decryptThread.start()

        val extracted = try {
            ZipInputStream(pipedIn).use { zip -> readEntriesFromStream(zip, destDir) }
        } catch (e: Exception) {
            decryptThread.join()
            decryptError?.let { throw it }
            throw e
        }

        decryptThread.join()
        decryptError?.let { throw it }
        return extracted
    }

    private fun readEntriesFromStream(zip: ZipInputStream, destDir: File): ExtractedEntries {
        var manifest: ByteArray? = null
        var secrets: ByteArray? = null
        var dbFile: File? = null

        // Zip-Slip defense: output paths are constants, never derived from entry.name.
        var entry = zip.nextEntry
        while (entry != null) {
            if (!entry.isDirectory) {
                when (entry.name) {
                    MANIFEST_ENTRY -> manifest = readBoundedZipEntry(zip, MANIFEST_ENTRY, MAX_MANIFEST_BYTES)
                    SECRETS_ENTRY -> secrets = readBoundedZipEntry(zip, SECRETS_ENTRY, MAX_SECRETS_BYTES)
                    DB_ENTRY -> {
                        val outFile = File(destDir, "extracted_db.sqlite")
                        outFile.outputStream().use { out -> zip.copyTo(out) }
                        dbFile = outFile
                    }
                    else -> { /* unknown entries ignored for forward compatibility */ }
                }
            }
            entry = zip.nextEntry
        }
        return ExtractedEntries(manifest, secrets, dbFile)
    }

    // Cap guards against zip-bomb-style entries within an authenticated bundle.
    private fun readBoundedZipEntry(zip: ZipInputStream, name: String, maxBytes: Int): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        val buf = ByteArray(8 * 1024)
        var total = 0
        while (true) {
            val n = zip.read(buf)
            if (n <= 0) break
            total += n
            if (total > maxBytes) {
                throw BackupException(
                    BackupError.TAMPERED,
                    "Entry $name exceeds $maxBytes-byte cap"
                )
            }
            out.write(buf, 0, n)
        }
        return out.toByteArray()
    }

    private fun verifyDatabaseIntegrity(dbFile: File) {
        val sqlite = try {
            SQLiteDatabase.openDatabase(dbFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
        } catch (e: Exception) {
            throw BackupException(BackupError.INTEGRITY_FAIL, "Cannot open backup DB: ${e.message}", e)
        }
        try {
            sqlite.rawQuery("PRAGMA integrity_check", null).use { cursor ->
                val result = if (cursor.moveToFirst()) cursor.getString(0) else "no result"
                if (result != "ok") {
                    throw BackupException(BackupError.INTEGRITY_FAIL, "integrity_check returned: $result")
                }
            }
        } finally {
            sqlite.close()
        }
    }

    // Empty values are kept; importPlaintextFromBackup treats them as "remove".
    private fun parseSecrets(bytes: ByteArray): Map<String, String> {
        val json = JSONObject(String(bytes, Charsets.UTF_8))
        val out = mutableMapOf<String, String>()
        val keys = json.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            out[key] = json.optString(key, "")
        }
        return out
    }

    private data class ExtractedEntries(
        val manifest: ByteArray?,
        val secrets: ByteArray?,
        val dbFile: File?,
    )

    companion object {
        private const val WORK_DIR_NAME = "restore_temp"
        private const val MANIFEST_ENTRY = "manifest.json"
        private const val SECRETS_ENTRY = "secrets.json"
        private const val DB_ENTRY = "db/colota.sqlite"
        private const val MAX_MANIFEST_BYTES = 256 * 1024
        private const val MAX_SECRETS_BYTES = 64 * 1024
    }
}
