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
 * Receives the stationary-heartbeat alarm and forwards it to [LocationForegroundService] as
 * ACTION_STATIONARY_HEARTBEAT. The alarm targets this receiver (not the service directly) so the
 * PendingIntent stays a plain explicit broadcast, and the foreground-service start runs inside the
 * alarm's temporary allowlist window.
 */
class StationaryHeartbeatReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val serviceIntent = Intent(context, LocationForegroundService::class.java).apply {
            action = LocationForegroundService.ACTION_STATIONARY_HEARTBEAT
        }
        try {
            context.startForegroundService(serviceIntent)
        } catch (e: Exception) {
            // The heartbeat only fires while the service is already foreground, so this shouldn't
            // throw; log rather than crash the receiver if the service is mid-teardown.
            AppLogger.e(TAG, "Failed to deliver stationary heartbeat", e)
        }
    }

    companion object {
        private const val TAG = "StationaryHeartbeat"
    }
}
