/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync.tls

import android.content.Context
import android.security.KeyChain
import com.Colota.util.AppLogger
import com.Colota.util.SecureStorageHelper
import java.net.Socket
import java.security.KeyStore
import java.security.Principal
import java.security.PrivateKey
import java.security.cert.X509Certificate
import javax.net.ssl.X509KeyManager

/**
 * Resolves the active client cert at TLS handshake time. Supports two sources:
 *   - System KeyChain alias (private key stays in OS / hardware, never enters app heap)
 *   - AndroidKeyStore entry (.p12 imported via the app)
 *
 * Dynamic resolution means the SSL context doesn't need to be rebuilt when the
 * user swaps certs; only the trust managers (server CA side) require rebuild.
 */
class DynamicKeyManager(private val context: Context) : X509KeyManager {

    private val secureStorage by lazy { SecureStorageHelper.getInstance(context) }

    // Resolved alias is cached so chooseClientAlias doesn't hit EncryptedSharedPreferences
    // on every TLS handshake. Invalidated via [invalidate] when the user changes certs.
    @Volatile private var cachedAlias: String? = null
    @Volatile private var aliasResolved: Boolean = false

    override fun chooseClientAlias(
        keyTypes: Array<String>,
        issuers: Array<Principal>?,
        socket: Socket?,
    ): String? {
        if (aliasResolved) return cachedAlias
        synchronized(this) {
            if (aliasResolved) return cachedAlias
            cachedAlias = resolveAlias()
            aliasResolved = true
            return cachedAlias
        }
    }

    private fun resolveAlias(): String? {
        secureStorage.getKeyChainAlias()?.let { return KEYCHAIN_PREFIX + it }
        if (ClientCertSslContextProvider.hasAndroidKeyStoreClientCert()) {
            return ClientCertSslContextProvider.CLIENT_CERT_ALIAS
        }
        return null
    }

    override fun getClientAliases(keyType: String, issuers: Array<Principal>?): Array<String>? {
        val alias = chooseClientAlias(arrayOf(keyType), issuers, null) ?: return null
        return arrayOf(alias)
    }

    override fun getCertificateChain(alias: String): Array<X509Certificate>? {
        if (alias.startsWith(KEYCHAIN_PREFIX)) {
            return try {
                KeyChain.getCertificateChain(context, alias.removePrefix(KEYCHAIN_PREFIX))
            } catch (e: Exception) {
                AppLogger.e(TAG, "KeyChain.getCertificateChain failed", e)
                null
            }
        }
        if (alias != ClientCertSslContextProvider.CLIENT_CERT_ALIAS) {
            AppLogger.w(TAG, "Unexpected alias for getCertificateChain: $alias")
            return null
        }
        return try {
            val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            ks.getCertificateChain(alias)?.map { it as X509Certificate }?.toTypedArray()
        } catch (e: Exception) {
            AppLogger.e(TAG, "AndroidKeyStore.getCertificateChain failed", e)
            null
        }
    }

    override fun getPrivateKey(alias: String): PrivateKey? {
        if (alias.startsWith(KEYCHAIN_PREFIX)) {
            return try {
                KeyChain.getPrivateKey(context, alias.removePrefix(KEYCHAIN_PREFIX))
            } catch (e: Exception) {
                AppLogger.e(TAG, "KeyChain.getPrivateKey failed", e)
                null
            }
        }
        if (alias != ClientCertSslContextProvider.CLIENT_CERT_ALIAS) {
            AppLogger.w(TAG, "Unexpected alias for getPrivateKey: $alias")
            return null
        }
        return try {
            val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            ks.getKey(alias, null) as? PrivateKey
        } catch (e: Exception) {
            AppLogger.e(TAG, "AndroidKeyStore.getKey failed", e)
            null
        }
    }

    override fun getServerAliases(keyType: String, issuers: Array<Principal>?): Array<String>? = null

    override fun chooseServerAlias(
        keyType: String,
        issuers: Array<Principal>?,
        socket: Socket?,
    ): String? = null

    fun invalidate() {
        synchronized(this) {
            cachedAlias = null
            aliasResolved = false
        }
    }

    companion object {
        private const val TAG = "DynamicKeyManager"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEYCHAIN_PREFIX = "keychain:"
    }
}
