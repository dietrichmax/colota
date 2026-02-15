/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.location

import android.content.Context

/**
 * Factory for the GMS product flavor.
 * Returns a LocationProvider backed by Google Play Services.
 */
object LocationProviderFactory {
    fun create(context: Context): LocationProvider = GmsLocationProvider(context)
}
