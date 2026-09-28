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
        SyncState.holdUntil(600_000L)
        SyncState.holdUntil(60_000L)

        assertEquals(600_000L, SyncState.rateLimitedUntil)
    }
}
