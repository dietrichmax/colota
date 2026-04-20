/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.app.*
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.Colota.MainActivity
import java.util.Locale

/**
 * Main-thread only. All callers run on Main (onStartCommand, FLP callback,
 * or `withContext(Dispatchers.Main)` inside serviceScope), so state fields
 * do not need @Volatile.
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
        const val STOPPED_NOTIFICATION_ID = 2
        const val THROTTLE_MS = 10000L
        const val MIN_MOVEMENT_METERS = 2f
    }

    fun createChannel() {
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

    /** Status text for the initial startForeground notification, before any location arrives. */
    fun getInitialStatus(
        insidePauseZone: Boolean,
        currentZoneName: String?,
        lastKnownLocation: android.location.Location?
    ): String = when {
        insidePauseZone -> "Paused: ${currentZoneName ?: "Unknown"}"
        lastKnownLocation != null -> formatCoords(lastKnownLocation.latitude, lastKnownLocation.longitude)
        else -> "Searching GPS..."
    }

    private fun formatCoords(lat: Double, lon: Double): String =
        String.format(Locale.US, "%.5f, %.5f", lat, lon)

    fun buildStatusText(
        isPaused: Boolean,
        zoneName: String?,
        lat: Double?,
        lon: Double?,
        queuedCount: Int,
        lastSyncTime: Long,
        isOfflineMode: Boolean = false,
        isStationary: Boolean = false,
        isWifiPaused: Boolean = false,
        isMotionlessPaused: Boolean = false
    ): String = when {
        isPaused -> {
            val zone = zoneName ?: "Unknown"
            when {
                isWifiPaused -> "Paused: $zone \u00b7 WiFi"
                isMotionlessPaused -> "Paused: $zone \u00b7 Motionless"
                else -> "Paused: $zone"
            }
        }
        isStationary -> {
            val coords = if (lat != null && lon != null) formatCoords(lat, lon) else ""
            if (coords.isNotEmpty()) "Stationary - $coords" else "Stationary - GPS paused"
        }
        lat != null && lon != null -> {
            val coords = formatCoords(lat, lon)
            if (isOfflineMode) {
                coords
            } else if (queuedCount > 0 && lastSyncTime > 0) {
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

    fun shouldThrottle(now: Long): Boolean = (now - lastUpdateTime) < THROTTLE_MS

    fun shouldFilterByMovement(distanceMeters: Float): Boolean = distanceMeters < MIN_MOVEMENT_METERS

    /** Runs throttle + movement filter + dedup. Returns true if the notification was posted. */
    fun update(
        lat: Double? = null,
        lon: Double? = null,
        isPaused: Boolean = false,
        zoneName: String? = null,
        queuedCount: Int = 0,
        lastSyncTime: Long = 0L,
        activeProfileName: String? = null,
        forceUpdate: Boolean = false,
        isOfflineMode: Boolean = false,
        isStationary: Boolean = false,
        isWifiPaused: Boolean = false,
        isMotionlessPaused: Boolean = false
    ): Boolean {
        val now = System.currentTimeMillis()

        val queueCountChanged = queuedCount != lastQueuedCount

        // Bypass throttle/movement filter when queue count changed, so queue status stays current.
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

        val statusText = buildStatusText(isPaused, zoneName, lat, lon, queuedCount, lastSyncTime, isOfflineMode, isStationary, isWifiPaused, isMotionlessPaused)

        // forceUpdate bypasses dedup so state-change posts land even when the text is unchanged.
        val cacheKey = "$statusText-$queuedCount-$activeProfileName"
        if (!forceUpdate && cacheKey == lastText) return false

        lastText = cacheKey
        lastQueuedCount = queuedCount
        val title = buildTitle(activeProfileName)
        notificationManager.notify(NOTIFICATION_ID, buildTrackingNotification(title, statusText))
        return true
    }
}
