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
import com.Colota.R

/**
 * Main-thread only. All callers run on Main (onStartCommand, FLP callback,
 * or `withContext(Dispatchers.Main)` inside serviceScope), so state fields
 * do not need @Volatile.
 */
class NotificationHelper(
    private val context: Context,
    private val notificationManager: NotificationManager
) {

    /** No coordinate, zone or profile field on purpose: the notification is public. */
    data class StatusInput(
        val locationEnabled: Boolean = true,
        val isPaused: Boolean = false,
        val isWifiPaused: Boolean = false,
        val isMotionlessPaused: Boolean = false,
        val isStationary: Boolean = false,
        val hasFix: Boolean = false,
        val lastFixMs: Long,
        val isOfflineMode: Boolean = false,
        val queuedCount: Int = 0,
        val lastSyncTime: Long = 0L
    )

    data class Status(val title: String, val text: String)

    private var lastKey: String? = null

    /** From Android 12 the collapsed row shows the app name only when there is no title. */
    private val headerless = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

    companion object {
        const val CHANNEL_ID = "location_service_channel"
        const val STOPPED_CHANNEL_ID = "tracking_stopped_channel"
        const val NOTIFICATION_ID = 1
        const val STOPPED_NOTIFICATION_ID = 2
        const val STOP_REASON_BATTERY = "Battery fell below 5% · resumes when charging"
        /** ic_launcher_background, copied because unit tests run without app resources. */
        const val ICON_COLOR = 0xFF0D9387.toInt()
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

        val stoppedChannel = NotificationChannel(
            STOPPED_CHANNEL_ID,
            "Tracking stopped",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Alerts when tracking stops without you asking it to"
            setShowBadge(true)
        }
        notificationManager.createNotificationChannel(stoppedChannel)
    }

    fun buildTrackingNotification(status: Status, whenMs: Long): Notification {
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(collapsedTitle(status.title))
            .setContentText(collapsedText(status.title, status.text))
            .setStyle(NotificationCompat.BigTextStyle().setBigContentTitle(status.title).bigText(status.text))
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ICON_COLOR)
            .setOngoing(true)
            .setSilent(true)
            .setWhen(whenMs)
            .setShowWhen(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    /**
     * @param unexpected a stop the user did not ask for, which alerts. Anything else stays on the
     * silent tracking channel, so a caller has to opt in rather than inherit the alert.
     */
    fun buildStoppedNotification(reason: String, unexpected: Boolean = false): Notification {
        // Opening the app is the recovery path when the watchdog cannot restart the service
        // itself, so this notification has to be tappable.
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(
            context,
            if (unexpected) STOPPED_CHANNEL_ID else CHANNEL_ID
        )
            .setContentTitle(collapsedTitle("Tracking stopped"))
            .setContentText(collapsedText("Tracking stopped", reason))
            .setStyle(NotificationCompat.BigTextStyle().setBigContentTitle("Tracking stopped").bigText(reason))
            .setSmallIcon(android.R.drawable.ic_lock_power_off)
            .setOngoing(false)
            .setAutoCancel(true)
            // Silences the watchdog's 15-minute re-post while this one still shows. Dismissing it
            // starts a fresh post, which alerts again: tracking is still down and a tap is the fix.
            .setOnlyAlertOnce(true)
            .setContentIntent(pendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()
    }

    private fun collapsedTitle(state: String): String? = if (headerless) null else state

    private fun collapsedText(state: String, text: String): String = if (headerless) "$state · $text" else text

    /** Title is the recording state, text the sending state. */
    fun buildStatus(input: StatusInput, now: Long = System.currentTimeMillis()): Status {
        val send = sendSegment(input, now)
        return when {
            !input.locationEnabled -> Status("Location services are off", "Not recording · $send")
            input.isPaused -> Status("Paused", "${pauseDetail(input)} · $send")
            !input.hasFix -> Status("Searching for GPS", send)
            input.isStationary -> Status("Tracking", "Stationary · $send")
            else -> Status("Tracking", send)
        }
    }

    private fun pauseDetail(input: StatusInput): String = when {
        input.isWifiPaused -> "Zone WiFi · resumes when you leave"
        input.isMotionlessPaused -> "No movement · resumes when you move"
        else -> "Inside zone · resumes when you leave"
    }

    private fun sendSegment(input: StatusInput, now: Long): String = when {
        input.isOfflineMode -> "Offline mode"
        input.queuedCount > 0 && input.lastSyncTime > 0 ->
            "${input.queuedCount} queued · last sync ${formatTimeSinceSync(input.lastSyncTime, now)}"
        input.queuedCount > 0 -> "${input.queuedCount} queued"
        else -> "All sent"
    }

    fun formatTimeSinceSync(lastSyncTime: Long, now: Long): String {
        val minutes = ((now - lastSyncTime) / 60_000).toInt()
        return when {
            minutes < 1 -> "just now"
            minutes == 1 -> "1 min ago"
            minutes < 60 -> "$minutes min ago"
            minutes < 120 -> "1 h ago"
            minutes < 1440 -> "${minutes / 60} h ago"
            minutes < 2880 -> "1 d ago"
            else -> "${minutes / 1440} d ago"
        }
    }

    // The fix minute is part of the key so the header age is at most a minute behind.
    private fun dedupKey(status: Status, input: StatusInput): String =
        "${status.title}\n${status.text}\n${input.lastFixMs / 60_000}"

    /** Also primes the dedup key, so the first update() does not re-post the same state. */
    fun buildForegroundNotification(input: StatusInput): Notification {
        val status = buildStatus(input)
        lastKey = dedupKey(status, input)
        return buildTrackingNotification(status, input.lastFixMs)
    }

    /** Returns true if it posted. forceUpdate skips the dedup check. */
    fun update(input: StatusInput, forceUpdate: Boolean = false): Boolean {
        val status = buildStatus(input)
        val key = dedupKey(status, input)
        if (!forceUpdate && key == lastKey) return false
        lastKey = key
        notificationManager.notify(NOTIFICATION_ID, buildTrackingNotification(status, input.lastFixMs))
        return true
    }
}
