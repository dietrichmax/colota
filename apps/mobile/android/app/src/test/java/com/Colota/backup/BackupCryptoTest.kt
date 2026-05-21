/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.backup

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

class BackupCryptoTest {

    private val crypto = BackupCrypto()
    private val password = "correct horse battery staple".toCharArray()
    private val smallChunk = 64

    @Test
    fun `empty input is rejected at encrypt time`() {
        try {
            encrypt(ByteArray(0))
            fail("Expected IllegalStateException")
        } catch (e: IllegalStateException) {
            assertTrue(e.message?.contains("empty") == true)
        }
    }

    @Test
    fun `round-trip single-chunk input`() {
        val plaintext = "hello world".toByteArray()
        val encrypted = encrypt(plaintext)
        val decrypted = decrypt(encrypted)
        assertArrayEquals(plaintext, decrypted)
    }

    @Test
    fun `round-trip exactly chunk-aligned input`() {
        val plaintext = ByteArray(smallChunk * 3) { it.toByte() }
        val encrypted = encrypt(plaintext, smallChunk)
        val decrypted = decrypt(encrypted)
        assertArrayEquals(plaintext, decrypted)
    }

    @Test
    fun `round-trip multi-chunk input with partial final chunk`() {
        val plaintext = ByteArray(smallChunk * 3 + 17) { (it * 7).toByte() }
        val encrypted = encrypt(plaintext, smallChunk)
        val decrypted = decrypt(encrypted)
        assertArrayEquals(plaintext, decrypted)
    }

    @Test
    fun `wrong password fails on first chunk`() {
        val plaintext = "secret".toByteArray()
        val encrypted = encrypt(plaintext)

        try {
            crypto.decrypt(
                ByteArrayInputStream(encrypted),
                ByteArrayOutputStream(),
                "wrong password".toCharArray(),
            )
            fail("Expected WRONG_PASSWORD")
        } catch (e: BackupException) {
            assertEquals(BackupError.WRONG_PASSWORD, e.error)
        }
    }

    @Test
    fun `bad magic is rejected`() {
        val encrypted = encrypt("hi".toByteArray())
        encrypted[0] = 'X'.code.toByte()

        try {
            decrypt(encrypted)
            fail("Expected BAD_MAGIC")
        } catch (e: BackupException) {
            assertEquals(BackupError.BAD_MAGIC, e.error)
        }
    }

    @Test
    fun `truncated stream is rejected`() {
        val encrypted = encrypt("some data here".toByteArray())
        val truncated = encrypted.copyOf(encrypted.size - 4)

        try {
            decrypt(truncated)
            fail("Expected TRUNCATED")
        } catch (e: BackupException) {
            assertEquals(BackupError.TRUNCATED, e.error)
        }
    }

    @Test
    fun `truncated to header only is rejected`() {
        val encrypted = encrypt("some data".toByteArray())
        val onlyHeader = encrypted.copyOf(BackupFormat.HEADER_BYTES)

        try {
            decrypt(onlyHeader)
            fail("Expected TRUNCATED")
        } catch (e: BackupException) {
            assertEquals(BackupError.TRUNCATED, e.error)
        }
    }

    @Test
    fun `tampered ciphertext is rejected`() {
        val plaintext = ByteArray(smallChunk * 2) { (it * 13).toByte() }
        val encrypted = encrypt(plaintext, smallChunk)

        // Flip a byte in the second chunk's ciphertext (after header + chunk 0)
        val chunk0Total = 4 + smallChunk + BackupFormat.GCM_TAG_BYTES
        val targetByte = BackupFormat.HEADER_BYTES + chunk0Total + 4 + 5
        encrypted[targetByte] = (encrypted[targetByte].toInt() xor 0x01).toByte()

        try {
            decrypt(encrypted)
            fail("Expected TAMPERED")
        } catch (e: BackupException) {
            assertEquals(BackupError.TAMPERED, e.error)
        }
    }

    @Test
    fun `header round-trip preserves all fields`() {
        val plaintext = "x".toByteArray()
        val encrypted = encrypt(plaintext, smallChunk)

        val header = crypto.readHeader(ByteArrayInputStream(encrypted))
        assertEquals(BackupFormat.FORMAT_VERSION, header.formatVersion)
        assertEquals(BackupFormat.KDF_ARGON2ID, header.kdfId)
        assertEquals(smallChunk, header.chunkSize)
        assertEquals(BackupFormat.SALT_BYTES, header.salt.size)
        assertEquals(BackupFormat.NONCE_PREFIX_BYTES, header.noncePrefix.size)
    }

    @Test
    fun `successive backups have different salts`() {
        val plaintext = "x".toByteArray()
        val a = encrypt(plaintext)
        val b = encrypt(plaintext)

        val saltStart = BackupFormat.MAGIC_BYTES + 1 + 1 + BackupFormat.KDF_PARAMS_BYTES
        val saltA = a.sliceArray(saltStart until saltStart + BackupFormat.SALT_BYTES)
        val saltB = b.sliceArray(saltStart until saltStart + BackupFormat.SALT_BYTES)
        assertTrue("salts must differ", !saltA.contentEquals(saltB))
    }

    @Test
    fun `unsupported format version is rejected`() {
        val encrypted = encrypt("hi".toByteArray())
        encrypted[BackupFormat.MAGIC_BYTES] = 99 // formatVersion byte
        try {
            decrypt(encrypted)
            fail("Expected UNSUPPORTED_VERSION")
        } catch (e: BackupException) {
            assertEquals(BackupError.UNSUPPORTED_VERSION, e.error)
        }
    }

    @Test
    fun `unsupported KDF id is rejected`() {
        val encrypted = encrypt("hi".toByteArray())
        encrypted[BackupFormat.MAGIC_BYTES + 1] = BackupFormat.KDF_PBKDF2 // kdfId byte
        try {
            decrypt(encrypted)
            fail("Expected UNSUPPORTED_KDF")
        } catch (e: BackupException) {
            assertEquals(BackupError.UNSUPPORTED_KDF, e.error)
        }
    }

    @Test
    fun `tampered KDF params fails on chunk 0 as wrong password`() {
        val encrypted = encrypt("hi".toByteArray())
        // Flip a byte inside the kdfParams region (memory cost field).
        val kdfStart = BackupFormat.MAGIC_BYTES + 2
        encrypted[kdfStart] = (encrypted[kdfStart].toInt() xor 0x01).toByte()
        try {
            decrypt(encrypted)
            fail("Expected WRONG_PASSWORD or out-of-range param")
        } catch (e: BackupException) {
            // Either Argon2 param validation rejects (TAMPERED via require())
            // or the changed AAD makes chunk 0 fail as WRONG_PASSWORD.
            assertTrue(
                "got ${e.error}",
                e.error == BackupError.WRONG_PASSWORD || e.error == BackupError.TAMPERED
            )
        }
    }

    @Test
    fun `tampered nonce prefix fails on chunk 0`() {
        val encrypted = encrypt("hi".toByteArray())
        // noncePrefix sits after magic + formatVer + kdfId + kdfParams + salt
        val nonceStart = BackupFormat.MAGIC_BYTES + 2 + BackupFormat.KDF_PARAMS_BYTES + BackupFormat.SALT_BYTES
        encrypted[nonceStart] = (encrypted[nonceStart].toInt() xor 0x01).toByte()
        try {
            decrypt(encrypted)
            fail("Expected WRONG_PASSWORD")
        } catch (e: BackupException) {
            assertEquals(BackupError.WRONG_PASSWORD, e.error)
        }
    }

    @Test
    fun `oversized declared chunkSize is rejected`() {
        val encrypted = encrypt("hi".toByteArray())
        // chunkSize sits after magic + formatVer + kdfId + kdfParams + salt + noncePrefix
        val chunkSizeOffset = BackupFormat.MAGIC_BYTES + 2 +
                BackupFormat.KDF_PARAMS_BYTES + BackupFormat.SALT_BYTES +
                BackupFormat.NONCE_PREFIX_BYTES
        // Write 64 MiB (0x04000000) - above MAX_READ_CHUNK_SIZE
        encrypted[chunkSizeOffset] = 0x04
        encrypted[chunkSizeOffset + 1] = 0
        encrypted[chunkSizeOffset + 2] = 0
        encrypted[chunkSizeOffset + 3] = 0
        try {
            decrypt(encrypted)
            fail("Expected TAMPERED")
        } catch (e: BackupException) {
            assertEquals(BackupError.TAMPERED, e.error)
        }
    }

    private fun encrypt(plaintext: ByteArray, chunkSize: Int = BackupFormat.DEFAULT_CHUNK_SIZE): ByteArray {
        val out = ByteArrayOutputStream()
        crypto.encrypt(ByteArrayInputStream(plaintext), out, password, chunkSize)
        return out.toByteArray()
    }

    private fun decrypt(encrypted: ByteArray): ByteArray {
        val out = ByteArrayOutputStream()
        crypto.decrypt(ByteArrayInputStream(encrypted), out, password)
        return out.toByteArray()
    }
}
