/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.bridge

import com.Colota.util.AppLogger
import com.facebook.react.bridge.Promise
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
