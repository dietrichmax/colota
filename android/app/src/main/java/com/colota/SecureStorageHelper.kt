/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject

/**
 * Singleton wrapper around EncryptedSharedPreferences for storing
 * sensitive connection data (credentials, tokens, headers, endpoint).
 */
class SecureStorageHelper private constructor(context: Context) {

    companion object {
        private const val TAG = "SecureStorageHelper"
        private const val PREFS_NAME = "colota_secure_prefs"

        const val KEY_AUTH_TYPE = "auth_type"
        const val KEY_USERNAME = "auth_username"
        const val KEY_PASSWORD = "auth_password"
        const val KEY_BEARER_TOKEN = "auth_bearer_token"
        const val KEY_ENDPOINT = "endpoint"
        const val KEY_CUSTOM_HEADERS = "custom_headers"

        @Volatile
        private var INSTANCE: SecureStorageHelper? = null

        @JvmStatic
        fun getInstance(context: Context): SecureStorageHelper {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: SecureStorageHelper(context.applicationContext).also {
                    INSTANCE = it
                }
            }
        }
    }

    private val prefs: SharedPreferences

    init {
        val masterKey = MasterKey.Builder(context.applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        prefs = EncryptedSharedPreferences.create(
            context.applicationContext,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun getString(key: String, default: String? = null): String? = prefs.getString(key, default)

    fun putString(key: String, value: String) {
        prefs.edit().putString(key, value).apply()
    }

    fun remove(key: String) {
        prefs.edit().remove(key).apply()
    }

    /**
     * Builds the full set of auth + custom headers for HTTP requests.
     */
    fun getAuthHeaders(): Map<String, String> {
        val headers = mutableMapOf<String, String>()

        when (getString(KEY_AUTH_TYPE, "none")) {
            "basic" -> {
                val user = getString(KEY_USERNAME, "") ?: ""
                val pass = getString(KEY_PASSWORD, "") ?: ""
                if (user.isNotBlank()) {
                    val encoded = Base64.encodeToString(
                        "$user:$pass".toByteArray(),
                        Base64.NO_WRAP
                    )
                    headers["Authorization"] = "Basic $encoded"
                }
            }
            "bearer" -> {
                val token = getString(KEY_BEARER_TOKEN, "") ?: ""
                if (token.isNotBlank()) {
                    headers["Authorization"] = "Bearer $token"
                }
            }
        }

        val customJson = getString(KEY_CUSTOM_HEADERS, null)
        if (!customJson.isNullOrBlank()) {
            try {
                val jsonObj = JSONObject(customJson)
                val keys = jsonObj.keys()
                while (keys.hasNext()) {
                    val k = keys.next()
                    val v = jsonObj.getString(k)
                    if (k.isNotBlank() && v.isNotBlank()) {
                        headers[k] = v
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to parse custom headers", e)
            }
        }

        return headers
    }

    fun getEndpoint(): String? = getString(KEY_ENDPOINT, null)
}
