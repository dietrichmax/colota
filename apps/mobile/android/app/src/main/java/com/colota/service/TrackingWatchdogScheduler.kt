/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.content.Context
import com.Colota.util.AlarmScheduler

/**
 * Restarts tracking the system killed while the app was closed. Distinct from the in-service
 * pause watchdog, which lives on the GPS stream and dies with the service it would have to watch.
 *
 * Armed for as long as the user wants tracking, and re-armed by each tick.
 */
object TrackingWatchdogScheduler {

    /** Above the ~9min Doze floor for allow-while-idle, and matches the default heartbeat. */
    const val INTERVAL_MS = 15 * 60_000L

    /** Nothing wakes the app when Location comes back on; Doze still batches this to ~9 min. */
    const val LOCATION_OFF_RETRY_MS = 5 * 60_000L

    private val alarm = AlarmScheduler(
        tag = "TrackingWatchdog",
        requestCode = 9303,
        receiver = TrackingWatchdogReceiver::class.java
    )

    fun schedule(context: Context) = alarm.schedule(context, INTERVAL_MS)

    fun scheduleLocationOffRetry(context: Context) = alarm.schedule(context, LOCATION_OFF_RETRY_MS)

    fun cancel(context: Context) = alarm.cancel(context)
}
