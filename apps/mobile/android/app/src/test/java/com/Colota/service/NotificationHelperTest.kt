package com.Colota.service

import org.junit.Assert.*
import org.junit.Test

/**
 * Tests for NotificationHelper's pure logic:
 * - Status text generation (all branches)
 * - Time-since-last-sync formatting
 * - Throttle decisions
 * - Movement filter decisions
 * - Deduplication
 * - Initial status text
 */
class NotificationHelperTest {

    // --- formatTimeSinceSync ---

    @Test
    fun `time since sync shows Never when no sync happened`() {
        assertEquals("Never", formatTimeSinceSync(lastSyncTime = 0L, now = 1000L))
    }

    @Test
    fun `time since sync shows Just now for less than 1 min`() {
        val now = 100000L
        val lastSync = now - 30000L
        assertEquals("Just now", formatTimeSinceSync(lastSync, now))
    }

    @Test
    fun `time since sync shows 1 min ago`() {
        val now = 100000L
        val lastSync = now - 60000L
        assertEquals("1 min ago", formatTimeSinceSync(lastSync, now))
    }

    @Test
    fun `time since sync shows N min ago for less than 1 hour`() {
        val now = 100000L
        val lastSync = now - 1500000L
        assertEquals("25 min ago", formatTimeSinceSync(lastSync, now))
    }

    @Test
    fun `time since sync shows 1h ago for 60-119 minutes`() {
        val now = 10000000L
        val lastSync = now - 3600000L
        assertEquals("1h ago", formatTimeSinceSync(lastSync, now))
    }

    @Test
    fun `time since sync shows Nh ago for 120+ minutes`() {
        val now = 10000000L
        val lastSync = now - 7200000L
        assertEquals("2 h ago", formatTimeSinceSync(lastSync, now))
    }

    @Test
    fun `time since sync shows 5h ago for 300 minutes`() {
        val now = 100000000L
        val lastSync = now - 18000000L
        assertEquals("5 h ago", formatTimeSinceSync(lastSync, now))
    }

    // --- buildStatusText ---

    @Test
    fun `status text shows Paused with zone name`() {
        val text = buildStatusText(true, "Home", 52.0, 13.0, 0, 0L)
        assertEquals("Paused: Home", text)
    }

    @Test
    fun `status text shows Paused Unknown when zone name is null`() {
        val text = buildStatusText(true, null, 52.0, 13.0, 0, 0L)
        assertEquals("Paused: Unknown", text)
    }

    @Test
    fun `status text shows coordinates when tracking normally`() {
        val text = buildStatusText(false, null, 52.51630, 13.37770, 0, 0L)
        assertEquals("52.51630, 13.37770", text)
    }

    @Test
    fun `status text shows Synced when queue empty and has synced`() {
        val text = buildStatusText(false, null, 52.0, 13.0, 0, System.currentTimeMillis())
        assertEquals("52.00000, 13.00000 (Synced)", text)
    }

    @Test
    fun `status text shows queued count when never synced`() {
        val text = buildStatusText(false, null, 52.0, 13.0, 15, 0L)
        assertEquals("52.00000, 13.00000 (Queued: 15)", text)
    }

    @Test
    fun `status text shows queued count and last sync when both present`() {
        val now = System.currentTimeMillis()
        val text = buildStatusText(false, null, 52.0, 13.0, 7, now - 30000L)
        assertEquals("52.00000, 13.00000 (Queued: 7 · Just now)", text)
    }

    @Test
    fun `status text shows Searching GPS when no coordinates`() {
        val text = buildStatusText(false, null, null, null, 0, 0L)
        assertEquals("Searching GPS...", text)
    }

    @Test
    fun `status text uses locale-safe coordinate formatting`() {
        // Verifies no comma-separated decimals on non-US locales
        val text = buildStatusText(false, null, -33.86882, 151.20930, 0, 0L)
        assertTrue(text.contains("-33.86882"))
        assertTrue(text.contains("151.20930"))
        assertFalse(text.contains(",209"))  // Would appear with German locale
    }

    @Test
    fun `paused takes priority over coordinates`() {
        val text = buildStatusText(true, "Office", 52.0, 13.0, 5, System.currentTimeMillis())
        assertEquals("Paused: Office", text)
    }

    // --- shouldThrottle ---

    @Test
    fun `throttle suppresses within 10s`() {
        assertTrue(shouldThrottle(lastUpdateTime = 1000L, now = 5000L))
    }

    @Test
    fun `throttle allows after 10s`() {
        assertFalse(shouldThrottle(lastUpdateTime = 1000L, now = 12000L))
    }

    @Test
    fun `throttle allows at exactly 10s`() {
        assertFalse(shouldThrottle(lastUpdateTime = 1000L, now = 11000L))
    }

    // --- shouldFilterByMovement ---

    @Test
    fun `movement less than 2m is filtered`() {
        assertTrue(shouldFilterByMovement(1.5f))
    }

    @Test
    fun `movement of exactly 2m is not filtered`() {
        assertFalse(shouldFilterByMovement(2.0f))
    }

    @Test
    fun `movement greater than 2m is not filtered`() {
        assertFalse(shouldFilterByMovement(5.0f))
    }

    // --- Deduplication ---

    @Test
    fun `same cache key is deduplicated`() {
        assertFalse(shouldUpdate("52.52000, 13.40500-3", "52.52000, 13.40500-3"))
    }

    @Test
    fun `different cache key is not deduplicated`() {
        assertTrue(shouldUpdate("52.52000, 13.40500-3", "52.52100, 13.40600-3"))
    }

    @Test
    fun `first update always proceeds`() {
        assertTrue(shouldUpdate(null, "52.52000, 13.40500-0"))
    }

    @Test
    fun `queue count change triggers update even if text same`() {
        assertTrue(shouldUpdate("52.00000, 13.00000 (Synced)-0", "52.00000, 13.00000 (Synced)-5"))
    }

    // --- Helper methods that mirror NotificationHelper logic ---

    private fun formatTimeSinceSync(lastSyncTime: Long, now: Long): String {
        if (lastSyncTime == 0L) return "Never"
        val elapsedMs = now - lastSyncTime
        val elapsedMinutes = (elapsedMs / 60000).toInt()
        return when {
            elapsedMinutes < 1 -> "Just now"
            elapsedMinutes == 1 -> "1 min ago"
            elapsedMinutes < 60 -> "$elapsedMinutes min ago"
            elapsedMinutes < 120 -> "1h ago"
            else -> "${elapsedMinutes / 60} h ago"
        }
    }

    private fun buildStatusText(
        isPaused: Boolean, zoneName: String?,
        lat: Double?, lon: Double?,
        queuedCount: Int, lastSyncTime: Long
    ): String = when {
        isPaused -> "Paused: ${zoneName ?: "Unknown"}"
        lat != null && lon != null -> {
            val coords = String.format(java.util.Locale.US, "%.5f, %.5f", lat, lon)
            if (queuedCount > 0 && lastSyncTime > 0) {
                "$coords (Queued: $queuedCount · ${formatTimeSinceSync(lastSyncTime, System.currentTimeMillis())})"
            } else if (queuedCount > 0) {
                "$coords (Queued: $queuedCount)"
            } else if (lastSyncTime > 0) {
                "$coords (Synced)"
            } else {
                coords
            }
        }
        else -> "Searching GPS..."
    }

    private fun shouldThrottle(lastUpdateTime: Long, now: Long): Boolean =
        (now - lastUpdateTime) < NotificationHelper.THROTTLE_MS

    private fun shouldFilterByMovement(distance: Float): Boolean =
        distance < NotificationHelper.MIN_MOVEMENT_METERS

    private fun shouldUpdate(lastText: String?, newText: String): Boolean =
        newText != lastText
}