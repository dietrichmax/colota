/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.export

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.Colota.util.AppLogger

class AutoExportAlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        AppLogger.i(TAG, "Alarm fired")
        try {
            WorkManager.getInstance(context.applicationContext)
                .enqueue(OneTimeWorkRequestBuilder<AutoExportWorker>().build())
        } catch (e: Exception) {
            // Next alarm or boot will re-arm; just log so the failure is diagnosable.
            AppLogger.e(TAG, "Failed to enqueue export worker", e)
        }
    }

    companion object {
        private const val TAG = "AutoExportAlarm"
    }
}
