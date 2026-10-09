/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.location

import org.junit.Assert.assertEquals
import org.junit.Test

class LocationAccuracyTest {

    @Test
    fun `parses both wire names`() {
        assertEquals(LocationAccuracy.HIGH, LocationAccuracy.fromWire("high"))
        assertEquals(LocationAccuracy.BALANCED, LocationAccuracy.fromWire("balanced"))
    }

    @Test
    fun `parses case-insensitively and tolerates surrounding whitespace`() {
        assertEquals(LocationAccuracy.HIGH, LocationAccuracy.fromWire("HIGH"))
        assertEquals(LocationAccuracy.BALANCED, LocationAccuracy.fromWire("Balanced"))
        assertEquals(LocationAccuracy.BALANCED, LocationAccuracy.fromWire("  balanced "))
    }

    @Test
    fun `falls back to high for unknown, empty or missing values`() {
        assertEquals(LocationAccuracy.HIGH, LocationAccuracy.fromWire(null))
        assertEquals(LocationAccuracy.HIGH, LocationAccuracy.fromWire(""))
        assertEquals(LocationAccuracy.HIGH, LocationAccuracy.fromWire("low_power"))
    }
}
