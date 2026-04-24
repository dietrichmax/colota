/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.location

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import com.Colota.util.AppLogger

/**
 * LocationManager-based GPS provider for FOSS flavor (no Google Play Services).
 */
@SuppressLint("MissingPermission")
class NativeLocationProvider(context: Context) : LocationProvider {

    companion object {
        private const val TAG = "NativeLocationProvider"
    }

    private val locationManager: LocationManager =
        context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    private val listenerMap = java.util.concurrent.ConcurrentHashMap<LocationUpdateCallback, LocationListener>()

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
            @Deprecated("Deprecated in API 29")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
        }

        try {
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                intervalMs,
                minDistanceMeters,
                listener,
                looper
            )
            AppLogger.d(TAG, "Started GPS_PROVIDER updates: interval=${intervalMs}ms, distance=${minDistanceMeters}m")
        } catch (e: SecurityException) {
            locationManager.removeUpdates(listener)
            throw e
        }

        listenerMap[callback] = listener
    }

    override fun removeLocationUpdates(callback: LocationUpdateCallback) {
        listenerMap.remove(callback)?.let { listener ->
            locationManager.removeUpdates(listener)
            AppLogger.d(TAG, "Stopped GPS_PROVIDER updates")
        }
    }

    override fun getLastLocation(
        onSuccess: (Location?) -> Unit,
        onFailure: (Exception) -> Unit
    ) {
        try {
            onSuccess(locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER))
        } catch (e: SecurityException) {
            onFailure(e)
        }
    }
}
