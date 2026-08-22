/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.content.Context
import com.Colota.util.AlarmScheduler

/**
 * Wakes [LocationForegroundService] for the stationary-profile heartbeat. Delivered via
 * [StationaryHeartbeatReceiver] so the PendingIntent stays a plain explicit broadcast and the
 * foreground-service start runs inside the alarm's temporary allowlist window.
 */
object StationaryHeartbeatScheduler {

    private val alarm = AlarmScheduler(
        tag = "StationaryHeartbeat",
        requestCode = 9301,
        receiver = StationaryHeartbeatReceiver::class.java
    )

    fun schedule(context: Context, intervalMs: Long) = alarm.schedule(context, intervalMs)

    fun cancel(context: Context) = alarm.cancel(context)
}
