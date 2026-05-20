/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.sync.tls

import android.content.Context
import com.Colota.util.AppLogger
import com.Colota.util.SecureStorageHelper
import java.io.ByteArrayInputStream
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.net.ssl.KeyManager
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManager
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/**
 * Builds the cached [SSLSocketFactory] for mTLS-protected endpoints. Client cert
 * comes from [AndroidKeyStore], server CA from [SecureStorageHelper]. Call
 * [invalidate] when either changes.
 *
 * Singleton because the SSL factory cache is process-wide - if both the
 * foreground service's NetworkManager and the bridge module's NetworkManager
 * held separate caches, invalidating one wouldn't propagate to the other and a
 * mid-session cert swap would surface stale state on the un-invalidated path.
 */
class ClientCertSslContextProvider private constructor(context: Context) {

    private val secureStorage = SecureStorageHelper.getInstance(context)
    private val keyManager = DynamicKeyManager(context.applicationContext)

    @Volatile private var cachedFactory: SSLSocketFactory? = null
    @Volatile private var cacheLoaded: Boolean = false

    /** Returns null when neither a client cert nor a server CA is configured. */
    fun get(): SSLSocketFactory? {
        if (cacheLoaded) return cachedFactory
        synchronized(this) {
            if (cacheLoaded) return cachedFactory
            val hasClientCert = hasAnyClientCert()
            val caBytes = secureStorage.getServerCaBytes()
            cachedFactory = if (!hasClientCert && caBytes == null) {
                null
            } else {
                try {
                    buildFactoryFromKeyStore(hasClientCert, caBytes)
                } catch (e: Exception) {
                    AppLogger.e(TAG, "Failed to build SSL context from stored material", e)
                    null
                }
            }
            cacheLoaded = true
            return cachedFactory
        }
    }

    private fun hasAnyClientCert(): Boolean =
        secureStorage.getKeyChainAlias() != null || hasAndroidKeyStoreClientCert()

    private fun buildFactoryFromKeyStore(hasClientCert: Boolean, serverCaBytes: ByteArray?): SSLSocketFactory {
        val keyManagers: Array<KeyManager>? = if (hasClientCert) arrayOf(keyManager) else null
        val trustManagers: Array<TrustManager>? = serverCaBytes?.let { buildTrustManagers(it) }
        val sslContext = SSLContext.getInstance("TLS").apply {
            init(keyManagers, trustManagers, null)
        }
        return sslContext.socketFactory
    }

    fun invalidate() {
        synchronized(this) {
            cachedFactory = null
            cacheLoaded = false
            keyManager.invalidate()
        }
    }

    companion object {
        private const val TAG = "ClientCertSslContextProvider"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        internal const val CLIENT_CERT_ALIAS = "colota_client_cert"

        @Volatile private var INSTANCE: ClientCertSslContextProvider? = null

        @JvmStatic
        fun getInstance(context: Context): ClientCertSslContextProvider =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: ClientCertSslContextProvider(context.applicationContext).also { INSTANCE = it }
            }

        private fun X509Certificate.toCertInfo() = CertInfo(
            subject = subjectDN.name,
            issuer = issuerDN.name,
            notBefore = notBefore.time,
            notAfter = notAfter.time,
        )

        // Unwraps the PKCS12 and writes the key + chain into AndroidKeyStore.
        // The password is consumed here and never persisted.
        @JvmStatic
        fun importToAndroidKeyStore(pkcs12Bytes: ByteArray, password: CharArray): CertInfo {
            val tmp = KeyStore.getInstance("PKCS12").apply {
                load(ByteArrayInputStream(pkcs12Bytes), password)
            }
            val keyAliases = tmp.aliases().asSequence().filter { tmp.isKeyEntry(it) }.toList()
            if (keyAliases.isEmpty()) {
                throw java.security.KeyStoreException("PKCS12 contains no key entries")
            }
            if (keyAliases.size > 1) {
                AppLogger.w(TAG, "PKCS12 contains ${keyAliases.size} key entries; using first: ${keyAliases.first()}")
            }
            val alias = keyAliases.first()
            val privateKey = tmp.getKey(alias, password) as java.security.PrivateKey
            val chain = tmp.getCertificateChain(alias)
                ?: throw java.security.KeyStoreException("PKCS12 has key entry but no certificate chain")

            val androidKs = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            if (androidKs.containsAlias(CLIENT_CERT_ALIAS)) {
                androidKs.deleteEntry(CLIENT_CERT_ALIAS)
            }
            androidKs.setKeyEntry(CLIENT_CERT_ALIAS, privateKey, null, chain)

            return (chain[0] as X509Certificate).toCertInfo()
        }

        @JvmStatic
        fun hasAndroidKeyStoreClientCert(): Boolean = try {
            KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }.containsAlias(CLIENT_CERT_ALIAS)
        } catch (e: Exception) {
            AppLogger.w(TAG, "AndroidKeyStore unavailable: ${e.message}")
            false
        }

        @JvmStatic
        fun getAndroidKeyStoreClientCertInfo(): CertInfo? = try {
            val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            if (!ks.containsAlias(CLIENT_CERT_ALIAS)) return null
            (ks.getCertificate(CLIENT_CERT_ALIAS) as? X509Certificate)?.toCertInfo()
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to read client cert from AndroidKeyStore", e)
            null
        }

        @JvmStatic
        fun deleteAndroidKeyStoreClientCert() {
            try {
                val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
                if (ks.containsAlias(CLIENT_CERT_ALIAS)) {
                    ks.deleteEntry(CLIENT_CERT_ALIAS)
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "Failed to delete client cert from AndroidKeyStore", e)
            }
        }

        /**
         * Reads cert info for an alias stored in Android's system KeyChain.
         * Blocks - call from an IO thread.
         */
        @JvmStatic
        fun getKeyChainCertInfo(context: Context, alias: String): CertInfo? = try {
            android.security.KeyChain.getCertificateChain(context, alias)?.firstOrNull()?.toCertInfo()
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to read KeyChain cert for alias '$alias'", e)
            null
        }

        @JvmStatic
        fun buildTrustManagers(serverCaBytes: ByteArray): Array<TrustManager> {
            val ca = CertificateFactory.getInstance("X.509")
                .generateCertificate(ByteArrayInputStream(serverCaBytes)) as X509Certificate

            val userKs = KeyStore.getInstance(KeyStore.getDefaultType()).apply {
                load(null, null)
                setCertificateEntry("user-ca", ca)
            }
            val userTmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply {
                init(userKs)
            }
            val systemTmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply {
                init(null as KeyStore?)
            }
            val userTm = userTmf.trustManagers.filterIsInstance<X509TrustManager>().first()
            val systemTm = systemTmf.trustManagers.filterIsInstance<X509TrustManager>().first()
            return arrayOf(CompositeX509TrustManager(listOf(systemTm, userTm)))
        }

        @JvmStatic
        fun parseCaInfo(bytes: ByteArray): CertInfo {
            val cert = CertificateFactory.getInstance("X.509")
                .generateCertificate(ByteArrayInputStream(bytes)) as X509Certificate
            return cert.toCertInfo()
        }

    }

    data class CertInfo(
        val subject: String,
        val issuer: String,
        val notBefore: Long,
        val notAfter: Long,
    )
}
