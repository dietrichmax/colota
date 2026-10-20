package com.Colota.sync

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test

class SyncStateTest {
    @After
    fun tearDown() = SyncState.reset()

    @Test
    fun `a success stamps the time and clears the last error, so a recovered server reads as synced`() {
        SyncState.recordError("HTTP 401 Unauthorized")
        SyncState.recordSuccess(1_700_000_000_000L)

        assertEquals(1_700_000_000_000L, SyncState.lastSuccessTime)
        assertEquals("", SyncState.lastSyncError)
    }

    @Test
    fun `an error keeps the last success time, so the caption can still say when it last worked`() {
        SyncState.recordSuccess(1_700_000_000_000L)
        SyncState.recordError("Sync failed")

        assertEquals(1_700_000_000_000L, SyncState.lastSuccessTime)
        assertEquals("Sync failed", SyncState.lastSyncError)
    }

    /** Two senders can meet a 429 at once. */
    @Test
    fun `a shorter rate-limit wait never replaces a longer one`() {
        SyncState.holdFor(600, nowMs = 0L)
        SyncState.holdFor(60, nowMs = 0L)

        assertEquals(600L, SyncState.rateLimitWaitSeconds(0L))
    }

    @Test
    fun `a 429 without Retry-After holds uploads for 60 s`() {
        assertEquals(60L, SyncState.holdFor(null, nowMs = 0L))
        assertEquals(60L, SyncState.rateLimitWaitSeconds(0L))
    }

    /** A bad Retry-After must not hold the queue for a day. */
    @Test
    fun `a Retry-After longer than 15 min is capped`() {
        assertEquals(900L, SyncState.holdFor(86_400, nowMs = 0L))
        assertEquals(900L, SyncState.rateLimitWaitSeconds(0L))
    }

    @Test
    fun `a clock set back cannot hold uploads longer than the cap`() {
        SyncState.holdFor(60, nowMs = 0L)

        assertEquals(900L, SyncState.rateLimitWaitSeconds(-2 * 60 * 60 * 1000L))
    }

    /** The screen shows the wait in whole seconds, so the last part-second still reads as one. */
    @Test
    fun `the wait rounds up and ends when its time has passed`() {
        SyncState.holdFor(30, nowMs = 0L)

        assertEquals(1L, SyncState.rateLimitWaitSeconds(29_001L))
        assertEquals(0L, SyncState.rateLimitWaitSeconds(30_000L))
    }
}
