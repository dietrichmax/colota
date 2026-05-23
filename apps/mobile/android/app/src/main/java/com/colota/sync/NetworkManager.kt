package com.Colota.sync

import android.content.Context
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import com.Colota.BuildConfig
import com.Colota.util.AppLogger
import com.Colota.sync.tls.ClientCertSslContextProvider
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
import java.security.UnrecoverableKeyException
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLHandshakeException

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

    // Lazy so existing unit tests that mock Context don't trigger EncryptedSharedPreferences init.
    // Singleton so invalidation propagates between every NetworkManager (foreground service +
    // mTLS bridge module both hold their own NetworkManager).
    private val clientCertProvider by lazy { ClientCertSslContextProvider.getInstance(context) }

    /** Call after a client cert or trusted CA change so the next request picks it up. */
    fun invalidateClientCertCache() {
        clientCertProvider.invalidate()
    }

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
    ): Boolean {
        val result = runRequest(payload, endpoint, extraHeaders, httpMethod, apiFormat, emptyMap())
        if (result.ok) {
            AppLogger.d(TAG, "Location successfully sent")
        } else if (result.errorMessage != null) {
            AppLogger.e(TAG, result.errorMessage)
        }
        return result.ok
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
        if (this is HttpsURLConnection) {
            clientCertProvider.get()?.let { sslSocketFactory = it }
        }
    }

    private fun writeBody(connection: HttpURLConnection, payload: JSONObject) {
        val bodyBytes = payload.toString().toByteArray(StandardCharsets.UTF_8)
        connection.setFixedLengthStreamingMode(bodyBytes.size)
        connection.outputStream.use { it.write(bodyBytes) }
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
            val masked = values.map { AppLogger.maskSensitiveHeaderValue(key, it) }
            AppLogger.d(TAG, "$key: ${masked.joinToString()}")
        }
        if (!isGet) {
            AppLogger.d(TAG, "Body: ${payload.toString(2)}")
        }
        AppLogger.d(TAG, "===================")
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

        if (!UrlSafety.isValidProtocol(resolvedEndpoint)) {
            AppLogger.e(TAG, "Protocol blocked or invalid: $endpoint")
            return@withContext BatchResult.NetworkError
        }

        if (!isNetworkAvailable()) {
            AppLogger.d(TAG, "Sync skipped: No internet")
            return@withContext BatchResult.NetworkError
        }

        val envelope = PayloadBuilder.buildOverlandBatchPayload(items, customFields)

        var connection: HttpURLConnection? = null
        try {
            connection = buildConnection(url, isGet = false, extraHeaders)
            logRequest(connection, isGet = false, resolvedEndpoint, url, envelope)
            writeBody(connection, envelope)
            return@withContext readBatchResponse(connection, items.size)
        } catch (e: java.net.SocketException) {
            if (UrlSafety.isPrivateHost(url.host ?: "") && e.message?.contains("EPERM") == true) {
                AppLogger.e(TAG, "Local network access denied - grant Local Network Access permission", e)
            } else {
                AppLogger.e(TAG, "Network error: ${e.message}", e)
            }
            BatchResult.NetworkError
        } catch (e: SSLHandshakeException) {
            AppLogger.e(TAG, mtlsErrorMessage(e), e)
            BatchResult.NetworkError
        } catch (e: UnrecoverableKeyException) {
            AppLogger.e(TAG, "Client certificate password is incorrect - re-import the .p12", e)
            BatchResult.NetworkError
        } catch (e: Exception) {
            AppLogger.e(TAG, "Network error: ${e.message}", e)
            BatchResult.NetworkError
        } finally {
            connection?.disconnect()
        }
    }

    /** Same as [sendToEndpoint] but returns status + error text instead of Boolean. */
    suspend fun testEndpoint(
        payload: JSONObject,
        endpoint: String,
        extraHeaders: Map<String, String> = emptyMap(),
        httpMethod: String = "POST",
        apiFormat: ApiFormat = ApiFormat.FIELD_MAPPED,
        customFields: Map<String, String> = emptyMap(),
    ): TestEndpointResult = runRequest(payload, endpoint, extraHeaders, httpMethod, apiFormat, customFields)

    /**
     * Shared request implementation. Returns a fully-populated [TestEndpointResult];
     * production callers project this to Boolean via [sendToEndpoint], while the
     * Test Connection path exposes it directly via [testEndpoint].
     */
    private suspend fun runRequest(
        payload: JSONObject,
        endpoint: String,
        extraHeaders: Map<String, String>,
        httpMethod: String,
        apiFormat: ApiFormat,
        customFields: Map<String, String>,
    ): TestEndpointResult = withContext(Dispatchers.IO) {
        if (endpoint.isBlank()) {
            return@withContext TestEndpointResult(false, errorMessage = "Endpoint is empty")
        }
        val resolvedEndpoint = resolveUrlVariables(endpoint, payload)
        val url = try {
            URL(resolvedEndpoint)
        } catch (_: Exception) {
            return@withContext TestEndpointResult(false, errorMessage = "Invalid URL: $resolvedEndpoint")
        }
        if (!UrlSafety.isValidProtocol(resolvedEndpoint)) {
            return@withContext TestEndpointResult(
                false,
                errorMessage = "HTTPS is required for public endpoints. HTTP is only allowed for private/local addresses."
            )
        }
        if (!isNetworkAvailable()) {
            return@withContext TestEndpointResult(false, errorMessage = "No internet connection")
        }

        val transformedPayload = when (apiFormat) {
            ApiFormat.TRACCAR_JSON -> PayloadBuilder.buildTraccarJsonPayload(payload)
            ApiFormat.OVERLAND_BATCH -> PayloadBuilder.buildOverlandBatchPayload(listOf(payload), customFields)
            ApiFormat.FIELD_MAPPED -> payload
        }
        val isGet = httpMethod.equals("GET", ignoreCase = true)
        val targetUrl = if (isGet) {
            val query = buildQueryString(transformedPayload)
            val separator = if (url.query != null) "&" else "?"
            URL("$resolvedEndpoint$separator$query")
        } else url

        var connection: HttpURLConnection? = null
        try {
            connection = buildConnection(targetUrl, isGet, extraHeaders)
            logRequest(connection, isGet, resolvedEndpoint, targetUrl, transformedPayload)
            if (!isGet) writeBody(connection, transformedPayload)
            val responseCode = connection.responseCode
            if (responseCode in 200..299) {
                TestEndpointResult(true, httpStatus = responseCode)
            } else {
                val errorBody = readErrorBody(connection)
                TestEndpointResult(
                    false,
                    httpStatus = responseCode,
                    errorMessage = "Server returned $responseCode: ${errorBody.take(200)}"
                )
            }
        } catch (e: SSLHandshakeException) {
            TestEndpointResult(false, errorMessage = mtlsErrorMessage(e))
        } catch (e: UnrecoverableKeyException) {
            TestEndpointResult(false, errorMessage = "Client certificate password is incorrect - re-import the .p12")
        } catch (e: java.net.SocketException) {
            val msg = if (UrlSafety.isPrivateHost(url.host ?: "") && e.message?.contains("EPERM") == true) {
                "Local network access denied - grant Local Network Access permission"
            } else "Network error: ${e.message}"
            TestEndpointResult(false, errorMessage = msg)
        } catch (e: java.net.SocketTimeoutException) {
            TestEndpointResult(false, errorMessage = "Connection timed out")
        } catch (e: Exception) {
            TestEndpointResult(false, errorMessage = "Connection failed: ${e.message ?: e.javaClass.simpleName}")
        } finally {
            connection?.disconnect()
        }
    }

    // Disambiguates the three TLS failure modes that look similar in logs but
    // need different fixes: untrusted server cert, missing client cert, rejected
    // client cert.
    private fun mtlsErrorMessage(e: SSLHandshakeException): String {
        val detail = (e.message ?: "") + " " + (e.cause?.message ?: "")
        val isServerNotTrusted = detail.contains("Trust anchor", ignoreCase = true) ||
            detail.contains("CertPathValidator", ignoreCase = true) ||
            detail.contains("unable to find valid certification path", ignoreCase = true)
        val isClientRejected = detail.contains("certificate_required", ignoreCase = true) ||
            detail.contains("bad_certificate", ignoreCase = true) ||
            detail.contains("handshake_failure", ignoreCase = true)
        val hasClientCert = clientCertProvider.get() != null

        return when {
            isServerNotTrusted ->
                "Server certificate is not trusted (self-signed or unknown CA). Import the server's CA via mTLS Settings, or use a publicly-trusted certificate."
            isClientRejected && hasClientCert ->
                "Server rejected the client certificate. Common causes: cert signed by wrong CA, cert expired, or cert revoked."
            isClientRejected && !hasClientCert ->
                "Server requires a client certificate (mTLS) but none is configured. Import a .p12 in Auth Settings."
            else ->
                "TLS handshake failed: ${e.message ?: e.javaClass.simpleName}"
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