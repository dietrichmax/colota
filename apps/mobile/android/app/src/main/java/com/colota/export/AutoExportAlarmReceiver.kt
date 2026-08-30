/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.export

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.Colota.util.AppLogger

class AutoExportAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        AppLogger.i(TAG, "Alarm fired")
        // The alarm is one-shot: re-arm before anything that can fail, or the schedule ends here
        AutoExportScheduler.scheduleNext(context)
        try {
            AutoExportScheduler.enqueueScheduled(context)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to enqueue export worker", e)
        }
    }

    companion object {
        private const val TAG = "AutoExportAlarm"
    }
}
