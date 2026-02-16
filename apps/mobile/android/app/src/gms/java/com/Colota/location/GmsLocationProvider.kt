/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.location

import android.content.Context
import android.location.Location
import android.os.Looper
import com.google.android.gms.location.*

/**
 * Location provider backed by Google Play Services FusedLocationProviderClient.
 * Used in the GMS product flavor (Google Play distribution).
 */
class GmsLocationProvider(context: Context) : LocationProvider {

    private val fusedClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    private val callbackMap = java.util.concurrent.ConcurrentHashMap<LocationUpdateCallback, LocationCallback>()

    override fun requestLocationUpdates(
        intervalMs: Long,
        minDistanceMeters: Float,
        looper: Looper,
        callback: LocationUpdateCallback
    ) {
        val gmsCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.locations.forEach { callback.onLocationUpdate(it) }
            }
        }
        callbackMap[callback] = gmsCallback

        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs * 2)
            .setMinUpdateIntervalMillis(intervalMs)
            .setMinUpdateDistanceMeters(minDistanceMeters)
            .setMaxUpdateDelayMillis(intervalMs * 2)
            .build()

        try {
            fusedClient.requestLocationUpdates(request, gmsCallback, looper)
        } catch (e: SecurityException) {
            callbackMap.remove(callback)
            throw e
        }
    }

    override fun removeLocationUpdates(callback: LocationUpdateCallback) {
        callbackMap.remove(callback)?.let { fusedClient.removeLocationUpdates(it) }
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
}
