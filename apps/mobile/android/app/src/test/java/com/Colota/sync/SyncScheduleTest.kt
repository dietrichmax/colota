package com.Colota.sync

import org.junit.Assert.assertEquals
import org.junit.Test

class SyncScheduleTest {

    private var now = 0L
    private val schedule = SyncSchedule { now }

    /** A server that keeps failing is asked less and less often, never less than every 15 min. */
    @Test
    fun `the backoff grows from 30 s to 15 min and stays there`() {
        assertEquals(listOf(30L, 60L, 300L, 900L, 900L), (1..5).map { SyncSchedule.backoffSeconds(it) })
    }

    @Test
    fun `the first tick waits a full interval`() {
        assertEquals(300L, schedule.nextPeriodicDelaySeconds(300, resumingWait = false))
    }

    /** A profile switch mid-wait shortens the wait already running, not the one after it. */
    @Test
    fun `a shorter interval counts from when the running wait began`() {
        schedule.nextPeriodicDelaySeconds(900, resumingWait = false)
        now += 100_000

        assertEquals(200L, schedule.nextPeriodicDelaySeconds(300, resumingWait = true))
    }

    @Test
    fun `a resumed wait the new interval already covers ticks at once`() {
        schedule.nextPeriodicDelaySeconds(900, resumingWait = false)
        now += 400_000

        assertEquals(0L, schedule.nextPeriodicDelaySeconds(300, resumingWait = true))
    }

    @Test
    fun `a wait that ran out starts the next full interval`() {
        schedule.nextPeriodicDelaySeconds(300, resumingWait = false)
        now += 300_000

        assertEquals(300L, schedule.nextPeriodicDelaySeconds(300, resumingWait = false))
        now += 100_000
        assertEquals(200L, schedule.nextPeriodicDelaySeconds(300, resumingWait = false))
    }
}
