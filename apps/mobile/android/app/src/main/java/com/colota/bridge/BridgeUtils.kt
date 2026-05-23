/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.bridge

import com.Colota.util.AppLogger
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Runs [operation] on Dispatchers.IO and resolves/rejects the JS promise.
 * Per-module wrappers usually preserve the [errorCode] and [errorMessage]
 * that callers downstream rely on.
 */
internal fun CoroutineScope.launchForPromise(
    promise: Promise,
    tag: String,
    errorCode: String,
    errorMessage: String,
    operation: suspend () -> Any?,
) {
    launch {
        try {
            promise.resolve(withContext(Dispatchers.IO) { operation() })
        } catch (e: Exception) {
            AppLogger.e(tag, errorMessage, e)
            promise.reject(errorCode, e.message, e)
        }
    }
}

/**
 * Converts a JS-side array of UTF-16 code points (passed as ints) to a CharArray.
 * Used for passwords so the secret never lands in a Java String's intern pool.
 */
internal fun readableArrayToCharArray(codes: ReadableArray): CharArray =
    CharArray(codes.size()) { i -> codes.getInt(i).toChar() }
