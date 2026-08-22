/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.Colota.util.AppLogger

/**
 * Receives the geofence-heartbeat alarm and forwards it to [LocationForegroundService] as
 * ACTION_GEOFENCE_HEARTBEAT. The alarm targets this receiver rather than the service so the
 * PendingIntent stays a plain explicit broadcast, and the foreground-service start runs inside
 * the alarm's temporary allowlist window.
 */
class GeofenceHeartbeatReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val serviceIntent = Intent(context, LocationForegroundService::class.java).apply {
            action = LocationForegroundService.ACTION_GEOFENCE_HEARTBEAT
        }
        try {
            context.startForegroundService(serviceIntent)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to deliver geofence heartbeat", e)
        }
    }

    companion object {
        private const val TAG = "GeofenceHeartbeat"
    }
}
