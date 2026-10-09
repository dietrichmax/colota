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
     * @param accuracy          Positioning accuracy (High / Balanced) for the stream.
     * @param looper            Looper on which callbacks are dispatched.
     * @param callback          Receives each location update.
     */
    fun requestLocationUpdates(
        intervalMs: Long,
        minDistanceMeters: Float,
        accuracy: LocationAccuracy,
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

    /**
     * Actively acquire one fresh fix, forbidding cached locations.
     *
     * Always requested at High accuracy, independent of the configured stream mode (#951): this one-shot
     * probe drives pause-zone exit, the pause watchdog and the stationary heartbeat, and a network-only
     * fix could falsely exit a geofence. Best-effort on the FOSS raw-GPS path below Android 12, where the
     * compat API takes no quality hint.
     *
     * @param timeoutMs Max time to wait for the fix.
     * @param onResult  Called once with the fix, or null on timeout/failure.
     */
    fun getCurrentLocation(
        timeoutMs: Long,
        onResult: (Location?) -> Unit
    )
}

/**
 * Callback interface for location updates.
 * Each implementation wraps this into its platform-specific listener.
 */
interface LocationUpdateCallback {
    fun onLocationUpdate(location: Location)
}
