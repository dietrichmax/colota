/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.triggers

import android.content.Context
import android.content.Intent
import com.Colota.data.DatabaseHelper
import com.Colota.service.LocationForegroundService

/**
 * Shared start/stop tracking actions for external triggers (app shortcut,
 * automation broadcast). Callers pass the source label; per-caller extras
 * (logging, toasts) stay in the caller.
 */
object TrackingControl {
    fun start(context: Context, startedReason: String) {
        LocationForegroundService.startTracking(context, DatabaseHelper.getInstance(context), startedReason)
    }

    // Route stop through the service so stopForegroundServiceWithReason runs - direct
    // stopService skips the pause-zone flag clearing and the stopped notification.
    fun stop(context: Context, stopReason: String) {
        val stopIntent = Intent(context, LocationForegroundService::class.java).apply {
            action = LocationForegroundService.ACTION_STOP_REQUEST
            putExtra(LocationForegroundService.EXTRA_STOP_REASON, stopReason)
        }
        context.startService(stopIntent)
    }
}
