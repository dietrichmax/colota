package com.Colota.service

import io.mockk.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Tests for NotificationHelper using a real instance with mocked Android deps:
 * - Status text generation (all branches)
 * - Time-since-last-sync formatting
 * - Throttle decisions
 * - Movement filter decisions
 * - Title building
 * - Deduplication via update()
 */
class NotificationHelperTest {

    private lateinit var helper: NotificationHelper

    @Before
    fun setUp() {
        helper = spyk(
            NotificationHelper(mockk(relaxed = true), mockk(relaxed = true))
        )
        // Stub buildTrackingNotification to avoid PendingIntent.getActivity()
        every { helper.buildTrackingNotification(any(), any()) } returns mockk()
    }

    // --- formatTimeSinceSync ---

    @Test
    fun `time since sync shows Never when no sync happened`() {
        assertEquals("Never", helper.formatTimeSinceSync(lastSyncTime = 0L, now = 1000L))
    }

    @Test
    fun `time since sync shows Just now for less than 1 min`() {
        val now = 100000L
        assertEquals("Just now", helper.formatTimeSinceSync(now - 30000L, now))
    }

    @Test
    fun `time since sync shows 1 min ago`() {
        val now = 100000L
        assertEquals("1 min ago", helper.formatTimeSinceSync(now - 60000L, now))
    }

    @Test
    fun `time since sync shows N min ago for less than 1 hour`() {
        val now = 100000L
        assertEquals("25 min ago", helper.formatTimeSinceSync(now - 1500000L, now))
    }

    @Test
    fun `time since sync shows 1h ago for 60-119 minutes`() {
        val now = 10000000L
        assertEquals("1h ago", helper.formatTimeSinceSync(now - 3600000L, now))
    }

    @Test
    fun `time since sync shows Nh ago for 120+ minutes`() {
        val now = 10000000L
        assertEquals("2 h ago", helper.formatTimeSinceSync(now - 7200000L, now))
    }

    @Test
    fun `time since sync shows 5h ago for 300 minutes`() {
        val now = 100000000L
        assertEquals("5 h ago", helper.formatTimeSinceSync(now - 18000000L, now))
    }

    // --- buildStatusText ---

    @Test
    fun `status text shows Paused with zone name`() {
        assertEquals("Paused: Home", helper.buildStatusText(true, "Home", 52.0, 13.0, 0, 0L))
    }

    @Test
    fun `status text shows Paused Unknown when zone name is null`() {
        assertEquals("Paused: Unknown", helper.buildStatusText(true, null, 52.0, 13.0, 0, 0L))
    }

    @Test
    fun `status text shows coordinates when tracking normally`() {
        assertEquals("52.51630, 13.37770", helper.buildStatusText(false, null, 52.51630, 13.37770, 0, 0L))
    }

    @Test
    fun `status text shows Synced when queue empty and has synced`() {
        val text = helper.buildStatusText(false, null, 52.0, 13.0, 0, System.currentTimeMillis())
        assertEquals("52.00000, 13.00000 (Synced)", text)
    }

    @Test
    fun `status text shows queued count when never synced`() {
        assertEquals("52.00000, 13.00000 (Queued: 15)", helper.buildStatusText(false, null, 52.0, 13.0, 15, 0L))
    }

    @Test
    fun `status text shows queued count and last sync when both present`() {
        val now = System.currentTimeMillis()
        assertEquals(
            "52.00000, 13.00000 (Queued: 7 \u00b7 Just now)",
            helper.buildStatusText(false, null, 52.0, 13.0, 7, now - 30000L)
        )
    }

    @Test
    fun `status text shows Searching GPS when no coordinates`() {
        assertEquals("Searching GPS...", helper.buildStatusText(false, null, null, null, 0, 0L))
    }

    @Test
    fun `status text uses locale-safe coordinate formatting`() {
        val text = helper.buildStatusText(false, null, -33.86882, 151.20930, 0, 0L)
        assertTrue(text.contains("-33.86882"))
        assertTrue(text.contains("151.20930"))
        assertFalse(text.contains(",209"))  // Would appear with German locale
    }

    @Test
    fun `paused takes priority over coordinates`() {
        assertEquals(
            "Paused: Office",
            helper.buildStatusText(true, "Office", 52.0, 13.0, 5, System.currentTimeMillis())
        )
    }

    // --- shouldThrottle ---

    @Test
    fun `throttle suppresses within 10s`() {
        setField("lastUpdateTime", 1000L)
        assertTrue(helper.shouldThrottle(now = 5000L))
    }

    @Test
    fun `throttle allows after 10s`() {
        setField("lastUpdateTime", 1000L)
        assertFalse(helper.shouldThrottle(now = 12000L))
    }

    @Test
    fun `throttle allows at exactly 10s`() {
        setField("lastUpdateTime", 1000L)
        assertFalse(helper.shouldThrottle(now = 11000L))
    }

    // --- shouldFilterByMovement ---

    @Test
    fun `movement less than 2m is filtered`() {
        assertTrue(helper.shouldFilterByMovement(1.5f))
    }

    @Test
    fun `movement of exactly 2m is not filtered`() {
        assertFalse(helper.shouldFilterByMovement(2.0f))
    }

    @Test
    fun `movement greater than 2m is not filtered`() {
        assertFalse(helper.shouldFilterByMovement(5.0f))
    }

    // --- buildTitle ---

    @Test
    fun `title shows Colota Tracking when no profile active`() {
        assertEquals("Colota Tracking", helper.buildTitle(null))
    }

    @Test
    fun `title includes profile name when active`() {
        assertEquals("Colota \u00b7 Charging", helper.buildTitle("Charging"))
    }

    @Test
    fun `title includes custom profile name`() {
        assertEquals("Colota \u00b7 Fast Driving", helper.buildTitle("Fast Driving"))
    }

    // --- Deduplication (via update()) ---

    @Test
    fun `same state is deduplicated on second update`() {
        assertTrue(helper.update(lat = 52.52, lon = 13.405, forceUpdate = true))
        assertFalse(helper.update(lat = 52.52, lon = 13.405, forceUpdate = true))
    }

    @Test
    fun `different coordinates trigger update`() {
        helper.update(lat = 52.52, lon = 13.405, forceUpdate = true)
        assertTrue(helper.update(lat = 52.521, lon = 13.406, forceUpdate = true))
    }

    @Test
    fun `first update always proceeds`() {
        assertTrue(helper.update(lat = 52.52, lon = 13.405, forceUpdate = true))
    }

    @Test
    fun `queue count change triggers update`() {
        val now = System.currentTimeMillis()
        helper.update(lat = 52.0, lon = 13.0, queuedCount = 0, lastSyncTime = now, forceUpdate = true)
        assertTrue(helper.update(lat = 52.0, lon = 13.0, queuedCount = 5, lastSyncTime = now, forceUpdate = true))
    }

    @Test
    fun `profile name change triggers update`() {
        helper.update(lat = 52.0, lon = 13.0, forceUpdate = true)
        assertTrue(helper.update(lat = 52.0, lon = 13.0, activeProfileName = "Charging", forceUpdate = true))
    }

    // --- Reflection helper ---

    private fun setField(name: String, value: Any?) {
        val field = NotificationHelper::class.java.getDeclaredField(name)
        field.isAccessible = true
        field.set(helper, value)
    }
}
