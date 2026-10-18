/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync.http.tls

import javax.net.ssl.SSLHandshakeException

/** Tells apart an untrusted server certificate, a missing client certificate and a rejected one. */
internal object TlsFailure {

    fun describe(e: SSLHandshakeException, hasClientCert: Boolean): String {
        val detail = (e.message ?: "") + " " + (e.cause?.message ?: "")
        val isServerNotTrusted = detail.contains("Trust anchor", ignoreCase = true) ||
            detail.contains("CertPathValidator", ignoreCase = true) ||
            detail.contains("unable to find valid certification path", ignoreCase = true)
        val isClientRejected = detail.contains("certificate_required", ignoreCase = true) ||
            detail.contains("bad_certificate", ignoreCase = true) ||
            detail.contains("handshake_failure", ignoreCase = true)

        return when {
            isServerNotTrusted ->
                "Server certificate is not trusted (self-signed or unknown CA). Import the server's CA under Connection > Client certificate, or use a publicly trusted certificate."
            isClientRejected && hasClientCert ->
                "Server rejected the client certificate. Common causes: cert signed by wrong CA, cert expired, or cert revoked."
            isClientRejected && !hasClientCert ->
                "Server requires a client certificate (mutual TLS) but none is configured. Add one under Connection > Client certificate."
            else ->
                "TLS handshake failed: ${e.message ?: e.javaClass.simpleName}"
        }
    }
}
