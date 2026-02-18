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

/**
 * Location provider backed by Android's native LocationManager.
 * Used in the FOSS product flavor (F-Droid distribution, no Google Play Services).
 * Registers both GPS_PROVIDER and NETWORK_PROVIDER for faster fixes — GPS is
 * primary but network provides a quick initial position (similar to FusedLocationProvider).
 */
@SuppressLint("MissingPermission")
class NativeLocationProvider(context: Context) : LocationProvider {

    companion object {
        /** Suppress network updates for this duration after the last GPS fix. */
        private const val GPS_SUPPRESSION_MS = 10_000L
    }

    private val locationManager: LocationManager =
        context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    /** Maps each callback to its GPS listener and optional network listener. */
    private val listenerMap = java.util.concurrent.ConcurrentHashMap<LocationUpdateCallback, List<LocationListener>>()

    /** Timestamp of last GPS fix, used to suppress redundant network updates. */
    @Volatile private var lastGpsTime: Long = 0

    override fun requestLocationUpdates(
        intervalMs: Long,
        minDistanceMeters: Float,
        looper: Looper,
        callback: LocationUpdateCallback
    ) {
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                lastGpsTime = System.currentTimeMillis()
                callback.onLocationUpdate(location)
            }
            @Deprecated("Deprecated in API 29")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
        }

        val listeners = mutableListOf<LocationListener>(listener)

        try {
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                intervalMs,
                minDistanceMeters,
                listener,
                looper
            )

            // Also register NETWORK_PROVIDER for faster initial fix (WiFi/cell).
            // GPS remains primary for accuracy; network provides coarse fallback.
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                val networkListener = object : LocationListener {
                    override fun onLocationChanged(location: Location) {
                        if (System.currentTimeMillis() - lastGpsTime > GPS_SUPPRESSION_MS) {
                            callback.onLocationUpdate(location)
                        }
                    }
                    @Deprecated("Deprecated in API 29")
                    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
                    override fun onProviderEnabled(provider: String) {}
                    override fun onProviderDisabled(provider: String) {}
                }
                listeners.add(networkListener)
                locationManager.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    intervalMs,
                    minDistanceMeters,
                    networkListener,
                    looper
                )
            }
        } catch (e: SecurityException) {
            // Clean up any listeners that were registered before the error
            listeners.forEach { locationManager.removeUpdates(it) }
            throw e
        }

        listenerMap[callback] = listeners
    }

    override fun removeLocationUpdates(callback: LocationUpdateCallback) {
        listenerMap.remove(callback)?.forEach { locationManager.removeUpdates(it) }
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
