/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.util

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * One-shot wake-up alarm delivered to [receiver], re-armed by whoever handles it.
 *
 * setAndAllowWhileIdle fires through Doze without SCHEDULE_EXACT_ALARM, at the cost of being
 * inexact: the platform adds a delivery window of roughly 75% of the requested delay, so callers
 * must treat it as a minimum. Exact delivery would need a permission restricted to timer apps.
 */
internal class AlarmScheduler(
    private val tag: String,
    private val requestCode: Int,
    private val receiver: Class<out BroadcastReceiver>
) {

    fun schedule(context: Context, delayMs: Long) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        val delay = maxOf(delayMs, MIN_INTERVAL_MS)
        am.setAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            System.currentTimeMillis() + delay,
            pendingIntent(context)
        )
        AppLogger.d(tag, "Alarm armed: ${delay / 1000}s")
    }

    fun cancel(context: Context) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        am.cancel(pendingIntent(context))
        AppLogger.d(tag, "Alarm cancelled")
    }

    private fun pendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, receiver).apply {
            setPackage(context.packageName)
        }
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_IMMUTABLE
        )
    }

    private companion object {
        /** Cadence floor. The inexact delivery window stretches the real interval well past this. */
        const val MIN_INTERVAL_MS = 60_000L
    }
}
