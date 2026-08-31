/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync

import androidx.annotation.VisibleForTesting
import java.net.InetAddress
import java.net.URL

/**
 * HTTP endpoint policy: which protocols and hosts the app is willing to talk to.
 * Pure validation, no transport state.
 */
object UrlSafety {

    /** Resolves the host on every call, so a host that stops resolving privately stops being trusted. */
    fun isPrivateEndpoint(endpoint: String): Boolean {
        val host = try {
            URL(endpoint).host ?: return false
        } catch (_: Exception) { return false }
        return isPrivateHost(host)
    }

    /**
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

    /**
     * Matches Android's local network definition:
     * loopback, site-local (RFC 1918), link-local, and CGNAT (100.64.0.0/10).
     */
    fun isPrivateHost(host: String): Boolean = isPrivateHost(host, InetAddress::getByName)

    @VisibleForTesting
    internal fun isPrivateHost(host: String, resolve: (String) -> InetAddress): Boolean {
        if (host == "localhost") return true

        val address = try {
            resolve(host)
        } catch (_: Exception) {
            return false
        }

        val isPrivate = address.isAnyLocalAddress ||
            address.isLoopbackAddress ||
            address.isSiteLocalAddress ||
            address.isLinkLocalAddress ||
            isCgnatAddress(address)
        return isPrivate
    }

    /** Checks if the address falls in the CGNAT range 100.64.0.0/10. */
    private fun isCgnatAddress(address: InetAddress): Boolean {
        val bytes = address.address
        if (bytes.size != 4) return false
        val a = bytes[0].toInt() and 0xFF
        val b = bytes[1].toInt() and 0xFF
        return a == 100 && b in 64..127
    }
}
