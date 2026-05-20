/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.bridge

import android.app.Activity
import android.content.Intent
import com.Colota.sync.ApiFormat
import com.Colota.sync.NetworkManager
import com.Colota.sync.tls.ClientCertSslContextProvider
import com.Colota.util.AppLogger
import com.Colota.util.SecureStorageHelper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicReference

/**
 * React Native bridge for mTLS client certificate management.
 *
 * Owns:
 *   - PKCS12 import (.p12 / .pfx) via SAF picker -> AndroidKeyStore
 *   - System KeyChain alias pick (cert stays in OS keystore)
 *   - Trusted Server CA import via SAF picker -> EncryptedSharedPreferences
 *   - Test Connection endpoint check that exercises the full TLS path
 *
 * Picker request codes use the 9200-9299 range; the location module owns
 * 9000-9099 and auto-export 9100-9199 (per bridge-module-split conventions).
 */
class MtlsBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val secureStorage = SecureStorageHelper.getInstance(reactContext)
    private val networkManager = NetworkManager(reactContext)
    private val moduleScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // @ReactMethod writes, onActivityResult reads on the main thread - CAS prevents double-pick races.
    private val p12PickerPromise = AtomicReference<Promise?>(null)
    private val serverCaPickerPromise = AtomicReference<Promise?>(null)

    private val activityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            when (requestCode) {
                P12_PICKER_REQUEST -> handleFilePickerResult(p12PickerPromise, resultCode, data, "E_P12_READ", ".p12")
                SERVER_CA_PICKER_REQUEST ->
                    handleFilePickerResult(serverCaPickerPromise, resultCode, data, "E_CA_READ", "CA")
            }
        }
    }

    /**
     * Resolves the picker's promise with base64 of the picked file's bytes, or
     * null on cancel. Bounded by [P12_MAX_BYTES] to prevent OOM on hostile content providers.
     */
    private fun handleFilePickerResult(
        promiseRef: AtomicReference<Promise?>,
        resultCode: Int,
        data: Intent?,
        errorCode: String,
        label: String,
    ) {
        val promise = promiseRef.getAndSet(null) ?: return
        if (resultCode != Activity.RESULT_OK || data?.data == null) {
            promise.resolve(null)
            return
        }
        try {
            val bytes = reactApplicationContext.contentResolver.openInputStream(data.data!!)?.use { stream ->
                readBoundedBytes(stream, P12_MAX_BYTES)
            } ?: throw java.io.IOException("Could not open file")
            promise.resolve(android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP))
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to read picked $label file", e)
            promise.reject(errorCode, e.message ?: "Failed to read file", e)
        }
    }

    init {
        reactContext.addActivityEventListener(activityEventListener)
    }

    override fun getName(): String = "MtlsBridgeModule"

    override fun invalidate() {
        moduleScope.cancel()
        reactApplicationContext.removeActivityEventListener(activityEventListener)
        super.invalidate()
    }

    // ── @ReactMethods: client cert ───────────────────────────────────────

    // Returns the base64 of the picked PKCS12 file. JS collects the password and
    // calls importClientCert next.
    @ReactMethod
    fun pickClientCertFile(promise: Promise) =
        launchFilePicker(promise, p12PickerPromise, P12_PICKER_REQUEST, P12_MIME_TYPES)

    @ReactMethod
    fun importClientCert(b64: String, password: String, promise: Promise) {
        moduleScope.launch {
            // JS-side String is immutable and can't be wiped; the best we can do
            // is zero the CharArray we hand to the keystore.
            val passwordChars = password.toCharArray()
            try {
                val bytes = withContext(Dispatchers.IO) {
                    android.util.Base64.decode(b64, android.util.Base64.NO_WRAP)
                }
                val info = withContext(Dispatchers.IO) {
                    ClientCertSslContextProvider.importToAndroidKeyStore(bytes, passwordChars)
                }
                // Mutual exclusion: clear any previously chosen KeyChain alias.
                secureStorage.clearKeyChainAlias()
                networkManager.invalidateClientCertCache()
                promise.resolve(buildCertInfoMap(info))
            } catch (e: java.security.UnrecoverableKeyException) {
                promise.reject("E_CERT_PASSWORD", "Incorrect password for client certificate", e)
            } catch (e: java.io.IOException) {
                val msg = e.message ?: ""
                if (msg.contains("password", ignoreCase = true) || msg.contains("mac", ignoreCase = true)) {
                    promise.reject("E_CERT_PASSWORD", "Incorrect password for client certificate", e)
                } else {
                    promise.reject("E_CERT_INVALID", "Not a valid PKCS12 file: $msg", e)
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "importClientCert failed", e)
                promise.reject("E_CERT_INVALID", e.message ?: "Failed to import certificate", e)
            } finally {
                java.util.Arrays.fill(passwordChars, ' ')
            }
        }
    }

    @ReactMethod
    fun clearClientCert(promise: Promise) = executeAsync(promise) {
        ClientCertSslContextProvider.deleteAndroidKeyStoreClientCert()
        secureStorage.clearKeyChainAlias()
        networkManager.invalidateClientCertCache()
        true
    }

    @ReactMethod
    fun getClientCertInfo(promise: Promise) = executeAsync(promise) {
        val keychainAlias = secureStorage.getKeyChainAlias()
        val info = if (keychainAlias != null) {
            ClientCertSslContextProvider.getKeyChainCertInfo(reactApplicationContext, keychainAlias)
        } else {
            ClientCertSslContextProvider.getAndroidKeyStoreClientCertInfo()
        }
        if (info == null) {
            Arguments.createMap().apply { putBoolean("configured", false) }
        } else {
            buildCertInfoMap(info).apply {
                putBoolean("configured", true)
                putString("source", if (keychainAlias != null) "keychain" else "p12")
            }
        }
    }

    /**
     * Opens Android's system KeyChain alias picker. If the user picks a cert,
     * persists the alias and returns the leaf cert info. The cert and its
     * private key stay in the OS KeyChain - this app never sees the bytes.
     */
    @ReactMethod
    fun pickKeyChainCert(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "No current activity")
            return
        }
        android.security.KeyChain.choosePrivateKeyAlias(
            activity,
            { alias ->
                if (alias == null) {
                    promise.resolve(null)
                    return@choosePrivateKeyAlias
                }
                moduleScope.launch {
                    try {
                        val info = withContext(Dispatchers.IO) {
                            ClientCertSslContextProvider.getKeyChainCertInfo(reactApplicationContext, alias)
                        }
                        if (info == null) {
                            promise.reject("E_KEYCHAIN_ACCESS", "Could not read certificate from KeyChain")
                            return@launch
                        }
                        secureStorage.setKeyChainAlias(alias)
                        // Mutual exclusion: drop any previously imported .p12.
                        ClientCertSslContextProvider.deleteAndroidKeyStoreClientCert()
                        networkManager.invalidateClientCertCache()
                        promise.resolve(buildCertInfoMap(info).apply {
                            putBoolean("configured", true)
                            putString("source", "keychain")
                        })
                    } catch (e: Exception) {
                        AppLogger.e(TAG, "pickKeyChainCert failed", e)
                        promise.reject("E_KEYCHAIN_FAIL", e.message ?: "KeyChain selection failed", e)
                    }
                }
            },
            null, null, null, -1, null,
        )
    }

    // ── @ReactMethods: trusted server CA ─────────────────────────────────

    // Returns the base64 of the picked CA cert file (PEM or DER).
    @ReactMethod
    fun pickServerCaFile(promise: Promise) =
        launchFilePicker(promise, serverCaPickerPromise, SERVER_CA_PICKER_REQUEST, CA_MIME_TYPES)

    /**
     * Validates the base64-encoded X.509 cert and persists it. The cert is then
     * used as an ADDITIONAL trust anchor (alongside Android's system CAs) for
     * Colota's outbound HTTPS via the composite trust manager.
     */
    @ReactMethod
    fun importServerCa(b64: String, promise: Promise) {
        moduleScope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) {
                    android.util.Base64.decode(b64, android.util.Base64.NO_WRAP)
                }
                val info = withContext(Dispatchers.IO) {
                    ClientCertSslContextProvider.parseCaInfo(bytes)
                }
                withContext(Dispatchers.IO) {
                    secureStorage.setServerCa(bytes)
                }
                networkManager.invalidateClientCertCache()
                promise.resolve(buildCertInfoMap(info))
            } catch (e: Exception) {
                AppLogger.e(TAG, "importServerCa failed", e)
                promise.reject("E_CA_INVALID", "Not a valid X.509 certificate: ${e.message ?: ""}", e)
            }
        }
    }

    @ReactMethod
    fun clearServerCa(promise: Promise) = executeAsync(promise) {
        secureStorage.clearServerCa()
        networkManager.invalidateClientCertCache()
        true
    }

    @ReactMethod
    fun getServerCaInfo(promise: Promise) = executeAsync(promise) {
        val bytes = secureStorage.getServerCaBytes()
        if (bytes == null) {
            Arguments.createMap().apply { putBoolean("configured", false) }
        } else {
            try {
                val info = ClientCertSslContextProvider.parseCaInfo(bytes)
                buildCertInfoMap(info).apply { putBoolean("configured", true) }
            } catch (e: Exception) {
                AppLogger.w(TAG, "Stored server CA could not be parsed: ${e.message}")
                Arguments.createMap().apply {
                    putBoolean("configured", true)
                    putString("error", e.message ?: "CA unreadable")
                }
            }
        }
    }

    // ── @ReactMethod: test connection ────────────────────────────────────

    // Runs the network/SSL/auth path identically to production sync. The payload
    // shape can differ - production builds payloads natively, this one converts
    // a JS-supplied ReadableMap. Conversion handles all ReadableType variants so
    // nested fields don't blow up the bridge.
    @ReactMethod
    fun testEndpoint(args: ReadableMap, promise: Promise) {
        moduleScope.launch {
            try {
                val endpoint = args.getString("endpoint") ?: ""
                val method = args.getString("method") ?: "POST"
                val apiFormat = ApiFormat.fromWire(args.getString("apiFormat"))
                val payloadMap = args.getMap("payload") ?: Arguments.createMap()
                val customFieldsMap = args.getMap("customFields") ?: Arguments.createMap()

                val payload = payloadMap.toJson()
                val customFields = mutableMapOf<String, String>().apply {
                    val it = customFieldsMap.keySetIterator()
                    while (it.hasNextKey()) {
                        val key = it.nextKey()
                        put(key, customFieldsMap.getString(key) ?: "")
                    }
                }
                val authHeaders = secureStorage.getAuthHeaders()
                val result = networkManager.testEndpoint(
                    payload = payload,
                    endpoint = endpoint,
                    extraHeaders = authHeaders,
                    httpMethod = method,
                    apiFormat = apiFormat,
                    customFields = customFields,
                )
                promise.resolve(Arguments.createMap().apply {
                    putBoolean("ok", result.ok)
                    putInt("status", result.httpStatus)
                    if (result.errorMessage != null) putString("errorMessage", result.errorMessage)
                })
            } catch (e: Exception) {
                AppLogger.e(TAG, "testEndpoint failed", e)
                promise.reject("E_TEST_ENDPOINT", e.message ?: "Test failed", e)
            }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private fun executeAsync(promise: Promise, operation: suspend () -> Any?) =
        moduleScope.launchForPromise(promise, TAG, "E_MTLS", "Operation failed", operation)

    /**
     * Opens an SAF ACTION_OPEN_DOCUMENT picker filtered by [mimeTypes], reserves the
     * promise atomically against double-pick races, and rolls back on launch failure.
     */
    private fun launchFilePicker(
        promise: Promise,
        promiseRef: AtomicReference<Promise?>,
        requestCode: Int,
        mimeTypes: Array<String>,
    ) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "No current activity")
            return
        }
        if (!promiseRef.compareAndSet(null, promise)) {
            promise.reject("E_PICKER_BUSY", "A picker is already open")
            return
        }
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes)
        }
        try {
            activity.startActivityForResult(intent, requestCode)
        } catch (e: Exception) {
            promiseRef.compareAndSet(promise, null)
            promise.reject("E_PICKER_LAUNCH", e.message ?: "Failed to launch picker", e)
        }
    }

    private fun buildCertInfoMap(info: ClientCertSslContextProvider.CertInfo): WritableMap =
        Arguments.createMap().apply {
            putString("subject", info.subject)
            putString("issuer", info.issuer)
            putDouble("notBefore", info.notBefore.toDouble())
            putDouble("notAfter", info.notAfter.toDouble())
        }

    /**
     * Reads at most [maxBytes] from [stream] in chunks, throwing if the source
     * exceeds the cap. Avoids letting a malicious or oversized provider hand us
     * gigabytes via InputStream.readBytes().
     */
    private fun readBoundedBytes(stream: java.io.InputStream, maxBytes: Int): ByteArray {
        val baos = java.io.ByteArrayOutputStream()
        val buf = ByteArray(8192)
        var total = 0
        while (true) {
            val n = stream.read(buf)
            if (n == -1) break
            total += n
            if (total > maxBytes) {
                throw java.io.IOException("File too large (over $maxBytes bytes)")
            }
            baos.write(buf, 0, n)
        }
        return baos.toByteArray()
    }

    companion object {
        private const val TAG = "MtlsBridgeModule"
        private const val P12_PICKER_REQUEST = 9200
        private const val SERVER_CA_PICKER_REQUEST = 9201
        private const val P12_MAX_BYTES = 256 * 1024 // 256 KiB cap - real .p12 / .crt files are well under 20 KiB

        private val P12_MIME_TYPES = arrayOf(
            "application/x-pkcs12",
            "application/pkcs12",
            "application/octet-stream",
            "*/*",
        )
        private val CA_MIME_TYPES = arrayOf(
            "application/x-x509-ca-cert",
            "application/pkix-cert",
            "application/x-pem-file",
            "application/octet-stream",
            "*/*",
        )
    }
}
