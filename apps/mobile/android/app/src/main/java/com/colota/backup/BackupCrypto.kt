/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.backup

import org.bouncycastle.crypto.generators.Argon2BytesGenerator
import org.bouncycastle.crypto.params.Argon2Parameters
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.EOFException
import java.io.InputStream
import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.CharBuffer
import java.nio.charset.StandardCharsets
import java.security.SecureRandom
import java.util.Arrays
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Chunked AES-256-GCM keyed by Argon2id. On-disk layout: [BackupFormat]. */
class BackupCrypto(private val random: SecureRandom = SecureRandom()) {

    fun encrypt(
        input: InputStream,
        output: OutputStream,
        password: CharArray,
        chunkSize: Int = BackupFormat.DEFAULT_CHUNK_SIZE,
        argon2MemoryKib: Int = BackupFormat.ARGON2_MEMORY_KIB,
    ) {
        require(chunkSize in 16..BackupFormat.MAX_READ_CHUNK_SIZE) {
            "chunkSize must be in 16..${BackupFormat.MAX_READ_CHUNK_SIZE}: $chunkSize"
        }
        val salt = ByteArray(BackupFormat.SALT_BYTES).also { random.nextBytes(it) }
        val noncePrefix = ByteArray(BackupFormat.NONCE_PREFIX_BYTES).also { random.nextBytes(it) }
        val kdfParams = encodeArgon2Params(argon2MemoryKib)

        val header = BackupHeader(
            formatVersion = BackupFormat.FORMAT_VERSION,
            kdfId = BackupFormat.KDF_ARGON2ID,
            kdfParams = kdfParams,
            salt = salt,
            noncePrefix = noncePrefix,
            chunkSize = chunkSize,
        )

        val headerBytes = serializeHeader(header)
        output.write(headerBytes)
        output.flush()

        val key = deriveKey(password, salt, kdfParams)
        try {
            val totalChunks = encryptBody(input, output, key, header, headerBytes)
            // Empty plaintext would skip Argon2 on decrypt, masking wrong-password errors.
            // Real backups always emit at least a manifest entry; refuse the degenerate case.
            if (totalChunks == 0) {
                throw IllegalStateException("Refusing to encrypt empty plaintext")
            }
            writeFooter(output, totalChunks)
            output.flush()
        } finally {
            Arrays.fill(key, 0.toByte())
        }
    }

    fun decrypt(input: InputStream, output: OutputStream, password: CharArray) {
        val header = readHeader(input)
        val headerBytes = serializeHeader(header)
        decryptBody(input, output, password, header, headerBytes)
        output.flush()
    }

    private fun deriveKey(password: CharArray, salt: ByteArray, kdfParams: ByteArray): ByteArray {
        val argon2 = decodeArgon2Params(kdfParams)
        val params = Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
            .withVersion(Argon2Parameters.ARGON2_VERSION_13)
            .withSalt(salt)
            .withMemoryAsKB(argon2.memoryKib)
            .withIterations(argon2.iterations)
            .withParallelism(argon2.parallelism)
            .build()

        val passwordBytes = passwordToBytes(password)
        try {
            val generator = Argon2BytesGenerator()
            generator.init(params)
            val out = ByteArray(BackupFormat.KEY_BYTES)
            try {
                generator.generateBytes(passwordBytes, out)
            } catch (e: OutOfMemoryError) {
                throw IllegalStateException(
                    "Not enough RAM to derive backup key (need ${argon2.memoryKib} KiB)",
                    e,
                )
            }
            return out
        } finally {
            Arrays.fill(passwordBytes, 0.toByte())
        }
    }

    private fun encryptBody(
        input: InputStream,
        output: OutputStream,
        key: ByteArray,
        header: BackupHeader,
        headerBytes: ByteArray,
    ): Int {
        val secretKey = SecretKeySpec(key, "AES")
        val buffer = ByteArray(header.chunkSize)
        val dataOut = DataOutputStream(output)
        // One Cipher reused across chunks; init() per chunk binds a fresh nonce.
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        var chunkIndex = 0

        try {
            while (true) {
                val read = readFully(input, buffer, header.chunkSize)
                if (read == 0) break

                val nonce = chunkNonce(header.noncePrefix, chunkIndex)
                val spec = GCMParameterSpec(BackupFormat.GCM_TAG_BITS, nonce)
                cipher.init(Cipher.ENCRYPT_MODE, secretKey, spec)
                cipher.updateAAD(chunkAad(headerBytes, chunkIndex))
                val ciphertextWithTag = cipher.doFinal(buffer, 0, read)

                dataOut.writeInt(read)
                dataOut.write(ciphertextWithTag)
                Arrays.fill(ciphertextWithTag, 0.toByte())
                chunkIndex++

                if (read < header.chunkSize) break
            }
        } finally {
            Arrays.fill(buffer, 0.toByte())
        }

        return chunkIndex
    }

    private fun decryptBody(
        input: InputStream,
        output: OutputStream,
        password: CharArray,
        header: BackupHeader,
        headerBytes: ByteArray,
    ) {
        val dataIn = DataInputStream(input)
        // One Cipher reused across chunks; init() per chunk binds a fresh nonce.
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        var chunkIndex = 0
        var key: ByteArray? = null
        var secretKey: SecretKeySpec? = null

        try {
            while (true) {
                val plainLen = try {
                    dataIn.readInt()
                } catch (e: EOFException) {
                    throw BackupException(BackupError.TRUNCATED, "Stream ended before footer", e)
                }

                if (plainLen == BackupFormat.END_MARKER) {
                    val declared = try {
                        dataIn.readInt()
                    } catch (e: EOFException) {
                        throw BackupException(BackupError.TRUNCATED, "Missing totalChunks footer", e)
                    }
                    if (declared != chunkIndex) {
                        throw BackupException(
                            BackupError.TRUNCATED,
                            "Chunk count mismatch: header=$declared actual=$chunkIndex"
                        )
                    }
                    return
                }

                if (plainLen <= 0 || plainLen > header.chunkSize) {
                    throw BackupException(BackupError.TAMPERED, "Invalid chunk length: $plainLen")
                }

                val ciphertextWithTag = ByteArray(plainLen + BackupFormat.GCM_TAG_BYTES)
                try {
                    dataIn.readFully(ciphertextWithTag)
                } catch (e: EOFException) {
                    throw BackupException(BackupError.TRUNCATED, "Chunk $chunkIndex truncated", e)
                }

                // Defer Argon2 (~hundreds of ms) until we know at least one chunk exists.
                if (key == null) {
                    key = deriveKey(password, header.salt, header.kdfParams)
                    secretKey = SecretKeySpec(key, "AES")
                }

                val nonce = chunkNonce(header.noncePrefix, chunkIndex)
                val spec = GCMParameterSpec(BackupFormat.GCM_TAG_BITS, nonce)
                cipher.init(Cipher.DECRYPT_MODE, secretKey, spec)
                cipher.updateAAD(chunkAad(headerBytes, chunkIndex))

                val plaintext = try {
                    cipher.doFinal(ciphertextWithTag)
                } catch (e: AEADBadTagException) {
                    // Chunk 0 binds the header in AAD - tag fail there is indistinguishable from wrong password.
                    val reason = if (chunkIndex == 0) BackupError.WRONG_PASSWORD else BackupError.TAMPERED
                    val message = if (chunkIndex == 0) {
                        "Wrong password or corrupted backup header"
                    } else {
                        "GCM tag check failed at chunk $chunkIndex"
                    }
                    throw BackupException(reason, message, e)
                }

                output.write(plaintext)
                Arrays.fill(plaintext, 0.toByte())
                Arrays.fill(ciphertextWithTag, 0.toByte())
                chunkIndex++
            }
        } finally {
            key?.let { Arrays.fill(it, 0.toByte()) }
        }
    }

    // Header is bound into every chunk's AAD; any flip fails decryption.
    private fun serializeHeader(header: BackupHeader): ByteArray {
        val buf = ByteBuffer.allocate(BackupFormat.HEADER_BYTES).order(ByteOrder.BIG_ENDIAN)
        buf.put(BackupFormat.MAGIC.toByteArray(StandardCharsets.US_ASCII))
        buf.put(header.formatVersion)
        buf.put(header.kdfId)
        buf.put(header.kdfParams)
        buf.put(header.salt)
        buf.put(header.noncePrefix)
        buf.putInt(header.chunkSize)
        buf.put(ByteArray(6))
        return buf.array()
    }

    fun readHeader(input: InputStream): BackupHeader {
        val raw = ByteArray(BackupFormat.HEADER_BYTES)
        try {
            DataInputStream(input).readFully(raw)
        } catch (e: EOFException) {
            throw BackupException(BackupError.TRUNCATED, "Header shorter than expected", e)
        }

        val magic = String(raw, 0, BackupFormat.MAGIC_BYTES, StandardCharsets.US_ASCII)
        if (magic != BackupFormat.MAGIC) {
            throw BackupException(BackupError.BAD_MAGIC, "Magic was '$magic'")
        }

        val buf = ByteBuffer.wrap(raw).order(ByteOrder.BIG_ENDIAN)
        buf.position(BackupFormat.MAGIC_BYTES)
        val formatVersion = buf.get()
        if (formatVersion != BackupFormat.FORMAT_VERSION) {
            throw BackupException(BackupError.UNSUPPORTED_VERSION, "version=$formatVersion")
        }

        val kdfId = buf.get()
        if (kdfId != BackupFormat.KDF_ARGON2ID) {
            throw BackupException(BackupError.UNSUPPORTED_KDF, "kdfId=$kdfId")
        }

        val kdfParams = ByteArray(BackupFormat.KDF_PARAMS_BYTES).also { buf.get(it) }
        val salt = ByteArray(BackupFormat.SALT_BYTES).also { buf.get(it) }
        val noncePrefix = ByteArray(BackupFormat.NONCE_PREFIX_BYTES).also { buf.get(it) }
        val chunkSize = buf.getInt()

        // Mirrors BackupHeader.init bounds; raises BackupException not IllegalArgumentException.
        if (chunkSize < 16 || chunkSize > BackupFormat.MAX_READ_CHUNK_SIZE) {
            throw BackupException(BackupError.TAMPERED, "chunkSize out of range: $chunkSize")
        }

        return BackupHeader(formatVersion, kdfId, kdfParams, salt, noncePrefix, chunkSize)
    }

    private fun writeFooter(output: OutputStream, totalChunks: Int) {
        val buf = ByteBuffer.allocate(BackupFormat.FOOTER_BYTES).order(ByteOrder.BIG_ENDIAN)
        buf.putInt(BackupFormat.END_MARKER)
        buf.putInt(totalChunks)
        output.write(buf.array())
    }

    private fun encodeArgon2Params(memoryKib: Int): ByteArray {
        val buf = ByteBuffer.allocate(BackupFormat.KDF_PARAMS_BYTES).order(ByteOrder.BIG_ENDIAN)
        buf.putInt(memoryKib)
        buf.putInt(BackupFormat.ARGON2_ITERATIONS)
        buf.putInt(BackupFormat.ARGON2_PARALLELISM)
        buf.putInt(0)
        return buf.array()
    }

    private fun decodeArgon2Params(params: ByteArray): Argon2Params {
        val buf = ByteBuffer.wrap(params).order(ByteOrder.BIG_ENDIAN)
        val memoryKib = buf.getInt()
        val iterations = buf.getInt()
        val parallelism = buf.getInt()
        val reserved = buf.getInt()
        // Bounds reject weaker-than-we-produce floors and DoS-via-huge-memory ceilings.
        if (memoryKib !in BackupFormat.ARGON2_MEMORY_KIB_LOW_RAM..BackupFormat.ARGON2_MEMORY_KIB) {
            throw BackupException(BackupError.TAMPERED, "Argon2 memory out of range: $memoryKib")
        }
        if (iterations !in BackupFormat.ARGON2_ITERATIONS..BackupFormat.ARGON2_ITERATIONS_MAX) {
            throw BackupException(BackupError.TAMPERED, "Argon2 iterations out of range: $iterations")
        }
        if (parallelism !in 1..BackupFormat.ARGON2_PARALLELISM_MAX) {
            throw BackupException(BackupError.TAMPERED, "Argon2 parallelism out of range: $parallelism")
        }
        if (reserved != 0) {
            throw BackupException(BackupError.TAMPERED, "Reserved kdfParams bytes nonzero: $reserved")
        }
        return Argon2Params(memoryKib, iterations, parallelism)
    }

    private fun chunkNonce(noncePrefix: ByteArray, chunkIndex: Int): ByteArray {
        val nonce = ByteArray(BackupFormat.GCM_NONCE_BYTES)
        ByteBuffer.wrap(nonce).order(ByteOrder.BIG_ENDIAN)
            .put(noncePrefix)
            .putInt(chunkIndex)
        return nonce
    }

    private fun chunkAad(headerBytes: ByteArray, chunkIndex: Int): ByteArray {
        val buf = ByteBuffer.allocate(headerBytes.size + 4).order(ByteOrder.BIG_ENDIAN)
        buf.put(headerBytes)
        buf.putInt(chunkIndex)
        return buf.array()
    }

    private fun readFully(input: InputStream, buffer: ByteArray, want: Int): Int {
        var total = 0
        while (total < want) {
            val read = input.read(buffer, total, want - total)
            if (read < 0) break
            total += read
        }
        return total
    }

    // Encode into a buffer we own so the intermediate UTF-8 bytes are wiped.
    // (The upstream JVM String from the RN bridge is still uncleanable.)
    private fun passwordToBytes(password: CharArray): ByteArray {
        val encoder = StandardCharsets.UTF_8.newEncoder()
        val maxBytes = (password.size * encoder.maxBytesPerChar()).toInt().coerceAtLeast(1)
        val owned = ByteBuffer.allocate(maxBytes)
        try {
            val charBuf = CharBuffer.wrap(password)
            val r1 = encoder.encode(charBuf, owned, true)
            if (r1.isError) r1.throwException()
            val r2 = encoder.flush(owned)
            if (r2.isError) r2.throwException()
            val out = ByteArray(owned.position())
            owned.flip()
            owned.get(out)
            return out
        } finally {
            Arrays.fill(owned.array(), 0.toByte())
        }
    }
}
