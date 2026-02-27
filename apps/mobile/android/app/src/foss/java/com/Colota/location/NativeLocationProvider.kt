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
 * LocationManager-based provider for FOSS flavor (no Google Play Services).
 * Uses GPS as primary source with NETWORK_PROVIDER as coarse fallback.
 */
@SuppressLint("MissingPermission")
class NativeLocationProvider(context: Context) : LocationProvider {

    companion object {
        private const val TAG = "NativeLocationProvider"
        /** Ignore network updates for this long after the last GPS fix. */
        private const val GPS_SUPPRESSION_MS = 10_000L
    }

    private val locationManager: LocationManager =
        context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    /** Maps callback -> [GPS listener, network listener?]. */
    private val listenerMap = java.util.concurrent.ConcurrentHashMap<LocationUpdateCallback, List<LocationListener>>()

    /** Last GPS fix time; suppresses redundant network updates. */
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

            AppLogger.d(TAG, "Started GPS_PROVIDER updates: interval=${intervalMs}ms, distance=${minDistanceMeters}m")

            // NETWORK_PROVIDER as coarse fallback for faster initial fix
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
                AppLogger.d(TAG, "Also started NETWORK_PROVIDER as fallback")
            } else {
                AppLogger.d(TAG, "NETWORK_PROVIDER not available")
            }
        } catch (e: SecurityException) {
            listeners.forEach { locationManager.removeUpdates(it) }
            throw e
        }

        listenerMap[callback] = listeners
    }

    override fun removeLocationUpdates(callback: LocationUpdateCallback) {
        listenerMap.remove(callback)?.let { listeners ->
            listeners.forEach { locationManager.removeUpdates(it) }
            AppLogger.d(TAG, "Stopped location updates (${listeners.size} listener(s))")
        }
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
