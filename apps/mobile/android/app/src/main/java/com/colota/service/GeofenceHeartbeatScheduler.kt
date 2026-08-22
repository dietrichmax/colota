/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.content.Context
import com.Colota.util.AlarmScheduler

/**
 * Wakes [LocationForegroundService] for the geofence-zone heartbeat. Delivered via
 * [GeofenceHeartbeatReceiver] so the PendingIntent stays a plain explicit broadcast and the
 * foreground-service start runs inside the alarm's temporary allowlist window.
 */
object GeofenceHeartbeatScheduler {

    private val alarm = AlarmScheduler(
        tag = "GeofenceHeartbeat",
        requestCode = 9302,
        receiver = GeofenceHeartbeatReceiver::class.java
    )

    fun schedule(context: Context, delayMs: Long) = alarm.schedule(context, delayMs)

    fun cancel(context: Context) = alarm.cancel(context)
}
