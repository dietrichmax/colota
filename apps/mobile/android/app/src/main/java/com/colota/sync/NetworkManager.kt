package com.Colota.sync

import android.content.Context
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import com.Colota.BuildConfig
import com.Colota.util.AppLogger
import com.Colota.util.BatteryStatus
import com.Colota.util.TimedCache
import android.os.Build
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Handles all outgoing network communication for the tracking engine.
 */
class NetworkManager(private val context: Context) {

    companion object {
        private const val TAG = "NetworkManager"
        private const val CONNECTION_TIMEOUT = 10000
        private const val READ_TIMEOUT = 10000
        private const val NETWORK_CHECK_CACHE_MS = 5000L
    }

    private val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    @Volatile private var currentSsid: String = ""
    @Volatile private var isVpn: Boolean = false
    private val wifiManager = context.getSystemService(Context.WIFI_SERVICE) as? WifiManager

    private val networkCallback = createNetworkCallback()

    private fun createNetworkCallback(): ConnectivityManager.NetworkCallback {
        fun update(caps: NetworkCapabilities) {
            currentSsid = readSsid(caps)
            isVpn = caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
        }
        fun clear() {
            currentSsid = ""
            isVpn = false
        }

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
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

    private fun readSsid(caps: NetworkCapabilities): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (caps.transportInfo as? WifiInfo)?.ssid?.removeSurrounding("\"") ?: ""
        } else {
            @Suppress("DEPRECATION")
            wifiManager?.connectionInfo?.ssid?.removeSurrounding("\"") ?: ""
        }
    }

    init {
        try {
            connectivityManager.registerDefaultNetworkCallback(networkCallback)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to register network callback", e)
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
     * Sends a location payload to the configured endpoint.
     * POST sends JSON in the body; GET appends fields as query parameters.
     */
    suspend fun sendToEndpoint(
        payload: JSONObject,
        endpoint: String,
        extraHeaders: Map<String, String> = emptyMap(),
        httpMethod: String = "POST",
        apiFormat: ApiFormat = ApiFormat.FIELD_MAPPED
    ): Boolean = withContext(Dispatchers.IO) {
        if (endpoint.isBlank()) {
            AppLogger.d(TAG, "Empty endpoint provided")
            return@withContext false
        }

        val resolvedEndpoint = resolveUrlVariables(endpoint, payload)

        val url = try {
            URL(resolvedEndpoint)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Invalid URL: $resolvedEndpoint")
            return@withContext false
        }

        if (!isValidProtocol(resolvedEndpoint)) {
            AppLogger.e(TAG, "Protocol blocked or invalid: $endpoint")
            return@withContext false
        }

        if (!isNetworkAvailable()) {
            AppLogger.d(TAG, "Sync skipped: No internet")
            return@withContext false
        }

        val transformedPayload = when (apiFormat) {
            ApiFormat.TRACCAR_JSON -> buildTraccarJsonPayload(payload)
            ApiFormat.OVERLAND_BATCH -> buildOverlandBatchPayload(listOf(payload), emptyMap())
            ApiFormat.FIELD_MAPPED -> payload
        }

        val isGet = httpMethod.equals("GET", ignoreCase = true)

        val targetUrl = if (isGet) {
            val query = buildQueryString(transformedPayload)
            val separator = if (url.query != null) "&" else "?"
            URL("$resolvedEndpoint$separator$query")
        } else {
            url
        }

        var connection: HttpURLConnection? = null
        try {
            connection = buildConnection(targetUrl, isGet, extraHeaders)
            logRequest(connection, isGet, resolvedEndpoint, targetUrl, transformedPayload)
            if (!isGet) writeBody(connection, transformedPayload)
            return@withContext readResponse(connection)
        } catch (e: java.net.SocketException) {
            if (isPrivateHost(url.host ?: "") && e.message?.contains("EPERM") == true) {
                AppLogger.e(TAG, "Local network access denied - grant Local Network Access permission", e)
            } else {
                AppLogger.e(TAG, "Network error: ${e.message}", e)
            }
            false
        } catch (e: Exception) {
            AppLogger.e(TAG, "Network error: ${e.message}", e)
            false
        } finally {
            connection?.disconnect()
        }
    }

    private fun buildConnection(
        targetUrl: URL,
        isGet: Boolean,
        extraHeaders: Map<String, String>,
    ): HttpURLConnection = (targetUrl.openConnection() as HttpURLConnection).apply {
        requestMethod = if (isGet) "GET" else "POST"
        if (!isGet) {
            setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            setRequestProperty("Accept", "application/json")
            doOutput = true
        }
        extraHeaders.forEach { (key, value) -> setRequestProperty(key, value) }
        connectTimeout = CONNECTION_TIMEOUT
        readTimeout = READ_TIMEOUT
        useCaches = false
    }

    private fun writeBody(connection: HttpURLConnection, payload: JSONObject) {
        val bodyBytes = payload.toString().toByteArray(StandardCharsets.UTF_8)
        connection.setFixedLengthStreamingMode(bodyBytes.size)
        connection.outputStream.use { it.write(bodyBytes) }
    }

    private fun readResponse(connection: HttpURLConnection): Boolean {
        val responseCode = connection.responseCode
        if (responseCode in 200..299) {
            AppLogger.d(TAG, "Location successfully sent")
            return true
        }
        val errorBody = try {
            connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error body"
        } catch (_: Exception) { "Could not read error body" }
        AppLogger.e(TAG, "${connection.requestMethod} failed: $responseCode - $errorBody")
        return false
    }

    private fun logRequest(
        connection: HttpURLConnection,
        isGet: Boolean,
        resolvedEndpoint: String,
        targetUrl: URL,
        payload: JSONObject,
    ) {
        if (!BuildConfig.DEBUG) return
        AppLogger.d(TAG, "=== HTTP REQUEST ===")
        AppLogger.d(TAG, "Endpoint: ${if (isGet) targetUrl else resolvedEndpoint}")
        AppLogger.d(TAG, "Method: ${connection.requestMethod}")
        AppLogger.d(TAG, "Headers:")
        connection.requestProperties.forEach { (key, values) ->
            val masked = values.map { maskSensitiveHeaderValue(key, it) }
            AppLogger.d(TAG, "$key: ${masked.joinToString()}")
        }
        if (!isGet) {
            AppLogger.d(TAG, "Body: ${payload.toString(2)}")
        }
        AppLogger.d(TAG, "===================")
    }

    /**
     * Returns true if the endpoint's host resolves to a private/local address.
     * Performs DNS resolution and caches the result.
     */
    fun isPrivateEndpoint(endpoint: String): Boolean {
        val host = try {
            URL(endpoint).host ?: return false
        } catch (_: Exception) { return false }
        return isPrivateHost(host)
    }

    /**
     * Validates that the endpoint uses an allowed protocol.
     * HTTPS is required for public hosts; HTTP is only allowed for private/local addresses.
     * Performs DNS resolution to detect hostnames that resolve to private IPs.
     */
    fun isValidProtocol(endpoint: String): Boolean {
        val url = try { URL(endpoint) } catch (_: Exception) { return false }
        val protocol = url.protocol.lowercase()
        val host = url.host ?: return false

        if (protocol != "http" && protocol != "https") return false

        if (protocol == "http" && !isPrivateHost(host)) {
            return false
        }
        return true
    }

    /** Per-hostname cache of the DNS lookup + private-range check. */
    private val privateHostCache = java.util.concurrent.ConcurrentHashMap<String, Boolean>()

    /**
     * Checks if the given host is private or local.
     * Matches Android's local network definition:
     * loopback, site-local (RFC 1918), link-local, and CGNAT (100.64.0.0/10).
     */
    private fun isPrivateHost(host: String): Boolean {
        if (host == "localhost") return true
        return privateHostCache.getOrPut(host) {
            try {
                val address = java.net.InetAddress.getByName(host)
                address.isAnyLocalAddress ||
                    address.isLoopbackAddress ||
                    address.isSiteLocalAddress ||
                    address.isLinkLocalAddress ||
                    isCgnatAddress(address)
            } catch (e: Exception) {
                false
            }
        }
    }

    /** Checks if the address falls in the CGNAT range 100.64.0.0/10. */
    private fun isCgnatAddress(address: java.net.InetAddress): Boolean {
        val bytes = address.address
        if (bytes.size != 4) return false
        val a = bytes[0].toInt() and 0xFF
        val b = bytes[1].toInt() and 0xFF
        return a == 100 && b in 64..127
    }

    /**
     * Masks the value of sensitive headers before logging.
     * Shows the first 4 characters followed by "***", or the full value
     * if it is shorter than 4 characters (replaced entirely with "***").
     */
    private fun maskSensitiveHeaderValue(headerName: String, headerValue: String): String {
        val sensitivePatterns = listOf(
            "authorization", "bearer", "token", "secret", "password", "api-key", "apikey"
        )
        val nameLower = headerName.lowercase()
        val isSensitive = sensitivePatterns.any { pattern -> nameLower.contains(pattern) }
        if (!isSensitive) return headerValue

        return if (headerValue.length > 4) {
            "${headerValue.substring(0, 4)}***"
        } else {
            "***"
        }
    }

    suspend fun sendBatchToEndpoint(
        items: List<JSONObject>,
        customFields: Map<String, String>,
        endpoint: String,
        extraHeaders: Map<String, String> = emptyMap(),
    ): BatchResult = withContext(Dispatchers.IO) {
        if (items.isEmpty()) return@withContext BatchResult.Success
        if (endpoint.isBlank()) {
            AppLogger.d(TAG, "Empty endpoint provided")
            return@withContext BatchResult.NetworkError
        }

        val resolvedEndpoint = resolveUrlVariables(endpoint, items.first())

        val url = try {
            URL(resolvedEndpoint)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Invalid URL: $resolvedEndpoint")
            return@withContext BatchResult.NetworkError
        }

        if (!isValidProtocol(resolvedEndpoint)) {
            AppLogger.e(TAG, "Protocol blocked or invalid: $endpoint")
            return@withContext BatchResult.NetworkError
        }

        if (!isNetworkAvailable()) {
            AppLogger.d(TAG, "Sync skipped: No internet")
            return@withContext BatchResult.NetworkError
        }

        val envelope = buildOverlandBatchPayload(items, customFields)

        var connection: HttpURLConnection? = null
        try {
            connection = buildConnection(url, isGet = false, extraHeaders)
            logRequest(connection, isGet = false, resolvedEndpoint, url, envelope)
            writeBody(connection, envelope)
            return@withContext readBatchResponse(connection, items.size)
        } catch (e: java.net.SocketException) {
            if (isPrivateHost(url.host ?: "") && e.message?.contains("EPERM") == true) {
                AppLogger.e(TAG, "Local network access denied - grant Local Network Access permission", e)
            } else {
                AppLogger.e(TAG, "Network error: ${e.message}", e)
            }
            BatchResult.NetworkError
        } catch (e: Exception) {
            AppLogger.e(TAG, "Network error: ${e.message}", e)
            BatchResult.NetworkError
        } finally {
            connection?.disconnect()
        }
    }

    private fun readBatchResponse(connection: HttpURLConnection, batchSize: Int): BatchResult {
        val responseCode = connection.responseCode
        return when (responseCode) {
            in 200..299 -> {
                AppLogger.d(TAG, "Batch of $batchSize sent successfully")
                BatchResult.Success
            }
            in 400..499 -> {
                val errorBody = readErrorBody(connection)
                AppLogger.w(TAG, "Batch rejected (4xx): $responseCode - $errorBody")
                BatchResult.ClientError(responseCode)
            }
            in 500..599 -> {
                val errorBody = readErrorBody(connection)
                AppLogger.e(TAG, "Batch failed (5xx): $responseCode - $errorBody")
                BatchResult.ServerError(responseCode)
            }
            else -> {
                AppLogger.e(TAG, "Batch failed with unexpected code: $responseCode")
                BatchResult.ServerError(responseCode)
            }
        }
    }

    private fun readErrorBody(connection: HttpURLConnection): String = try {
        connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error body"
    } catch (_: Exception) { "Could not read error body" }

    /**
     * Custom fields go at the envelope level (matches the Overland iOS client and
     * what Dawarich's overland controller expects), NOT inside per-Feature properties.
     *
     * The `device_id` fallback chain (device_id -> tid -> id -> "colota") lets users
     * migrating from OwnTracks (tid) or Traccar (id) keep their identity working
     * without reconfiguring custom fields. Don't prune as dead code.
     */
    private fun buildOverlandBatchPayload(
        items: List<JSONObject>,
        customFields: Map<String, String>,
    ): JSONObject {
        val locations = org.json.JSONArray()
        for (flat in items) {
            locations.put(flatToOverlandFeature(flat))
        }
        return JSONObject().apply {
            put("locations", locations)
            customFields.forEach { (key, value) ->
                if (key != "device_id" && key != "locations") put(key, value)
            }
            val firstPayload = items.firstOrNull() ?: JSONObject()
            val deviceId = customFields["device_id"]?.ifBlank { null }
                ?: firstPayload.optString("device_id", "").ifBlank { null }
                ?: firstPayload.optString("tid", "").ifBlank { null }
                ?: firstPayload.optString("id", "").ifBlank { null }
                ?: "colota"
            put("device_id", deviceId)
        }
    }

    private fun flatToOverlandFeature(flat: JSONObject): JSONObject {
        val coordinates = org.json.JSONArray().apply {
            put(flat.optDouble("lon", 0.0))  // GeoJSON: [lon, lat], not lat/lon
            put(flat.optDouble("lat", 0.0))
        }
        val geometry = JSONObject().apply {
            put("type", "Point")
            put("coordinates", coordinates)
        }
        val properties = JSONObject().apply {
            // Guard against tst=0 from a corrupted row (optLong's default only fires on missing key).
            val tstRaw = flat.optLong("tst", 0L)
            val tst = if (tstRaw > 0) tstRaw else System.currentTimeMillis() / 1000
            put("timestamp", java.time.Instant.ofEpochSecond(tst).toString())
            if (flat.has("acc")) put("horizontal_accuracy", flat.optInt("acc"))
            if (flat.has("alt")) put("altitude", flat.optInt("alt"))
            if (flat.has("vel")) put("speed", flat.optDouble("vel"))
            if (flat.has("bear")) put("course", flat.optDouble("bear"))
            val batt = flat.optInt("batt", -1)
            if (batt >= 0) {
                put("battery_level", batt / 100.0)
                put("battery_state", BatteryStatus.toOverlandString(flat.optInt("bs", BatteryStatus.UNKNOWN)))
            }
        }
        return JSONObject().apply {
            put("type", "Feature")
            put("geometry", geometry)
            put("properties", properties)
        }
    }

    /**
     * Transforms a flat Colota payload to the Traccar JSON format (Traccar 6.7.0+).
     * https://www.traccar.org/osmand/
     */
    private fun buildTraccarJsonPayload(flat: JSONObject): JSONObject {
        val coords = JSONObject().apply {
            put("latitude", flat.optDouble("lat", 0.0))
            put("longitude", flat.optDouble("lon", 0.0))
            if (flat.has("acc")) put("accuracy", flat.optDouble("acc"))
            if (flat.has("alt")) put("altitude", flat.optDouble("alt"))
            if (flat.has("vel")) put("speed", flat.optDouble("vel"))
            if (flat.has("bear")) put("heading", flat.optDouble("bear"))
        }

        val tst = flat.optLong("tst", System.currentTimeMillis() / 1000)
        val timestamp = java.time.Instant.ofEpochSecond(tst).toString()

        val location = JSONObject().apply {
            put("timestamp", timestamp)
            put("coords", coords)
            val batt = flat.optInt("batt", -1)
            if (batt >= 0) {
                val bs = flat.optInt("bs", BatteryStatus.UNKNOWN)
                put("battery", JSONObject().apply {
                    put("level", batt / 100.0)
                    put("is_charging", BatteryStatus.isPluggedIn(bs))
                })
            }
        }

        return JSONObject().apply {
            put("location", location)
            // Prefer "id" (Traccar OsmAnd GET custom field) so both modes share the same identifier
            val deviceId = flat.optString("id", "").ifBlank { flat.optString("device_id", "colota") }
            put("device_id", deviceId)
        }
    }

    /**
     * Resolves template variables in the endpoint URL.
     * Uses the location's timestamp, not wall clock time,
     * so queued sends get the correct date.
     */
    @androidx.annotation.VisibleForTesting
    internal fun resolveUrlVariables(endpoint: String, payload: JSONObject): String {
        if (!endpoint.contains('%')) return endpoint

        val tst = payload.optLong("tst", 0L)
        val timestamp = if (tst > 0) tst else System.currentTimeMillis() / 1000
        val zoned = Instant.ofEpochSecond(timestamp).atZone(ZoneId.systemDefault())

        return endpoint
            .replace("%DATE", zoned.format(DateTimeFormatter.ISO_LOCAL_DATE))
            .replace("%YEAR", zoned.year.toString())
            .replace("%MONTH", String.format(java.util.Locale.ROOT, "%02d", zoned.monthValue))
            .replace("%DAY", String.format(java.util.Locale.ROOT, "%02d", zoned.dayOfMonth))
            .replace("%TIMESTAMP", timestamp.toString())
    }

    private fun buildQueryString(payload: JSONObject): String {
        val params = mutableListOf<String>()
        val keys = payload.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            val value = payload.opt(key)?.toString() ?: continue
            params.add("${URLEncoder.encode(key, "UTF-8")}=${URLEncoder.encode(value, "UTF-8")}")
        }
        return params.joinToString("&")
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
     * SSID is updated via NetworkCallback with FLAG_INCLUDE_LOCATION_INFO.
     */
    fun isConnectedToSsid(ssid: String): Boolean {
        if (ssid.isBlank()) return false
        return currentSsid.equals(ssid, ignoreCase = true)
    }

    /**
     * Returns true when the active network uses a VPN transport.
     * Updated via NetworkCallback.
     */
    fun isVpnConnected(): Boolean = isVpn

    fun getCurrentSsid(): String = currentSsid

    fun destroy() {
        try {
            connectivityManager.unregisterNetworkCallback(networkCallback)
        } catch (_: Exception) {}
    }
}