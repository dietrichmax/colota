/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.location

import android.content.Context
import android.location.Location
import android.os.Looper
import com.Colota.util.AppLogger
import com.google.android.gms.location.*

/** FusedLocationProviderClient-based provider for GMS flavor. */
class GmsLocationProvider(context: Context) : LocationProvider {

    companion object {
        private const val TAG = "GmsLocationProvider"

        /** Pure mode → GMS priority mapping, kept free of side effects so it is unit-testable. */
        internal fun priorityFor(accuracy: LocationAccuracy): Int = when (accuracy) {
            LocationAccuracy.HIGH -> Priority.PRIORITY_HIGH_ACCURACY
            LocationAccuracy.BALANCED -> Priority.PRIORITY_BALANCED_POWER_ACCURACY
        }
    }

    private val fusedClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    private val callbackMap = java.util.concurrent.ConcurrentHashMap<LocationUpdateCallback, LocationCallback>()

    override fun requestLocationUpdates(
        intervalMs: Long,
        minDistanceMeters: Float,
        accuracy: LocationAccuracy,
        looper: Looper,
        callback: LocationUpdateCallback
    ) {
        val gmsCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.locations.forEach { callback.onLocationUpdate(it) }
            }
        }
        callbackMap[callback] = gmsCallback

        val request = LocationRequest.Builder(priorityFor(accuracy), intervalMs)
            .setMinUpdateIntervalMillis(intervalMs)
            .setMinUpdateDistanceMeters(minDistanceMeters)
            .build()

        try {
            fusedClient.requestLocationUpdates(request, gmsCallback, looper)
            AppLogger.d(TAG, "Started FusedLocationProvider updates: interval=${intervalMs}ms, distance=${minDistanceMeters}m, accuracy=${accuracy.wireName}")
        } catch (e: SecurityException) {
            callbackMap.remove(callback)
            throw e
        }
    }

    override fun removeLocationUpdates(callback: LocationUpdateCallback) {
        callbackMap.remove(callback)?.let {
            fusedClient.removeLocationUpdates(it)
            AppLogger.d(TAG, "Stopped location updates")
        }
    }

    override fun getLastLocation(
        onSuccess: (Location?) -> Unit,
        onFailure: (Exception) -> Unit
    ) {
        try {
            fusedClient.lastLocation
                .addOnSuccessListener { onSuccess(it) }
                .addOnFailureListener { onFailure(it) }
        } catch (e: SecurityException) {
            onFailure(e)
        }
    }

    override fun getCurrentLocation(timeoutMs: Long, onResult: (Location?) -> Unit) {
        // Intentionally always High accuracy (#951), regardless of the configured stream mode: this
        // one-shot probe decides pause-zone exit, the watchdog and the stationary heartbeat.
        // setMaxUpdateAgeMillis(0) forbids the cached fix, forcing a real GNSS acquisition.
        val request = CurrentLocationRequest.Builder()
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .setMaxUpdateAgeMillis(0)
            .setDurationMillis(timeoutMs)
            .build()
        try {
            fusedClient.getCurrentLocation(request, null)
                .addOnSuccessListener { onResult(it) }
                .addOnFailureListener { onResult(null) }
            AppLogger.d(TAG, "Requested fresh fused fix (maxAge=0, timeout=${timeoutMs}ms)")
        } catch (e: Exception) {
            // Broad: a synchronous throw before the Task is wired must still deliver, or the caller's
            // in-flight guard latches and every future probe is throttled. Mirrors the FOSS provider.
            AppLogger.w(TAG, "Fresh fused fix failed: ${e.message}")
            onResult(null)
        }
    }
}
