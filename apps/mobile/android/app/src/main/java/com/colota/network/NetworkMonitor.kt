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
import android.os.Build
import com.Colota.util.AppLogger
import com.Colota.util.TimedCache
import java.util.concurrent.atomic.AtomicInteger

/**
 * Watches the device's network state: availability, metering, Wi-Fi, its name and VPN.
 */
class NetworkMonitor(context: Context) {

    companion object {
        private const val TAG = "NetworkMonitor"
        private const val NETWORK_CHECK_CACHE_MS = 5000L
    }

    private val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    @Volatile var currentSsid: String = ""
        private set
    @Volatile private var isVpn: Boolean = false
    @Volatile private var isWifi: Boolean = false
    @Volatile private var ssidTracking: Boolean = false
    /** Notified on the callback thread when the transport, VPN or SSID state actually changes. */
    @Volatile private var wifiStateListener: (() -> Unit)? = null
    // What the listener last saw; callbacks fire for bandwidth and validation churn too.
    private var notifiedWifi = false
    private var notifiedVpn = false
    private var notifiedSsid = ""
    /** Connected Wi-Fi networks, counted so losing one of several does not clear the state. */
    private val availableWifiNetworks = AtomicInteger(0)
    private val wifiNames = WifiNameReader(context, connectivityManager)

    private var networkCallback = createNetworkCallback(withSsid = false)

    /**
     * Tracks connected Wi-Fi networks by transport alone. It carries no location flag, so it can
     * stay registered for the manager's lifetime without lighting the privacy indicator, and it
     * sees Wi-Fi even when a VPN owns the default network.
     */
    private val wifiTransportCallback = object : ConnectivityManager.NetworkCallback() {
        // A switch between two networks keeps the count above zero, so notify even when isWifi stays true
        override fun onAvailable(network: Network) {
            availableWifiNetworks.incrementAndGet()
            refreshWifiTransport(force = true)
        }

        override fun onLost(network: Network) {
            availableWifiNetworks.updateAndGet { maxOf(0, it - 1) }
            refreshWifiTransport(force = true)
        }
    }

    /**
     * The mockable android.jar cannot build a request, so a JVM test without a Builder mock gets
     * null and skips the registration; on device this never fails.
     */
    private val wifiRequest: NetworkRequest? by lazy {
        try {
            NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .build()
        } catch (e: Exception) {
            AppLogger.w(TAG, "Wi-Fi transport request unavailable: ${e.message}")
            null
        }
    }

    /**
     * The location-flagged callback notes FINE_LOCATION on every delivery, which lights the privacy
     * indicator with GPS stopped. Register it only while the SSID is needed; VPN state needs no flag.
     */
    @Synchronized
    fun setSsidTracking(enabled: Boolean) {
        if (enabled == ssidTracking) return
        try {
            connectivityManager.unregisterNetworkCallback(networkCallback)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to unregister network callback", e)
        }
        networkCallback = createNetworkCallback(withSsid = enabled)
        try {
            connectivityManager.registerDefaultNetworkCallback(networkCallback)
            // Committed only once a callback is live, so a failed swap can be retried.
            ssidTracking = enabled
            // A cleared cache must not notify later as if the name just changed.
            if (!enabled) {
                currentSsid = ""
                notifiedSsid = ""
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to register network callback", e)
        }
    }

    /**
     * One-shot SSID read: the flagged callback is registered for this call only. The probe asks for
     * a Wi-Fi network rather than the default one, so it also reads the name under a VPN, where the
     * default network is the tunnel and carries no Wi-Fi info.
     */
    fun readSsidOnce(onResult: (String) -> Unit) {
        // A live value avoids a second flagged probe; a blank one still probes (VPN, or not yet read).
        if (ssidTracking && currentSsid.isNotBlank()) {
            onResult(currentSsid)
            return
        }

        wifiNames.probe(wifiRequest, onResult)
    }

    private fun createNetworkCallback(withSsid: Boolean): ConnectivityManager.NetworkCallback {
        fun update(caps: NetworkCapabilities) {
            if (withSsid) currentSsid = wifiNames.read(caps)
            isVpn = caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
            notifyWifiStateIfChanged()
        }
        fun clear() {
            currentSsid = ""
            isVpn = false
            notifyWifiStateIfChanged()
        }

        return if (withSsid && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            object : ConnectivityManager.NetworkCallback(FLAG_INCLUDE_LOCATION_INFO) {
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) = update(caps)
                override fun onLost(network: Network) = clear()
            }
        } else {
            object : ConnectivityManager.NetworkCallback() {
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) = update(caps)
                override fun onLost(network: Network) = clear()
            }
        }
    }

    private fun refreshWifiTransport(force: Boolean) {
        isWifi = availableWifiNetworks.get() > 0
        notifyWifiStateIfChanged(force)
    }

    /** Profile evaluation is not free, so only real state changes reach the listener, unless forced. */
    @Synchronized
    private fun notifyWifiStateIfChanged(force: Boolean = false) {
        val ssid = if (ssidTracking) currentSsid else ""
        if (!force && isWifi == notifiedWifi && isVpn == notifiedVpn && ssid == notifiedSsid) return
        notifiedWifi = isWifi
        notifiedVpn = isVpn
        notifiedSsid = ssid
        wifiStateListener?.invoke()
    }

    init {
        try {
            connectivityManager.registerDefaultNetworkCallback(networkCallback)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to register network callback", e)
        }
        wifiRequest?.let { request ->
            try {
                connectivityManager.registerNetworkCallback(request, wifiTransportCallback)
            } catch (e: Exception) {
                AppLogger.e(TAG, "Failed to register Wi-Fi transport callback", e)
            }
        }
    }

    private val networkCache = TimedCache(NETWORK_CHECK_CACHE_MS) {
        try {
            val network = connectivityManager.activeNetwork
            val capabilities = connectivityManager.getNetworkCapabilities(network)
            capabilities != null &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Network check failed", e)
            false
        }
    }

    /**
     * Checks for an active, validated internet connection with caching.
     */
    fun isNetworkAvailable(): Boolean = networkCache.get()

    private val unmeteredCache = TimedCache(NETWORK_CHECK_CACHE_MS) {
        try {
            val network = connectivityManager.activeNetwork
            val capabilities = connectivityManager.getNetworkCapabilities(network)
            capabilities != null &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Unmetered check failed", e)
            false
        }
    }

    /**
     * Returns true when the active network is unmetered (Wi-Fi, Ethernet, etc.).
     * Cached for [NETWORK_CHECK_CACHE_MS] to avoid repeated IPC calls.
     */
    fun isUnmeteredConnection(): Boolean = unmeteredCache.get()

    /**
     * Returns true when connected to a WiFi network matching the given SSID.
     * Only meaningful while setSsidTracking(true) holds the location-flagged callback.
     */
    fun isConnectedToSsid(ssid: String): Boolean {
        if (ssid.isBlank()) return false
        return currentSsid.equals(ssid, ignoreCase = true)
    }

    /** True while any Wi-Fi network is connected, also under a VPN. Needs no location-flagged callback. */
    fun isWifiConnected(): Boolean = isWifi

    /**
     * Registers a callback for Wi-Fi connection, VPN and SSID changes, and for every Wi-Fi network
     * that comes or goes. The listener runs on the ConnectivityManager callback thread; callers that
     * touch app state must marshal it themselves.
     * Used by the profile Wi-Fi conditions, which care about more than sync's one boolean.
     */
    fun setWifiStateListener(listener: (() -> Unit)?) {
        wifiStateListener = listener
    }

    /**
     * Returns true when the active network uses a VPN transport.
     * Updated via NetworkCallback.
     */
    fun isVpnConnected(): Boolean = isVpn

    fun destroy() {
        wifiStateListener = null
        try {
            connectivityManager.unregisterNetworkCallback(networkCallback)
        } catch (_: Exception) {}
        try {
            connectivityManager.unregisterNetworkCallback(wifiTransportCallback)
        } catch (_: Exception) {}
    }
}
