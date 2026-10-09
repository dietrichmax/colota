/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.location

import com.google.android.gms.location.Priority
import org.junit.Assert.assertEquals
import org.junit.Test

class GmsLocationProviderTest {

    @Test
    fun `maps high accuracy to the high accuracy priority`() {
        assertEquals(Priority.PRIORITY_HIGH_ACCURACY, GmsLocationProvider.priorityFor(LocationAccuracy.HIGH))
        assertEquals(100, GmsLocationProvider.priorityFor(LocationAccuracy.HIGH))
    }

    @Test
    fun `maps balanced accuracy to the balanced power priority`() {
        assertEquals(
            Priority.PRIORITY_BALANCED_POWER_ACCURACY,
            GmsLocationProvider.priorityFor(LocationAccuracy.BALANCED)
        )
        assertEquals(102, GmsLocationProvider.priorityFor(LocationAccuracy.BALANCED))
    }
}
