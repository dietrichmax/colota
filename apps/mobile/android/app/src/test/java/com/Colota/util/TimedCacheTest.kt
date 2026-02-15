package com.Colota.util

import org.junit.Assert.*
import org.junit.Test

class TimedCacheTest {

    @Test
    fun `get returns loaded value`() {
        val cache = TimedCache(5000L) { "hello" }
        assertEquals("hello", cache.get())
    }

    @Test
    fun `get returns same value within TTL`() {
        var callCount = 0
        val cache = TimedCache(5000L) { callCount++; "value-$callCount" }

        val first = cache.get()
        val second = cache.get()

        assertEquals(first, second)
        assertEquals(1, callCount)
    }

    @Test
    fun `get reloads value after TTL expires`() {
        var callCount = 0
        val cache = TimedCache(50L) { callCount++; "value-$callCount" }

        val first = cache.get()
        Thread.sleep(100)
        val second = cache.get()

        assertEquals("value-1", first)
        assertEquals("value-2", second)
        assertEquals(2, callCount)
    }

    @Test
    fun `invalidate causes reload on next get`() {
        var callCount = 0
        val cache = TimedCache(60000L) { callCount++; "value-$callCount" }

        cache.get()
        assertEquals(1, callCount)

        cache.invalidate()
        cache.get()
        assertEquals(2, callCount)
    }

    @Test
    fun `works with nullable loader that returns non-null`() {
        val cache = TimedCache<List<String>>(5000L) { listOf("a", "b") }
        assertEquals(listOf("a", "b"), cache.get())
    }

    @Test
    fun `loader is called exactly once per expiry cycle`() {
        var callCount = 0
        val cache = TimedCache(50L) { callCount++ }

        // First cycle
        cache.get()
        cache.get()
        cache.get()
        assertEquals(1, callCount)

        // Wait for expiry
        Thread.sleep(100)

        // Second cycle
        cache.get()
        cache.get()
        assertEquals(2, callCount)
    }
}
