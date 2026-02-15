package com.Colota.sync

import android.content.Context
import com.Colota.BuildConfig
import com.Colota.util.TimedCache
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

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

    private val networkCache = TimedCache(NETWORK_CHECK_CACHE_MS) {
        try {
            val network = connectivityManager.activeNetwork
            val capabilities = connectivityManager.getNetworkCapabilities(network)
            capabilities != null &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } catch (e: Exception) {
            Log.e(TAG, "Network check failed", e)
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
        httpMethod: String = "POST"
    ): Boolean = withContext(Dispatchers.IO) {
        if (endpoint.isBlank()) {
            if (BuildConfig.DEBUG) Log.d(TAG, "Empty endpoint provided")
            return@withContext false
        }

        val url = try {
            URL(endpoint)
        } catch (e: Exception) {
            Log.e(TAG, "Invalid URL: $endpoint")
            return@withContext false
        }

        if (!isValidProtocol(url)) {
            Log.e(TAG, "Protocol blocked or invalid: $endpoint")
            return@withContext false
        }

        if (!isNetworkAvailable()) {
            if (BuildConfig.DEBUG) Log.d(TAG, "Sync skipped: No internet")
            return@withContext false
        }

        val isGet = httpMethod.equals("GET", ignoreCase = true)

        val targetUrl = if (isGet) {
            val query = buildQueryString(payload)
            val separator = if (url.query != null) "&" else "?"
            URL("$endpoint$separator$query")
        } else {
            url
        }

        var connection: HttpURLConnection? = null
        try {
            connection = targetUrl.openConnection() as HttpURLConnection
            connection.apply {
                requestMethod = if (isGet) "GET" else "POST"
                if (!isGet) {
                    setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                    setRequestProperty("Accept", "application/json")
                    doOutput = true
                }
                extraHeaders.forEach { (key, value) ->
                    setRequestProperty(key, value)
                }
                connectTimeout = CONNECTION_TIMEOUT
                readTimeout = READ_TIMEOUT
                useCaches = false
            }

            if (BuildConfig.DEBUG) {
                Log.d(TAG, "=== HTTP REQUEST ===")
                Log.d(TAG, "Endpoint: ${if (isGet) targetUrl else endpoint}")
                Log.d(TAG, "Method: ${connection.requestMethod}")
                Log.d(TAG, "Headers:")
                connection.requestProperties.forEach { (key, values) ->
                    val masked = values.map { maskSensitiveHeaderValue(key, it) }
                    Log.d(TAG, "$key: ${masked.joinToString()}")
                }
                if (!isGet) {
                    Log.d(TAG, "Body: ${payload.toString(2)}")
                }
                Log.d(TAG, "===================")
            }

            if (!isGet) {
                val bodyBytes = payload.toString().toByteArray(StandardCharsets.UTF_8)
                connection.setFixedLengthStreamingMode(bodyBytes.size)
                connection.outputStream.use { it.write(bodyBytes) }
            }

            val responseCode = connection.responseCode
            return@withContext if (responseCode in 200..299) {
                if (BuildConfig.DEBUG) Log.d(TAG, "Location successfully sent")
                true
            } else {
                val errorBody = try {
                    connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error body"
                } catch (_: Exception) { "Could not read error body" }
                Log.e(TAG, "${connection.requestMethod} failed: $responseCode - $errorBody")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Network error: ${e.message}", e)
            false
        } finally {
            connection?.disconnect()
        }
    }

    /**
     * Validates protocol and enforces HTTPS for public hosts.
     */
    private fun isValidProtocol(url: URL): Boolean {
        val protocol = url.protocol.lowercase()
        val host = url.host ?: return false

        if (protocol != "http" && protocol != "https") return false

        // HTTP only allowed for local dev (localhost, 192.168.x.x, 10.x.x.x)
        if (protocol == "http" && !isPrivateHost(host)) {
            return false
        }
        return true
    }

    /**
     * Checks if the given host is private or local.
     */
    private fun isPrivateHost(host: String): Boolean {
        if (host == "localhost") return true
        return try {
            val address = java.net.InetAddress.getByName(host)
            address.isAnyLocalAddress || address.isLoopbackAddress || address.isSiteLocalAddress
        } catch (e: Exception) {
            false
        }
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
}