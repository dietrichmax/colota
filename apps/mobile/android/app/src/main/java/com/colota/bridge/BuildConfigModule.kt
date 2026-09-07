/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

 package com.Colota.bridge

import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.Colota.BuildConfig
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

class BuildConfigModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "BuildConfigModule"

    override fun getConstants(): Map<String, Any> {
        return mapOf(
            "MIN_SDK_VERSION" to BuildConfig.MIN_SDK_VERSION,
            "TARGET_SDK_VERSION" to BuildConfig.TARGET_SDK_VERSION,
            "BUILD_TOOLS_VERSION" to BuildConfig.BUILD_TOOLS_VERSION,
            "COMPILE_SDK_VERSION" to BuildConfig.COMPILE_SDK_VERSION,
            "KOTLIN_VERSION" to BuildConfig.KOTLIN_VERSION,
            "NDK_VERSION" to BuildConfig.NDK_VERSION,
            "VERSION_NAME" to BuildConfig.VERSION_NAME,
            "VERSION_CODE" to BuildConfig.VERSION_CODE,
            "FLAVOR" to BuildConfig.FLAVOR,
            "APP_LANGUAGE" to Locale.getDefault().toLanguageTag()
        )
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
        "accent1_800" to android.R.color.system_accent1_800,
        "accent1_900" to android.R.color.system_accent1_900,
        "neutral1_0" to android.R.color.system_neutral1_0,
        "neutral1_50" to android.R.color.system_neutral1_50,
        "neutral1_600" to android.R.color.system_neutral1_600,
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
