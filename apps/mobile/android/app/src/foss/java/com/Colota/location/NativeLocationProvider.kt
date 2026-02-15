/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.location

import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper

/**
 * Location provider backed by Android's native LocationManager.
 * Used in the FOSS product flavor (F-Droid distribution, no Google Play Services).
 * Uses GPS_PROVIDER as primary (equivalent to PRIORITY_HIGH_ACCURACY).
 */
class NativeLocationProvider(context: Context) : LocationProvider {

    private val locationManager: LocationManager =
        context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    private val listenerMap = mutableMapOf<LocationUpdateCallback, LocationListener>()

    override fun requestLocationUpdates(
        intervalMs: Long,
        minDistanceMeters: Float,
        looper: Looper,
        callback: LocationUpdateCallback
    ) {
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                callback.onLocationUpdate(location)
            }
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
        }
        listenerMap[callback] = listener

        try {
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                intervalMs,
                minDistanceMeters,
                listener,
                looper
            )
        } catch (e: SecurityException) {
            listenerMap.remove(callback)
            throw e
        }
    }

    override fun removeLocationUpdates(callback: LocationUpdateCallback) {
        listenerMap.remove(callback)?.let { locationManager.removeUpdates(it) }
    }

    override fun getLastLocation(
        onSuccess: (Location?) -> Unit,
        onFailure: (Exception) -> Unit
    ) {
        try {
            val location = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                ?: locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            onSuccess(location)
        } catch (e: SecurityException) {
            onFailure(e)
        }
    }
}
