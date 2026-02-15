/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.location

import android.location.Location
import android.os.Looper

/**
 * Abstraction over platform location services.
 * Implementations: GmsLocationProvider (Google Play), NativeLocationProvider (FOSS).
 */
interface LocationProvider {

    /**
     * Request continuous location updates.
     *
     * @param intervalMs        Desired update interval in milliseconds.
     * @param minDistanceMeters Minimum distance between updates in meters.
     * @param looper            Looper on which callbacks are dispatched.
     * @param callback          Receives each location update.
     */
    fun requestLocationUpdates(
        intervalMs: Long,
        minDistanceMeters: Float,
        looper: Looper,
        callback: LocationUpdateCallback
    )

    /**
     * Stop receiving location updates for the given callback.
     */
    fun removeLocationUpdates(callback: LocationUpdateCallback)

    /**
     * Asynchronously retrieve the last known location.
     *
     * @param onSuccess Called with the location, or null if unavailable.
     * @param onFailure Called if the request fails entirely.
     */
    fun getLastLocation(
        onSuccess: (Location?) -> Unit,
        onFailure: (Exception) -> Unit
    )
}

/**
 * Callback interface for location updates.
 * Each implementation wraps this into its platform-specific listener.
 */
interface LocationUpdateCallback {
    fun onLocationUpdate(location: Location)
}
