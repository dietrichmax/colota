/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.Colota.MainActivity
import java.util.Locale

/**
 * Handles all notification-related logic for the location tracking service:
 * channel creation, notification building, status text generation,
 * throttling, movement filtering, and deduplication.
 */
class NotificationHelper(
    private val context: Context,
    private val notificationManager: NotificationManager
) {

    private var lastText: String? = null
    private var lastUpdateTime: Long = 0
    private var lastCoords: Pair<Double, Double>? = null
    private var lastQueuedCount: Int = 0

    companion object {
        const val CHANNEL_ID = "location_service_channel"
        const val NOTIFICATION_ID = 1
        const val THROTTLE_MS = 10000L
        const val MIN_MOVEMENT_METERS = 2f
    }

    fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Location Tracking",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows active tracking status and sync queue"
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    fun buildTrackingNotification(title: String, statusText: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    /** Returns the notification title, including the active profile name if one is set. */
    fun buildTitle(activeProfileName: String?): String =
        if (activeProfileName != null) "Colota \u00b7 $activeProfileName" else "Colota Tracking"

    fun buildStoppedNotification(reason: String): Notification {
        return NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle("Colota: Stopped")
            .setContentText(reason)
            .setSmallIcon(android.R.drawable.ic_lock_power_off)
            .setOngoing(false)
            .setAutoCancel(true)
            .build()
    }

    /**
     * Returns the best status text for the initial startForeground notification.
     */
    fun getInitialStatus(
        insidePauseZone: Boolean,
        currentZoneName: String?,
        lastKnownLocation: android.location.Location?
    ): String = when {
        insidePauseZone -> "Paused: ${currentZoneName ?: "Unknown"}"
        lastKnownLocation != null -> String.format(
            Locale.US, "%.5f, %.5f",
            lastKnownLocation.latitude, lastKnownLocation.longitude
        )
        else -> "Searching GPS..."
    }

    /**
     * Builds the notification status text from current tracking state.
     */
    fun buildStatusText(
        isPaused: Boolean,
        zoneName: String?,
        lat: Double?,
        lon: Double?,
        queuedCount: Int,
        lastSyncTime: Long
    ): String = when {
        isPaused -> "Paused: ${zoneName ?: "Unknown"}"
        lat != null && lon != null -> {
            val coords = String.format(Locale.US, "%.5f, %.5f", lat, lon)
            if (queuedCount > 0 && lastSyncTime > 0) {
                "$coords (Queued: $queuedCount · ${formatTimeSinceSync(lastSyncTime)})"
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

    /**
     * Formats elapsed time since last successful sync.
     */
    fun formatTimeSinceSync(lastSyncTime: Long, now: Long = System.currentTimeMillis()): String {
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

    /** Returns true if the update should be suppressed (too soon since last update). */
    fun shouldThrottle(now: Long): Boolean = (now - lastUpdateTime) < THROTTLE_MS

    /** Returns true if movement is below the minimum threshold. */
    fun shouldFilterByMovement(distanceMeters: Float): Boolean = distanceMeters < MIN_MOVEMENT_METERS

    /**
     * Full notification update with throttle, movement filter, and dedup.
     * Returns true if the notification was actually posted.
     */
    fun update(
        lat: Double? = null,
        lon: Double? = null,
        isPaused: Boolean = false,
        zoneName: String? = null,
        queuedCount: Int = 0,
        lastSyncTime: Long = 0L,
        activeProfileName: String? = null,
        forceUpdate: Boolean = false
    ): Boolean {
        val now = System.currentTimeMillis()

        val queueCountChanged = queuedCount != lastQueuedCount

        // Throttle + movement filter (zone changes always pass forceUpdate=true)
        // Bypass movement filter when queue count changed so status text stays current
        if (!forceUpdate && !queueCountChanged && lat != null && lon != null) {
            if (shouldThrottle(now)) return false

            val prev = lastCoords
            if (prev != null) {
                val distance = FloatArray(1)
                android.location.Location.distanceBetween(
                    prev.first, prev.second, lat, lon, distance
                )
                if (shouldFilterByMovement(distance[0])) return false
            }
        }

        lastUpdateTime = now
        if (lat != null && lon != null) {
            lastCoords = Pair(lat, lon)
        }

        val statusText = buildStatusText(isPaused, zoneName, lat, lon, queuedCount, lastSyncTime)

        // Dedup: skip if notification text hasn't changed
        val cacheKey = "$statusText-$queuedCount-$activeProfileName"
        if (cacheKey == lastText) return false

        lastText = cacheKey
        lastQueuedCount = queuedCount
        val title = buildTitle(activeProfileName)
        notificationManager.notify(NOTIFICATION_ID, buildTrackingNotification(title, statusText))
        return true
    }
}
