/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
package com.Colota.util

/**
 * Generic time-based cache that reloads its value after a configurable TTL.
 * Thread-safe via @Volatile annotations.
 *
 * @param ttlMs Time-to-live in milliseconds before the cached value is refreshed
 * @param loader Function that produces a fresh value when the cache is stale
 */
class TimedCache<T>(
    private val ttlMs: Long,
    private val loader: () -> T
) {
    @Volatile private var value: T? = null
    @Volatile private var lastCheck: Long = 0

    fun get(): T {
        val now = System.currentTimeMillis()
        if (value == null || (now - lastCheck) > ttlMs) {
            value = loader()
            lastCheck = now
        }
        return value!!
    }

    fun invalidate() {
        lastCheck = 0
    }
}
