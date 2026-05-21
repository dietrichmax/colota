/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.backup

import kotlin.math.ln
import kotlin.math.min

// Authoritative scoring. Used by createBackup (gate) and the JS strength meter (via bridge).
object PasswordStrength {

    const val MIN_LENGTH = 12
    private const val MIN_BITS = 50.0

    data class Result(val score: Int, val label: String, val bits: Double)

    fun evaluate(password: CharArray): Result {
        if (password.isEmpty()) return Result(0, "", 0.0)
        if (password.size < MIN_LENGTH) return Result(0, "Too short", 0.0)
        val b = bits(password)
        return when {
            b < MIN_BITS -> Result(1, "Weak", b)
            b < 70.0 -> Result(2, "OK", b)
            b < 90.0 -> Result(3, "Good", b)
            else -> Result(4, "Strong", b)
        }
    }

    // CharArray rather than String so password material stays wipeable end-to-end.
    private fun bits(password: CharArray): Double {
        if (password.size < MIN_LENGTH) return 0.0

        var charset = 0
        if (password.any { it in 'a'..'z' }) charset += 26
        if (password.any { it in 'A'..'Z' }) charset += 26
        if (password.any { it in '0'..'9' }) charset += 10
        // ASCII-only check; Unicode letters (e.g. 'é', Cyrillic) get the punctuation bonus.
        if (password.any { it !in 'a'..'z' && it !in 'A'..'Z' && it !in '0'..'9' }) charset += 32

        if (charset == 0) return 0.0
        var bits = password.size * (ln(charset.toDouble()) / ln(2.0))

        val uniqueChars = password.toSet().size
        if (uniqueChars < 4) bits = min(bits, 20.0)

        if (looksSequential(password)) bits = min(bits, 30.0)

        return bits
    }

    fun isAcceptable(password: CharArray): Boolean = bits(password) >= MIN_BITS

    private fun looksSequential(password: CharArray): Boolean {
        for (i in 0..password.size - 4) {
            val c0 = password[i].code
            val c1 = password[i + 1].code
            val c2 = password[i + 2].code
            val c3 = password[i + 3].code
            if (c1 - c0 == 1 && c2 - c1 == 1 && c3 - c2 == 1) return true
            if (c0 - c1 == 1 && c1 - c2 == 1 && c2 - c3 == 1) return true
        }
        return false
    }
}
