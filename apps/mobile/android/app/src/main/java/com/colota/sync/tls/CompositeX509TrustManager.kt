/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync.tls

import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.X509TrustManager

/**
 * Trust manager that accepts a server chain if any [delegates] would accept it.
 * Used to add a user-imported CA on top of the system trust store.
 */
class CompositeX509TrustManager(private val delegates: List<X509TrustManager>) : X509TrustManager {

    override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String) {
        val errors = mutableListOf<CertificateException>()
        for (tm in delegates) {
            try {
                tm.checkServerTrusted(chain, authType)
                return
            } catch (e: CertificateException) {
                errors += e
            }
        }
        // Re-throw the last delegate's error. ClientCertSslContextProvider.buildTrustManagers
        // orders delegates as [system, user], so the user-CA error is reported last -
        // which is what self-hosted users want to see ("your CA didn't match either").
        throw errors.last()
    }

    override fun checkClientTrusted(chain: Array<out X509Certificate>, authType: String) {
        delegates.first().checkClientTrusted(chain, authType)
    }

    override fun getAcceptedIssuers(): Array<X509Certificate> =
        delegates.flatMap { it.acceptedIssuers.toList() }.toTypedArray()
}
