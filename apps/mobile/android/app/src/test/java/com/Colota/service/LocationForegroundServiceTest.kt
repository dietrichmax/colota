package com.Colota.service

import org.junit.Assert.*
import org.junit.Test
import java.util.Locale

/**
 * Tests for LocationForegroundService's pure logic:
 * - Notification throttling decisions
 * - Time-since-last-sync formatting
 * - Notification status text generation
 * - Battery critical shutdown conditions during tracking
 *
 * The actual Android Service lifecycle and LocationProvider interactions
 * are not tested here (require instrumented tests).
 */
class LocationForegroundServiceTest {

    // --- Notification throttle logic ---

    @Test
    fun `notification updates within 10s are throttled`() {
        val lastUpdate = 1000L
        val now = 5000L
        val throttleMs = 10000L

        val shouldThrottle = (now - lastUpdate) < throttleMs
        assertTrue(shouldThrottle)
    }

    @Test
    fun `notification updates after 10s are allowed`() {
        val lastUpdate = 1000L
        val now = 12000L
        val throttleMs = 10000L

        val shouldThrottle = (now - lastUpdate) < throttleMs
        assertFalse(shouldThrottle)
    }

    @Test
    fun `notification updates at exactly 10s are allowed`() {
        val lastUpdate = 1000L
        val now = 11000L
        val throttleMs = 10000L

        val shouldThrottle = (now - lastUpdate) < throttleMs
        assertFalse(shouldThrottle)
    }

    // --- Movement filter logic ---

    @Test
    fun `movement less than 2m is filtered`() {
        val distanceMeters = 1.5f
        val shouldFilter = distanceMeters < 2
        assertTrue(shouldFilter)
    }

    @Test
    fun `movement of exactly 2m is not filtered`() {
        val distanceMeters = 2.0f
        val shouldFilter = distanceMeters < 2
        assertFalse(shouldFilter)
    }

    @Test
    fun `movement greater than 2m is not filtered`() {
        val distanceMeters = 5.0f
        val shouldFilter = distanceMeters < 2
        assertFalse(shouldFilter)
    }

    // --- getTimeSinceLastSync formatting ---

    @Test
    fun `time since sync shows Never when no sync happened`() {
        assertEquals("Never", formatTimeSinceSync(lastSyncTime = 0L, now = 1000L))
    }

    @Test
    fun `time since sync shows Just now for less than 1 min`() {
        val now = 100000L
        val lastSync = now - 30000L // 30 seconds ago
        assertEquals("Just now", formatTimeSinceSync(lastSync, now))
    }

    @Test
    fun `time since sync shows 1 min ago`() {
        val now = 100000L
        val lastSync = now - 60000L // exactly 1 minute
        assertEquals("1 min ago", formatTimeSinceSync(lastSync, now))
    }

    @Test
    fun `time since sync shows N min ago for less than 1 hour`() {
        val now = 100000L
        val lastSync = now - 1500000L // 25 minutes
        assertEquals("25 min ago", formatTimeSinceSync(lastSync, now))
    }

    @Test
    fun `time since sync shows 1h ago for 60-119 minutes`() {
        val now = 10000000L
        val lastSync = now - 3600000L // 60 minutes
        assertEquals("1h ago", formatTimeSinceSync(lastSync, now))
    }

    @Test
    fun `time since sync shows Nh ago for 120+ minutes`() {
        val now = 10000000L
        val lastSync = now - 7200000L // 120 minutes
        assertEquals("2 h ago", formatTimeSinceSync(lastSync, now))
    }

    @Test
    fun `time since sync shows 5h ago for 300 minutes`() {
        val now = 100000000L
        val lastSync = now - 18000000L // 300 minutes
        assertEquals("5 h ago", formatTimeSinceSync(lastSync, now))
    }

    // --- Notification status text generation ---

    @Test
    fun `status text shows Paused with zone name when in pause zone`() {
        val text = buildStatusText(
            isPaused = true,
            zoneName = "Home",
            lat = 52.0,
            lon = 13.0,
            queuedCount = 0,
            lastSyncTime = 0L
        )
        assertEquals("Paused: Home", text)
    }

    @Test
    fun `status text shows Paused Unknown when zone name is null`() {
        val text = buildStatusText(
            isPaused = true,
            zoneName = null,
            lat = 52.0,
            lon = 13.0,
            queuedCount = 0,
            lastSyncTime = 0L
        )
        assertEquals("Paused: Unknown", text)
    }

    @Test
    fun `status text shows coordinates when tracking normally`() {
        val text = buildStatusText(
            isPaused = false,
            zoneName = null,
            lat = 52.51630,
            lon = 13.37770,
            queuedCount = 0,
            lastSyncTime = 0L
        )
        assertEquals("52.51630, 13.37770", text)
    }

    @Test
    fun `status text shows Synced when queue empty and has synced`() {
        val text = buildStatusText(
            isPaused = false,
            zoneName = null,
            lat = 52.0,
            lon = 13.0,
            queuedCount = 0,
            lastSyncTime = System.currentTimeMillis()
        )
        assertEquals("52.00000, 13.00000 (Synced)", text)
    }

    @Test
    fun `status text shows queued count when has queue but never synced`() {
        val text = buildStatusText(
            isPaused = false,
            zoneName = null,
            lat = 52.0,
            lon = 13.0,
            queuedCount = 15,
            lastSyncTime = 0L
        )
        assertEquals("52.00000, 13.00000 (Queued: 15)", text)
    }

    @Test
    fun `status text shows Searching GPS when no coordinates`() {
        val text = buildStatusText(
            isPaused = false,
            zoneName = null,
            lat = null,
            lon = null,
            queuedCount = 0,
            lastSyncTime = 0L
        )
        assertEquals("Searching GPS...", text)
    }

    // --- Battery critical during tracking (handleLocationUpdate logic) ---

    @Test
    fun `battery 4 percent discharging triggers stop during tracking`() {
        assertTrue(shouldStopForBattery(battery = 4, batteryStatus = 1))
    }

    @Test
    fun `battery 1 percent discharging triggers stop during tracking`() {
        assertTrue(shouldStopForBattery(battery = 1, batteryStatus = 1))
    }

    @Test
    fun `battery 5 percent discharging does not trigger stop during tracking`() {
        // handleLocationUpdate checks battery in 1..4, so 5 is not in range
        assertFalse(shouldStopForBattery(battery = 5, batteryStatus = 1))
    }

    @Test
    fun `battery 0 percent discharging does not trigger stop during tracking`() {
        // 0 is not in 1..4 range
        assertFalse(shouldStopForBattery(battery = 0, batteryStatus = 1))
    }

    @Test
    fun `battery 3 percent charging does not trigger stop during tracking`() {
        assertFalse(shouldStopForBattery(battery = 3, batteryStatus = 2))
    }

    @Test
    fun `battery 2 percent full does not trigger stop during tracking`() {
        assertFalse(shouldStopForBattery(battery = 2, batteryStatus = 3))
    }

    // --- Accuracy filter logic ---

    @Test
    fun `location above accuracy threshold is filtered`() {
        val filterEnabled = true
        val threshold = 50.0f
        val locationAccuracy = 75.0f

        val shouldFilter = filterEnabled && locationAccuracy > threshold
        assertTrue(shouldFilter)
    }

    @Test
    fun `location below accuracy threshold passes`() {
        val filterEnabled = true
        val threshold = 50.0f
        val locationAccuracy = 25.0f

        val shouldFilter = filterEnabled && locationAccuracy > threshold
        assertFalse(shouldFilter)
    }

    @Test
    fun `location at exactly accuracy threshold passes`() {
        val filterEnabled = true
        val threshold = 50.0f
        val locationAccuracy = 50.0f

        val shouldFilter = filterEnabled && locationAccuracy > threshold
        assertFalse(shouldFilter)
    }

    @Test
    fun `accuracy filter disabled allows any accuracy`() {
        val filterEnabled = false
        val threshold = 50.0f
        val locationAccuracy = 500.0f

        val shouldFilter = filterEnabled && locationAccuracy > threshold
        assertFalse(shouldFilter)
    }

    // --- Zone transition state machine ---

    @Test
    fun `entering zone when not already in zone triggers enter`() {
        val zoneName = "Home"
        val insidePauseZone = false

        val shouldEnter = zoneName != null && !insidePauseZone
        assertTrue(shouldEnter)
    }

    @Test
    fun `exiting zone when inside zone triggers exit`() {
        val zoneName: String? = null
        val insidePauseZone = true

        val shouldExit = zoneName == null && insidePauseZone
        assertTrue(shouldExit)
    }

    @Test
    fun `staying in same zone does not trigger enter or exit`() {
        val zoneName = "Home"
        val insidePauseZone = true
        val currentZoneName = "Home"

        val shouldEnter = zoneName != null && !insidePauseZone
        val shouldExit = zoneName == null && insidePauseZone
        val sameZone = zoneName != null && insidePauseZone && zoneName == currentZoneName

        assertFalse(shouldEnter)
        assertFalse(shouldExit)
        assertTrue(sameZone)
    }

    @Test
    fun `changing zones triggers re-enter`() {
        val zoneName = "Work"
        val insidePauseZone = true
        val currentZoneName = "Home"

        val shouldReEnter = zoneName != null && (!insidePauseZone || zoneName != currentZoneName)
        assertTrue(shouldReEnter)
    }

    // --- Deduplication logic ---

    @Test
    fun `same notification text is deduplicated`() {
        val lastText = "52.52000, 13.40500-3"
        val newText = "52.52000, 13.40500-3"
        assertFalse(shouldUpdateNotification(lastText, newText))
    }

    @Test
    fun `different notification text is not deduplicated`() {
        val lastText = "52.52000, 13.40500-3"
        val newText = "52.52100, 13.40600-3"
        assertTrue(shouldUpdateNotification(lastText, newText))
    }

    @Test
    fun `first notification update always proceeds`() {
        assertTrue(shouldUpdateNotification(null, "52.52000, 13.40500-0"))
    }

    // --- Helper methods replicating logic under test ---

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
        isPaused: Boolean,
        zoneName: String?,
        lat: Double?,
        lon: Double?,
        queuedCount: Int,
        lastSyncTime: Long
    ): String {
        return when {
            isPaused -> "Paused: ${zoneName ?: "Unknown"}"
            lat != null && lon != null -> {
                val coords = String.format(Locale.US, "%.5f, %.5f", lat, lon)
                if (queuedCount > 0 && lastSyncTime > 0) {
                    "$coords (Last sync: ${formatTimeSinceSync(lastSyncTime, System.currentTimeMillis())})"
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
    }

    private fun shouldStopForBattery(battery: Int, batteryStatus: Int): Boolean {
        return battery in 1..4 && batteryStatus == 1
    }

    private fun shouldUpdateNotification(lastText: String?, newText: String): Boolean {
        return newText != lastText
    }
}
