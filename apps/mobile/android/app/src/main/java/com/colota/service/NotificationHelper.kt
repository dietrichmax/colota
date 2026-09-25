/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.annotation.StringRes
import androidx.core.app.NotificationCompat
import com.Colota.util.AppLanguage
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

    /** Logged and sent over the bridge by name; only the notification shows the text. */
    enum class StopReason(@StringRes val text: Int) {
        BATTERY(R.string.stop_reason_battery),
        LOCATION_OFF(R.string.stop_reason_location_off),
        PERMISSION(R.string.stop_reason_permission),
        PROVIDER(R.string.stop_reason_provider),
        KILLED(R.string.stop_reason_killed),
        SHORTCUT(R.string.stop_reason_shortcut),
        AUTOMATION(R.string.stop_reason_automation),
        OTHER(R.string.stop_reason_other)
    }

    private var lastKey: String? = null

    private val strings: Context get() = AppLanguage.context(context)

    /** From Android 12 the collapsed row shows the app name only when there is no title. */
    private val headerless = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

    companion object {
        const val CHANNEL_ID = "location_service_channel"
        const val STOPPED_CHANNEL_ID = "tracking_stopped_channel"
        const val NOTIFICATION_ID = 1
        const val STOPPED_NOTIFICATION_ID = 2
        /** ic_launcher_background. */
        const val ICON_COLOR = 0xFF0D9387.toInt()
    }

    fun createChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            strings.getString(R.string.channel_tracking),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = strings.getString(R.string.channel_tracking_description)
            setShowBadge(false)
        }
        notificationManager.createNotificationChannel(channel)

        val stoppedChannel = NotificationChannel(
            STOPPED_CHANNEL_ID,
            strings.getString(R.string.channel_stopped),
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = strings.getString(R.string.channel_stopped_description)
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
    fun buildStoppedNotification(reason: StopReason, unexpected: Boolean = false): Notification {
        // Opening the app is the recovery path when the watchdog cannot restart the service
        // itself, so this notification has to be tappable.
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        val title = strings.getString(R.string.stopped_title)
        val text = strings.getString(reason.text)
        return NotificationCompat.Builder(
            context,
            if (unexpected) STOPPED_CHANNEL_ID else CHANNEL_ID
        )
            .setContentTitle(collapsedTitle(title))
            .setContentText(collapsedText(title, text))
            .setStyle(NotificationCompat.BigTextStyle().setBigContentTitle(title).bigText(text))
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ICON_COLOR)
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
        val tracking = str(R.string.status_tracking)
        return when {
            !input.locationEnabled -> Status(str(R.string.status_location_off), "${str(R.string.status_not_recording)} · $send")
            input.isPaused -> Status(str(R.string.status_paused), "${pauseDetail(input)} · $send")
            !input.hasFix -> Status(str(R.string.status_searching), send)
            input.isStationary -> Status(tracking, "${str(R.string.status_stationary)} · $send")
            else -> Status(tracking, send)
        }
    }

    private fun str(@StringRes id: Int, vararg args: Any): String =
        if (args.isEmpty()) strings.getString(id) else strings.getString(id, *args)

    private fun count(id: Int, n: Int): String = strings.resources.getQuantityString(id, n, n)

    private fun pauseDetail(input: StatusInput): String = when {
        input.isWifiPaused -> str(R.string.status_pause_wifi)
        input.isMotionlessPaused -> str(R.string.status_pause_motionless)
        else -> str(R.string.status_pause_zone)
    }

    private fun sendSegment(input: StatusInput, now: Long): String = when {
        input.isOfflineMode -> str(R.string.status_offline)
        input.queuedCount > 0 && input.lastSyncTime > 0 ->
            "${count(R.plurals.status_queued, input.queuedCount)} · " +
                str(R.string.status_last_sync, formatTimeSinceSync(input.lastSyncTime, now))
        input.queuedCount > 0 -> count(R.plurals.status_queued, input.queuedCount)
        else -> str(R.string.status_all_sent)
    }

    fun formatTimeSinceSync(lastSyncTime: Long, now: Long): String {
        val minutes = ((now - lastSyncTime) / 60_000).toInt()
        return when {
            minutes < 1 -> str(R.string.sync_just_now)
            minutes < 60 -> count(R.plurals.sync_minutes_ago, minutes)
            minutes < 1440 -> count(R.plurals.sync_hours_ago, minutes / 60)
            else -> count(R.plurals.sync_days_ago, minutes / 1440)
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
