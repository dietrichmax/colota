/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorManager
import android.hardware.TriggerEvent
import android.hardware.TriggerEventListener
import com.Colota.util.AppLogger

/**
 * Detects device motion using the hardware significant motion sensor.
 *
 * The significant motion sensor is a one-shot trigger: it fires once when
 * the device starts moving and then unregisters itself. After the callback
 * fires, [rearm] must be called to listen for the next motion event.
 *
 * This is extremely battery-efficient because the detection runs entirely
 * in hardware (the sensor hub), consuming near-zero power while idle.
 *
 * @param onMotionDetected Called on a sensor handler thread when motion is detected.
 */
class MotionDetector(
    context: Context,
    private val onMotionDetected: () -> Unit
) {
    companion object {
        private const val TAG = "MotionDetector"
    }

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val motionSensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_SIGNIFICANT_MOTION)

    @Volatile private var armed = false

    private val triggerListener = object : TriggerEventListener() {
        override fun onTrigger(event: TriggerEvent?) {
            armed = false
            AppLogger.d(TAG, "Significant motion detected")
            onMotionDetected()
        }
    }

    /** Whether the device has a significant motion sensor. */
    val isAvailable: Boolean get() = motionSensor != null

    /**
     * Arms the sensor to fire on the next significant motion event.
     * Safe to call multiple times - will not double-register.
     */
    fun arm() {
        if (armed || motionSensor == null) return
        val success = sensorManager.requestTriggerSensor(triggerListener, motionSensor)
        armed = success
        AppLogger.d(TAG, "Sensor armed: $success")
    }

    /**
     * Disarms the sensor. Call when tracking stops or the feature is disabled.
     */
    fun disarm() {
        if (!armed || motionSensor == null) return
        sensorManager.cancelTriggerSensor(triggerListener, motionSensor)
        armed = false
        AppLogger.d(TAG, "Sensor disarmed")
    }
}
