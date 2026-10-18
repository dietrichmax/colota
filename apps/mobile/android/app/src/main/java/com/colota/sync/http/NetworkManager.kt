package com.Colota.sync.http

import android.content.Context
import com.Colota.util.AppLogger
import com.Colota.sync.http.tls.ClientCertSslContextProvider
import com.Colota.sync.http.tls.TlsFailure
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.UnrecoverableKeyException
import javax.net.ssl.SSLHandshakeException
import com.Colota.network.NetworkMonitor
import com.Colota.sync.PayloadBuilder
import com.Colota.sync.ApiFormat

/**
 * Sends requests to the user's endpoint.
 */
class NetworkManager(private val context: Context, private val networkMonitor: NetworkMonitor) {

    companion object {
        private const val TAG = "NetworkManager"
    }

    // Lazy so existing unit tests that mock Context don't trigger EncryptedSharedPreferences init.
    // Singleton so invalidation propagates between every NetworkManager (foreground service +
    // mTLS bridge module both hold their own NetworkManager).
    private val clientCertProvider by lazy { ClientCertSslContextProvider.getInstance(context) }

    private fun tlsFailureMessage(e: SSLHandshakeException) = TlsFailure.describe(e, clientCertProvider.get() != null)

    /** Call after a client cert or trusted CA change so the next request picks it up. */
    fun invalidateClientCertCache() {
        clientCertProvider.invalidate()
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
    ): BatchResult {
        val result = runRequest(payload, endpoint, extraHeaders, httpMethod, apiFormat, emptyMap())
        if (result.ok) {
            AppLogger.d(TAG, "Location successfully sent")
        } else if (result.errorMessage != null) {
            AppLogger.e(TAG, result.errorMessage)
        }
        return if (result.httpStatus == 0) BatchResult.NetworkError else verdictFor(result.httpStatus, result.retryAfterSeconds)
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

        val resolvedEndpoint = EndpointUrl.resolveUrlVariables(endpoint, items.first())

        val url = try {
            URL(resolvedEndpoint)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Invalid URL: ${AppLogger.maskSensitiveUrlValues(resolvedEndpoint)}")
            return@withContext BatchResult.NetworkError
        }

        if (!UrlSafety.isValidProtocol(resolvedEndpoint)) {
            AppLogger.e(TAG, "Protocol blocked or invalid: ${AppLogger.maskSensitiveUrlValues(endpoint)}")
            return@withContext BatchResult.NetworkError
        }

        if (!networkMonitor.isNetworkAvailable()) {
            AppLogger.d(TAG, "Sync skipped: No internet")
            return@withContext BatchResult.NetworkError
        }

        val envelope = PayloadBuilder.buildOverlandBatchPayload(items, customFields)

        var connection: HttpURLConnection? = null
        try {
            connection = RequestBuilder.open(url, isGet = false, extraHeaders) { clientCertProvider.get() }
            RequestBuilder.logRequest(connection, isGet = false, resolvedEndpoint, url, envelope)
            RequestBuilder.writeBody(connection, envelope)
            return@withContext ResponseReader.readBatchResponse(connection, items.size)
        } catch (e: java.net.SocketException) {
            if (UrlSafety.isPrivateHost(url.host ?: "") && e.message?.contains("EPERM") == true) {
                AppLogger.e(TAG, "Local network access denied - grant Local Network Access permission", e)
            } else {
                AppLogger.e(TAG, "Network error: ${e.message}", e)
            }
            BatchResult.NetworkError
        } catch (e: SSLHandshakeException) {
            AppLogger.e(TAG, tlsFailureMessage(e), e)
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

    /** Same as [sendToEndpoint] but returns status + error text instead of a verdict. */
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
     * production callers project this to a [BatchResult] via [sendToEndpoint], while the
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
        val resolvedEndpoint = EndpointUrl.resolveUrlVariables(endpoint, payload)
        val url = try {
            URL(resolvedEndpoint)
        } catch (_: Exception) {
            return@withContext TestEndpointResult(false, errorMessage = "Invalid URL: ${AppLogger.maskSensitiveUrlValues(resolvedEndpoint)}")
        }
        if (!UrlSafety.isValidProtocol(resolvedEndpoint)) {
            return@withContext TestEndpointResult(
                false,
                errorMessage = "HTTPS is required for public endpoints. HTTP is only allowed for private/local addresses."
            )
        }
        if (!networkMonitor.isNetworkAvailable()) {
            return@withContext TestEndpointResult(false, errorMessage = "No internet connection")
        }

        val transformedPayload = when (apiFormat) {
            ApiFormat.TRACCAR_JSON -> PayloadBuilder.buildTraccarJsonPayload(payload)
            ApiFormat.OVERLAND_BATCH -> PayloadBuilder.buildOverlandBatchPayload(listOf(payload), customFields)
            ApiFormat.FIELD_MAPPED -> payload
        }
        val isGet = httpMethod.equals("GET", ignoreCase = true)
        val targetUrl = if (isGet) {
            val query = PayloadBuilder.buildQueryString(transformedPayload)
            val separator = if (url.query != null) "&" else "?"
            URL("$resolvedEndpoint$separator$query")
        } else url

        var connection: HttpURLConnection? = null
        try {
            connection = RequestBuilder.open(targetUrl, isGet, extraHeaders) { clientCertProvider.get() }
            RequestBuilder.logRequest(connection, isGet, resolvedEndpoint, targetUrl, transformedPayload)
            if (!isGet) RequestBuilder.writeBody(connection, transformedPayload)
            ResponseReader.readResponse(connection)
        } catch (e: SSLHandshakeException) {
            TestEndpointResult(false, errorMessage = tlsFailureMessage(e))
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
}
