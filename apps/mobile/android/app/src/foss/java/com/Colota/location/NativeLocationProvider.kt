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
import android.location.LocationRequest
import android.os.Build
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import androidx.core.location.LocationListenerCompat
import androidx.core.location.LocationManagerCompat
import androidx.core.location.LocationRequestCompat
import androidx.core.util.Consumer
import com.Colota.util.AppLogger
import java.util.concurrent.Executor
import java.util.concurrent.atomic.AtomicBoolean

/**
 * LocationManager-based location provider for FOSS flavor (no Google Play Services).
 * Uses the platform fused provider on Android 12+ where available, raw GPS otherwise.
 */
@SuppressLint("MissingPermission")
class NativeLocationProvider(context: Context) : LocationProvider {

    companion object {
        private const val TAG = "NativeLocationProvider"

        internal fun selectProvider(locationManager: LocationManager): String =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && LocationManagerCompat.hasProvider(locationManager, LocationManager.FUSED_PROVIDER)
            ) LocationManager.FUSED_PROVIDER
            else LocationManager.GPS_PROVIDER
    }

    private val locationManager: LocationManager =
        context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    private val provider: String = selectProvider(locationManager)

    private val listenerMap = java.util.concurrent.ConcurrentHashMap<LocationUpdateCallback, LocationListener>()

    init {
        AppLogger.i(TAG, "Location provider: $provider")
    }

    override fun requestLocationUpdates(
        intervalMs: Long,
        minDistanceMeters: Float,
        looper: Looper,
        callback: LocationUpdateCallback
    ) {
        val listener = object : LocationListenerCompat {
            override fun onLocationChanged(location: Location) {
                callback.onLocationUpdate(location)
            }
        }

        // The legacy requestLocationUpdates overload runs at balanced power on API 31+,
        // which can keep the fused provider from ever engaging GNSS.
        val request = LocationRequestCompat.Builder(intervalMs)
            .setQuality(LocationRequestCompat.QUALITY_HIGH_ACCURACY)
            .setMinUpdateDistanceMeters(minDistanceMeters)
            .build()

        try {
            LocationManagerCompat.requestLocationUpdates(locationManager, provider, request, listener, looper)
            AppLogger.d(TAG, "Started $provider updates: interval=${intervalMs}ms, distance=${minDistanceMeters}m")
        } catch (e: SecurityException) {
            locationManager.removeUpdates(listener)
            throw e
        }

        listenerMap[callback] = listener
    }

    override fun removeLocationUpdates(callback: LocationUpdateCallback) {
        listenerMap.remove(callback)?.let { listener ->
            locationManager.removeUpdates(listener)
            AppLogger.d(TAG, "Stopped $provider updates")
        }
    }

    override fun getLastLocation(
        onSuccess: (Location?) -> Unit,
        onFailure: (Exception) -> Unit
    ) {
        val location = try {
            locationManager.getLastKnownLocation(provider)
        } catch (e: SecurityException) {
            onFailure(e)
            return
        } catch (e: IllegalArgumentException) {
            // The selected provider can be absent (GPS-less device, or deregistered mid-session).
            onFailure(e)
            return
        }
        onSuccess(location)
    }

    override fun getCurrentLocation(timeoutMs: Long, onResult: (Location?) -> Unit) {
        // Guard delivery so the timeout and the consumer can't both fire onResult.
        val delivered = AtomicBoolean(false)
        fun deliver(location: Location?) {
            if (delivered.compareAndSet(false, true)) onResult(location)
        }

        val handler = Handler(Looper.getMainLooper())
        val cancellationSignal = CancellationSignal()
        val timeoutRunnable = Runnable {
            cancellationSignal.cancel()
            deliver(null)
        }
        val executor = Executor { handler.post(it) }
        fun onFix(location: Location?) {
            handler.removeCallbacks(timeoutRunnable)
            deliver(location)
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Compat's getCurrentLocation has no request param and defaults to balanced power, which can
                // keep the fused provider from engaging GNSS; the platform overload forces high accuracy.
                val request = LocationRequest.Builder(0)
                    .setQuality(LocationRequest.QUALITY_HIGH_ACCURACY)
                    .setDurationMillis(timeoutMs)
                    .build()
                locationManager.getCurrentLocation(
                    provider,
                    request,
                    cancellationSignal,
                    executor,
                    java.util.function.Consumer { onFix(it) }
                )
            } else {
                LocationManagerCompat.getCurrentLocation(
                    locationManager,
                    provider,
                    cancellationSignal,
                    executor,
                    Consumer { onFix(it) }
                )
            }
            handler.postDelayed(timeoutRunnable, timeoutMs)
            AppLogger.d(TAG, "Requested fresh $provider fix (timeout=${timeoutMs}ms)")
        } catch (e: Exception) {
            AppLogger.w(TAG, "Fresh $provider fix failed: ${e.message}")
            handler.removeCallbacks(timeoutRunnable)
            deliver(null)
        }
    }
}
