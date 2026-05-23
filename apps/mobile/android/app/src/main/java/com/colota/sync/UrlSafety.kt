/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync

import java.net.InetAddress
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

/**
 * HTTP endpoint policy: which protocols and hosts the app is willing to talk to.
 * Pure validation, no transport state.
 */
object UrlSafety {

    /** Per-hostname cache of the DNS lookup + private-range check. */
    private val privateHostCache = ConcurrentHashMap<String, Boolean>()

    /** Performs DNS resolution and caches the result. */
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
    fun isPrivateHost(host: String): Boolean {
        if (host == "localhost") return true
        return privateHostCache.getOrPut(host) {
            try {
                val address = InetAddress.getByName(host)
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
    private fun isCgnatAddress(address: InetAddress): Boolean {
        val bytes = address.address
        if (bytes.size != 4) return false
        val a = bytes[0].toInt() and 0xFF
        val b = bytes[1].toInt() and 0xFF
        return a == 100 && b in 64..127
    }
}
