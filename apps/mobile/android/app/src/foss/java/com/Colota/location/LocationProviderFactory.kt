/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.location

import android.content.Context

/**
 * Factory for the FOSS product flavor.
 * Returns a LocationProvider backed by Android's native LocationManager.
 */
object LocationProviderFactory {
    fun create(context: Context): LocationProvider = NativeLocationProvider(context)
}
