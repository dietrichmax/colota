package com.Colota.service

import android.app.Notification
import android.app.NotificationManager
import com.Colota.R
import io.mockk.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * Tests for NotificationHelper using a real instance with mocked Android deps:
 * - Status building
 * - Time-since-last-sync formatting
 * - Deduplication
 * - Posted notification fields (Robolectric)
 */
class NotificationHelperTest {

    companion object {
        const val FIX = 1_700_000_000_000L
        const val NOW = FIX + 600_000L

        fun input(
            locationEnabled: Boolean = true,
            isPaused: Boolean = false,
            isWifiPaused: Boolean = false,
            isMotionlessPaused: Boolean = false,
            isStationary: Boolean = false,
            hasFix: Boolean = false,
            lastFixMs: Long = FIX,
            isOfflineMode: Boolean = false,
            queuedCount: Int = 0,
            lastSyncTime: Long = 0L
        ) = NotificationHelper.StatusInput(
            locationEnabled, isPaused, isWifiPaused, isMotionlessPaused, isStationary,
            hasFix, lastFixMs, isOfflineMode, queuedCount, lastSyncTime
        )
    }

    // --- channel routing (Robolectric: a real Notification, so the channel can be read back) ---

    @RunWith(RobolectricTestRunner::class)
    class ChannelRouting {
        private fun helperFor(): Pair<NotificationHelper, NotificationManager> {
            val ctx = RuntimeEnvironment.getApplication()
            val nm = ctx.getSystemService(NotificationManager::class.java)
            return NotificationHelper(ctx, nm) to nm
        }

        @Test
        fun `an unexpected stop goes to the alerting channel`() {
            val (helper, _) = helperFor()
            helper.createChannel()

            val n = helper.buildStoppedNotification("killed", unexpected = true)

            assertEquals(NotificationHelper.STOPPED_CHANNEL_ID, n.channelId)
        }

        @Test
        fun `a stop the user asked for stays on the silent tracking channel`() {
            val (helper, _) = helperFor()
            helper.createChannel()

            val n = helper.buildStoppedNotification("stopped via shortcut", unexpected = false)

            assertEquals(NotificationHelper.CHANNEL_ID, n.channelId)
        }

        @Test
        fun `the alerting channel can actually alert and the tracking channel cannot`() {
            val (helper, nm) = helperFor()
            helper.createChannel()

            val tracking = nm.getNotificationChannel(NotificationHelper.CHANNEL_ID)
            val stopped = nm.getNotificationChannel(NotificationHelper.STOPPED_CHANNEL_ID)

            assertEquals(NotificationManager.IMPORTANCE_LOW, tracking.importance)
            assertEquals(NotificationManager.IMPORTANCE_DEFAULT, stopped.importance)
        }
    }

    // --- posted notification (Robolectric) ---

    @RunWith(RobolectricTestRunner::class)
    class TrackingNotification {
        private lateinit var helper: NotificationHelper
        private lateinit var nm: NotificationManager

        @Before
        fun setUp() {
            val ctx = RuntimeEnvironment.getApplication()
            nm = ctx.getSystemService(NotificationManager::class.java)
            helper = NotificationHelper(ctx, nm)
            helper.createChannel()
        }

        private fun posted(): Notification = shadowOf(nm).getNotification(NotificationHelper.NOTIFICATION_ID)

        @Test
        fun `what is posted is the status that was built`() {
            helper.update(input(hasFix = true, queuedCount = 2))

            val n = posted()
            assertNull(n.extras.getString(Notification.EXTRA_TITLE))
            assertEquals("Tracking · 2 queued", n.extras.getString(Notification.EXTRA_TEXT))
            assertEquals("Tracking", n.extras.getString(Notification.EXTRA_TITLE_BIG))
            assertEquals("2 queued", n.extras.getString(Notification.EXTRA_BIG_TEXT))
        }

        @Test
        fun `from Android 12 there is no title and the state leads the text`() {
            helper.update(input(isPaused = true, isWifiPaused = true, hasFix = true))

            val n = posted()
            assertNull(n.extras.getString(Notification.EXTRA_TITLE))
            assertEquals("Paused · Zone WiFi · resumes when you leave · All sent", n.extras.getString(Notification.EXTRA_TEXT))
            assertEquals("Paused", n.extras.getString(Notification.EXTRA_TITLE_BIG))
            assertEquals("Zone WiFi · resumes when you leave · All sent", n.extras.getString(Notification.EXTRA_BIG_TEXT))
        }

        @Test
        @Config(sdk = [30])
        fun `before Android 12 the state is the title`() {
            helper.update(input(isPaused = true, isWifiPaused = true, hasFix = true))

            val n = posted()
            assertEquals("Paused", n.extras.getString(Notification.EXTRA_TITLE))
            assertEquals("Zone WiFi · resumes when you leave · All sent", n.extras.getString(Notification.EXTRA_TEXT))
        }

        @Test
        fun `the stopped notification keeps the full reason in the expanded view`() {
            val n = helper.buildStoppedNotification("killed", unexpected = true)

            assertNull(n.extras.getString(Notification.EXTRA_TITLE))
            assertEquals("Tracking stopped · killed", n.extras.getString(Notification.EXTRA_TEXT))
            assertEquals("Tracking stopped", n.extras.getString(Notification.EXTRA_TITLE_BIG))
            assertEquals("killed", n.extras.getString(Notification.EXTRA_BIG_TEXT))
        }

        @Test
        fun `the small icon is ic_notification`() {
            helper.update(input(hasFix = true))

            assertEquals(R.drawable.ic_notification, posted().smallIcon.resId)
        }

        @Test
        fun `the icon color is the launcher background`() {
            helper.update(input(hasFix = true))

            assertEquals(0xFF0D9387.toInt(), posted().color)
        }

        @Test
        fun `the header time is the last fix received`() {
            val s = input(hasFix = true, lastFixMs = FIX)
            helper.update(s)

            val n = posted()
            assertEquals(FIX, n.`when`)
            assertTrue(n.extras.getBoolean(Notification.EXTRA_SHOW_WHEN))
        }

        @Test
        fun `the tracking notification is public`() {
            helper.update(input(hasFix = true))

            val n = posted()
            assertEquals(Notification.VISIBILITY_PUBLIC, n.visibility)
            assertNull(n.publicVersion)
        }

        @Test
        fun `the stopped notification is public`() {
            assertEquals(Notification.VISIBILITY_PUBLIC, helper.buildStoppedNotification("killed", unexpected = true).visibility)
            assertEquals(Notification.VISIBILITY_PUBLIC, helper.buildStoppedNotification("stopped", unexpected = false).visibility)
        }

        @Test
        fun `the tracking notification is ongoing and silent on the tracking channel`() {
            helper.update(input(hasFix = true))

            val n = posted()
            assertTrue(n.flags and Notification.FLAG_ONGOING_EVENT != 0)
            assertEquals(NotificationHelper.CHANNEL_ID, n.channelId)
        }

        @Test
        fun `the foreground notification carries the same facts as an update`() {
            val n = helper.buildForegroundNotification(input(isStationary = true, hasFix = true, queuedCount = 3))

            assertEquals("Tracking · Stationary · 3 queued", n.extras.getString(Notification.EXTRA_TEXT))
            assertEquals("Stationary · 3 queued", n.extras.getString(Notification.EXTRA_BIG_TEXT))
        }
    }

    private lateinit var helper: NotificationHelper

    @Before
    fun setUp() {
        helper = spyk(
            NotificationHelper(mockk(relaxed = true), mockk(relaxed = true))
        )
        // Stub buildTrackingNotification to avoid PendingIntent.getActivity()
        every { helper.buildTrackingNotification(any(), any()) } returns mockk()
    }

    private fun status(s: NotificationHelper.StatusInput) = helper.buildStatus(s, NOW)

    // --- buildStatus ---

    @Test
    fun `a fix reads Tracking with the sending state and nothing about where it was`() {
        assertEquals(NotificationHelper.Status("Tracking", "All sent"), status(input(hasFix = true)))
    }

    @Test
    fun `a backed-up queue after a sync this run prints depth and age`() {
        assertEquals(
            "12 queued · last sync 3 min ago",
            status(input(hasFix = true, queuedCount = 12, lastSyncTime = NOW - 180_000L)).text
        )
    }

    @Test
    fun `a backed-up queue with no sync this run prints the depth alone`() {
        assertEquals("12 queued", status(input(hasFix = true, queuedCount = 12)).text)
    }

    @Test
    fun `an empty queue reads All sent regardless of the last sync time`() {
        assertEquals("All sent", status(input(hasFix = true, lastSyncTime = 0L)).text)
        assertEquals("All sent", status(input(hasFix = true, lastSyncTime = NOW - 60_000L)).text)
    }

    @Test
    fun `offline mode replaces every queue fact`() {
        assertEquals(
            "Offline mode",
            status(input(hasFix = true, isOfflineMode = true, queuedCount = 12, lastSyncTime = NOW - 60_000L)).text
        )
    }

    @Test
    fun `no fix reads Searching for GPS over the sending state`() {
        assertEquals(NotificationHelper.Status("Searching for GPS", "3 queued"), status(input(hasFix = false, queuedCount = 3)))
    }

    @Test
    fun `location services off takes precedence over pause and stationary`() {
        assertEquals(
            NotificationHelper.Status("Location services are off", "Not recording · All sent"),
            status(input(locationEnabled = false, isPaused = true, isStationary = true, hasFix = true))
        )
    }

    @Test
    fun `a zone pause shows how it resumes without the zone name`() {
        assertEquals(
            NotificationHelper.Status("Paused", "Inside zone · resumes when you leave · All sent"),
            status(input(isPaused = true, hasFix = true))
        )
    }

    @Test
    fun `a WiFi hold names the WiFi as the reason`() {
        assertEquals(
            "Zone WiFi · resumes when you leave · All sent",
            status(input(isPaused = true, isWifiPaused = true, hasFix = true)).text
        )
    }

    @Test
    fun `a motionless hold names movement as the release`() {
        assertEquals(
            "No movement · resumes when you move · All sent",
            status(input(isPaused = true, isMotionlessPaused = true, hasFix = true)).text
        )
    }

    @Test
    fun `WiFi wins over motionless when both hold`() {
        assertEquals(
            "Zone WiFi · resumes when you leave · All sent",
            status(input(isPaused = true, isWifiPaused = true, isMotionlessPaused = true, hasFix = true)).text
        )
    }

    @Test
    fun `a pause keeps the queue visible`() {
        assertEquals(
            "Inside zone · resumes when you leave · 5 queued · last sync just now",
            status(input(isPaused = true, hasFix = true, queuedCount = 5, lastSyncTime = NOW - 30_000L)).text
        )
    }

    @Test
    fun `a pause wins over stationary`() {
        assertEquals("Paused", status(input(isPaused = true, isStationary = true, hasFix = true)).title)
    }

    @Test
    fun `stationary keeps the Tracking title and prefixes Stationary`() {
        assertEquals(
            NotificationHelper.Status("Tracking", "Stationary · All sent"),
            status(input(isStationary = true, hasFix = true))
        )
    }

    @Test
    fun `stationary keeps the queue visible`() {
        assertEquals(
            "Stationary · 3 queued · last sync 1 h ago",
            status(input(isStationary = true, hasFix = true, queuedCount = 3, lastSyncTime = NOW - 3_600_000L)).text
        )
    }

    // --- formatTimeSinceSync ---

    @Test
    fun `under a minute is just now`() {
        assertEquals("just now", helper.formatTimeSinceSync(NOW - 30_000L, NOW))
    }

    @Test
    fun `one minute is singular`() {
        assertEquals("1 min ago", helper.formatTimeSinceSync(NOW - 60_000L, NOW))
    }

    @Test
    fun `minutes under an hour count minutes`() {
        assertEquals("25 min ago", helper.formatTimeSinceSync(NOW - 1_500_000L, NOW))
    }

    @Test
    fun `sixty minutes is 1 h ago`() {
        assertEquals("1 h ago", helper.formatTimeSinceSync(NOW - 3_600_000L, NOW))
    }

    @Test
    fun `hours under a day count hours`() {
        assertEquals("5 h ago", helper.formatTimeSinceSync(NOW - 18_000_000L, NOW))
    }

    @Test
    fun `twenty-four hours is 1 d ago`() {
        assertEquals("1 d ago", helper.formatTimeSinceSync(NOW - 86_400_000L, NOW))
    }

    @Test
    fun `days count days`() {
        assertEquals("3 d ago", helper.formatTimeSinceSync(NOW - 3 * 86_400_000L, NOW))
    }

    // --- Deduplication (via update()) ---

    @Test
    fun `an unchanged state within the same minute is not re-posted`() {
        val s = input(hasFix = true)
        assertTrue(helper.update(s))
        assertFalse(helper.update(s.copy(lastFixMs = FIX + 30_000L)))
    }

    @Test
    fun `a fix in the next minute re-posts`() {
        val s = input(hasFix = true)
        helper.update(s)
        assertTrue(helper.update(s.copy(lastFixMs = FIX + 60_000L)))
    }

    @Test
    fun `a queue count change re-posts at once`() {
        val s = input(hasFix = true)
        helper.update(s)
        assertTrue(helper.update(s.copy(queuedCount = 5)))
    }

    @Test
    fun `forceUpdate re-posts an identical state`() {
        val s = input(hasFix = true)
        helper.update(s)
        assertTrue(helper.update(s, forceUpdate = true))
    }

    @Test
    fun `the foreground notification primes the dedup key`() {
        val s = input(hasFix = true)
        helper.buildForegroundNotification(s)

        assertFalse(helper.update(s))
        assertTrue(helper.update(s.copy(queuedCount = 3)))
    }
}
