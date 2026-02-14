package com.Colota

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
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

    // Cache variables for network availability
    @Volatile private var lastNetworkCheck: Boolean = true
    private var lastNetworkCheckTime: Long = 0

    /**
     * Executes an asynchronous POST request to the server.
     */
    suspend fun sendToEndpoint(
        payload: JSONObject,
        endpoint: String,
        extraHeaders: Map<String, String> = emptyMap()
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

        var connection: HttpURLConnection? = null
        try {
            connection = url.openConnection() as HttpURLConnection
            connection.apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                setRequestProperty("Accept", "application/json")
                extraHeaders.forEach { (key, value) ->
                    setRequestProperty(key, value)
                }
                doOutput = true
                connectTimeout = CONNECTION_TIMEOUT
                readTimeout = READ_TIMEOUT
                useCaches = false
            }

            // Log request details
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "=== HTTP REQUEST ===")
                Log.d(TAG, "Endpoint: $endpoint")
                Log.d(TAG, "Method: POST")
                Log.d(TAG, "Headers:")
                connection.requestProperties.forEach { (key, values) ->
                    Log.d(TAG, "$key: ${values.joinToString()}")
                }
                Log.d(TAG, "Body: ${payload.toString(2)}") // Pretty print JSON
                Log.d(TAG, "===================")
            }

            // Write payload
            val bodyBytes = payload.toString().toByteArray(StandardCharsets.UTF_8)
            connection.setFixedLengthStreamingMode(bodyBytes.size)
            connection.outputStream.use { it.write(bodyBytes) }

            val responseCode = connection.responseCode
            return@withContext if (responseCode in 200..299) {
                if (BuildConfig.DEBUG) Log.d(TAG, "Location successfully sent")
                true
            } else {
                val errorBody = try {
                    connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error body"
                } catch (_: Exception) { "Could not read error body" }
                Log.e(TAG, "POST failed: $responseCode - $errorBody")
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

        // Enforce HTTPS for anything that isn't a local/private IP
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
     * Checks for an active, validated internet connection with caching.
     */
    fun isNetworkAvailable(): Boolean {
        val now = System.currentTimeMillis()
        if ((now - lastNetworkCheckTime) < NETWORK_CHECK_CACHE_MS) {
            return lastNetworkCheck
        }

        lastNetworkCheck = try {
            val network = connectivityManager.activeNetwork
            val capabilities = connectivityManager.getNetworkCapabilities(network)
            
            capabilities != null &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } catch (e: Exception) {
            Log.e(TAG, "Network check failed", e)
            false
        }

        lastNetworkCheckTime = now
        return lastNetworkCheck
    }
}