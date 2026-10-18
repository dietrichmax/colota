/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync.http

import com.Colota.BuildConfig
import com.Colota.util.AppLogger
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLSocketFactory

/** Opens the connection for one request, sets its headers and writes its body. */
internal object RequestBuilder {

    private const val TAG = "NetworkManager"
    private const val CONNECTION_TIMEOUT = 10000
    private const val READ_TIMEOUT = 10000

    fun open(
        targetUrl: URL,
        isGet: Boolean,
        extraHeaders: Map<String, String>,
        clientCertFactory: () -> SSLSocketFactory?,
    ): HttpURLConnection = (targetUrl.openConnection() as HttpURLConnection).apply {
        requestMethod = if (isGet) "GET" else "POST"
        if (!isGet) {
            setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            setRequestProperty("Accept", "application/json")
            doOutput = true
        }
        extraHeaders.forEach { (key, value) -> setRequestProperty(key, value) }
        setRequestProperty("Connection", "close")
        connectTimeout = CONNECTION_TIMEOUT
        readTimeout = READ_TIMEOUT
        useCaches = false
        if (this is HttpsURLConnection) {
            clientCertFactory()?.let { sslSocketFactory = it }
        }
    }

    fun writeBody(connection: HttpURLConnection, payload: JSONObject) {
        val bodyBytes = payload.toString().toByteArray(StandardCharsets.UTF_8)
        connection.setFixedLengthStreamingMode(bodyBytes.size)
        connection.outputStream.use { it.write(bodyBytes) }
    }

    fun logRequest(
        connection: HttpURLConnection,
        isGet: Boolean,
        resolvedEndpoint: String,
        targetUrl: URL,
        payload: JSONObject,
    ) {
        if (!BuildConfig.DEBUG) return
        AppLogger.d(TAG, "=== HTTP REQUEST ===")
        AppLogger.d(TAG, "Endpoint: ${AppLogger.maskSensitiveUrlValues(if (isGet) targetUrl.toString() else resolvedEndpoint)}")
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
}
