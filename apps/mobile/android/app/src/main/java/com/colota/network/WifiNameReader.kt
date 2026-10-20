/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.Colota.util.AppLogger
import java.util.concurrent.atomic.AtomicBoolean

/** Reads the connected Wi-Fi network's name, from the capabilities on S+ and from WifiManager below. */
class WifiNameReader(context: Context, private val connectivityManager: ConnectivityManager) {

    companion object {
        private const val TAG = "NetworkMonitor"
        private const val SSID_PROBE_TIMEOUT_MS = 3000L
        /** What Android returns instead of the SSID without location permission or with Location off. */
        private const val UNKNOWN_SSID = "<unknown ssid>"
    }

    private val wifiManager = context.getSystemService(Context.WIFI_SERVICE) as? WifiManager

    fun read(caps: NetworkCapabilities?): String {
        val raw = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (caps?.transportInfo as? WifiInfo)?.ssid
        } else {
            @Suppress("DEPRECATION")
            wifiManager?.connectionInfo?.ssid
        }
        val ssid = raw?.removeSurrounding("\"") ?: ""
        // Android reports the placeholder without location permission or with Location off; treat
        // it as no name so the condition simply does not match (and the picker cannot offer it).
        return if (ssid == UNKNOWN_SSID) "" else ssid
    }

    /** Registers a location-flagged callback on [request] for one answer, blank after a timeout. */
    fun probe(request: NetworkRequest?, onResult: (String) -> Unit) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            // Below S the SSID comes from WifiManager, not the callback, so waiting on one would
            // only stall. WifiManager reports the connected network regardless of the VPN.
            onResult(read(null))
            return
        }

        if (request == null) {
            onResult("")
            return
        }

        val done = AtomicBoolean(false)
        var probe: ConnectivityManager.NetworkCallback? = null
        fun finish(ssid: String) {
            if (!done.compareAndSet(false, true)) return
            probe?.let {
                try {
                    connectivityManager.unregisterNetworkCallback(it)
                } catch (e: Exception) {
                    AppLogger.e(TAG, "Failed to unregister SSID probe", e)
                }
            }
            onResult(ssid)
        }

        probe = object : ConnectivityManager.NetworkCallback(FLAG_INCLUDE_LOCATION_INFO) {
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) = finish(read(caps))
        }

        try {
            connectivityManager.registerNetworkCallback(request, probe)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to register SSID probe", e)
            probe = null
            finish("")
            return
        }
        Handler(Looper.getMainLooper()).postDelayed({ finish("") }, SSID_PROBE_TIMEOUT_MS)
    }
}
