/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
 
 package com.Colota.bridge

import com.facebook.react.bridge.ReactApplicationContext
import com.Colota.BuildConfig
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import android.os.Build

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
            "FLAVOR" to BuildConfig.FLAVOR
        )
    }
}