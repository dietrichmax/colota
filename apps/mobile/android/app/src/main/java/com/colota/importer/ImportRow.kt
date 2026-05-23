/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.importer

/** Normalised location row produced by a parser. Timestamp is Unix seconds. */
data class ImportRow(
    val timestamp: Long,
    val latitude: Double,
    val longitude: Double,
    val accuracy: Int?,
    val altitude: Int?,
    val speed: Int?,
    val bearing: Double?,
    val battery: Int?,
)
