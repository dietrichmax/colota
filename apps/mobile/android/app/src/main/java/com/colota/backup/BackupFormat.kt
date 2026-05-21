/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.backup

/**
 * On-disk layout of an encrypted Colota backup file.
 *
 * Header (76 bytes, plaintext):
 *   magic         8   "COLOTABK" (version-agnostic; dispatch on formatVer)
 *   formatVer     1
 *   kdfId         1   0=Argon2id (1=PBKDF2 reserved)
 *   kdfParams    16   algorithm-specific
 *   salt         32   random per backup
 *   noncePrefix   8   random; combined with 4-byte chunk index to form
 *                     the 12-byte AES-GCM nonce
 *   chunkSize     4   uint32 BE, plaintext bytes per chunk
 *   reserved      6   zero
 *
 * Body (repeated):
 *   plainLen      4   uint32 BE, 1..chunkSize for each chunk
 *   ciphertext  plainLen
 *   gcmTag       16
 *
 * Footer (8 bytes):
 *   endMarker     4   0xFFFFFFFF (sentinel; never a valid plainLen)
 *   totalChunks   4   uint32 BE, used to detect truncation pre-decrypt
 */
object BackupFormat {
    const val MAGIC = "COLOTABK"
    const val MAGIC_BYTES = 8
    const val FORMAT_VERSION: Byte = 1

    const val KDF_ARGON2ID: Byte = 0
    const val KDF_PBKDF2: Byte = 1

    const val KDF_PARAMS_BYTES = 16
    const val SALT_BYTES = 32
    // 8 bytes is enough since the per-backup salt makes the key unique per file.
    const val NONCE_PREFIX_BYTES = 8
    const val GCM_NONCE_BYTES = 12
    const val GCM_TAG_BYTES = 16
    const val GCM_TAG_BITS = 128
    const val KEY_BYTES = 32

    const val DEFAULT_CHUNK_SIZE = 1024 * 1024
    // Reader-side cap so a hostile chunkSize can't OOM low-RAM devices.
    const val MAX_READ_CHUNK_SIZE = 4 * 1024 * 1024

    const val HEADER_BYTES = MAGIC_BYTES + 1 + 1 + KDF_PARAMS_BYTES +
            SALT_BYTES + NONCE_PREFIX_BYTES + 4 + 6

    const val END_MARKER: Int = -1
    const val FOOTER_BYTES = 8

    const val ARGON2_MEMORY_KIB = 64 * 1024
    const val ARGON2_MEMORY_KIB_LOW_RAM = 32 * 1024
    const val ARGON2_ITERATIONS = 3
    const val ARGON2_ITERATIONS_MAX = 10
    const val ARGON2_PARALLELISM = 1
    // Validation upper bound; widened past the producer default so future bumps don't reject old decoders.
    const val ARGON2_PARALLELISM_MAX = 16
}

data class BackupHeader(
    val formatVersion: Byte,
    val kdfId: Byte,
    val kdfParams: ByteArray,
    val salt: ByteArray,
    val noncePrefix: ByteArray,
    val chunkSize: Int,
) {
    init {
        require(kdfParams.size == BackupFormat.KDF_PARAMS_BYTES)
        require(salt.size == BackupFormat.SALT_BYTES)
        require(noncePrefix.size == BackupFormat.NONCE_PREFIX_BYTES)
        require(chunkSize in 16..BackupFormat.MAX_READ_CHUNK_SIZE) { "chunkSize out of range: $chunkSize" }
    }

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is BackupHeader) return false
        return formatVersion == other.formatVersion &&
                kdfId == other.kdfId &&
                kdfParams.contentEquals(other.kdfParams) &&
                salt.contentEquals(other.salt) &&
                noncePrefix.contentEquals(other.noncePrefix) &&
                chunkSize == other.chunkSize
    }

    override fun hashCode(): Int {
        var result = formatVersion.toInt()
        result = 31 * result + kdfId
        result = 31 * result + kdfParams.contentHashCode()
        result = 31 * result + salt.contentHashCode()
        result = 31 * result + noncePrefix.contentHashCode()
        result = 31 * result + chunkSize
        return result
    }
}

internal data class Argon2Params(
    val memoryKib: Int,
    val iterations: Int,
    val parallelism: Int,
)

enum class BackupError {
    BAD_MAGIC,
    UNSUPPORTED_VERSION,
    UNSUPPORTED_KDF,
    UNSUPPORTED_SCHEMA,
    MISSING_ENTRY,
    INTEGRITY_FAIL,
    TRUNCATED,
    TAMPERED,
    WRONG_PASSWORD,
    // DB swapped successfully but secrets commit failed; user must re-enter credentials.
    SECRETS_PARTIAL,
}

class BackupException(val error: BackupError, message: String? = null, cause: Throwable? = null) :
    Exception(message ?: error.name, cause)
