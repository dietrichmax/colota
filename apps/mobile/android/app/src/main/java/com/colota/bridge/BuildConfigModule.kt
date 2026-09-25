/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

 package com.Colota.bridge

import android.os.Build
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.app.LocaleManagerCompat
import androidx.core.os.LocaleListCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.Colota.BuildConfig
import com.Colota.util.AppLanguage
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import java.util.Locale

class BuildConfigModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "BuildConfigModule"

    override fun getConstants(): Map<String, Any> {
        return mapOf(
            "VERSION_NAME" to BuildConfig.VERSION_NAME,
            "VERSION_CODE" to BuildConfig.VERSION_CODE,
            "FLAVOR" to BuildConfig.FLAVOR,
            "APP_LANGUAGE" to Locale.getDefault().toLanguageTag()
        )
    }

    /** The picked language ("" while the app follows the system) and the language it runs in now. */
    @ReactMethod
    fun getAppLanguage(promise: Promise) {
        try {
            val picked = AppCompatDelegate.getApplicationLocales()[0]?.toLanguageTag() ?: ""
            promise.resolve(
                Arguments.createMap().apply {
                    putString("picked", picked)
                    putString("effective", effectiveLanguage(picked))
                }
            )
        } catch (e: Exception) {
            promise.reject("E_APP_LANGUAGE", e.message ?: "Could not read the app language", e)
        }
    }

    /** "" follows the system. */
    @ReactMethod
    fun setAppLanguage(tag: String, promise: Promise) {
        UiThreadUtil.runOnUiThread {
            try {
                val stored = withPhoneRegion(tag)
                AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(stored))
                AppLanguage.use(reactApplicationContext, stored)
                promise.resolve(effectiveLanguage(stored))
            } catch (e: Exception) {
                promise.reject("E_APP_LANGUAGE", e.message ?: "Could not change the app language", e)
            }
        }
    }

    // The pick names a language only; the phone's region keeps unit, clock and number defaults where they were.
    private fun withPhoneRegion(tag: String): String {
        if (tag.isEmpty()) return tag
        val picked = Locale.forLanguageTag(tag)
        val region = LocaleManagerCompat.getSystemLocales(reactApplicationContext)[0]?.country.orEmpty()
        if (picked.country.isNotEmpty() || region.isEmpty()) return tag
        return Locale.Builder().setLocale(picked).setRegion(region).build().toLanguageTag()
    }

    private fun effectiveLanguage(picked: String): String {
        val locale = if (picked.isEmpty()) LocaleManagerCompat.getSystemLocales(reactApplicationContext)[0] else Locale.forLanguageTag(picked)
        return (locale ?: Locale.getDefault()).toLanguageTag()
    }

    /**
     * The wallpaper-derived tonal steps the theme reads, as `#RRGGBB`. Null below API 31, where
     * the framework has no such palette. Hex rather than PlatformColor: the theme concatenates
     * alpha onto its colours as strings, which an opaque colour object cannot do.
     */
    @ReactMethod
    fun getSystemPalette(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            promise.resolve(null)
            return
        }
        val palette = Arguments.createMap()
        for ((name, resId) in systemPaletteIds()) {
            val color = reactApplicationContext.getColor(resId)
            palette.putString(name, String.format(Locale.US, "#%06X", color and 0xFFFFFF))
        }
        promise.resolve(palette)
    }

    private fun systemPaletteIds(): List<Pair<String, Int>> = listOf(
        "accent1_100" to android.R.color.system_accent1_100,
        "accent1_200" to android.R.color.system_accent1_200,
        "accent1_300" to android.R.color.system_accent1_300,
        "accent1_600" to android.R.color.system_accent1_600,
        "accent1_700" to android.R.color.system_accent1_700,
        "accent1_900" to android.R.color.system_accent1_900,
        "neutral1_0" to android.R.color.system_neutral1_0,
        "neutral1_50" to android.R.color.system_neutral1_50,
        "neutral1_700" to android.R.color.system_neutral1_700,
        "neutral1_800" to android.R.color.system_neutral1_800,
        "neutral1_900" to android.R.color.system_neutral1_900,
        "neutral2_100" to android.R.color.system_neutral2_100,
        "neutral2_200" to android.R.color.system_neutral2_200,
        "neutral2_300" to android.R.color.system_neutral2_300,
        "neutral2_400" to android.R.color.system_neutral2_400,
        "neutral2_500" to android.R.color.system_neutral2_500,
        "neutral2_600" to android.R.color.system_neutral2_600,
        "neutral2_700" to android.R.color.system_neutral2_700,
        "neutral2_800" to android.R.color.system_neutral2_800
    )
}
