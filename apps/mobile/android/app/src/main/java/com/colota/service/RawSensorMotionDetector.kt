/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.hardware.TriggerEvent
import android.hardware.TriggerEventListener
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.Colota.BuildConfig
import com.Colota.util.AppLogger
import kotlin.math.sqrt

/**
 * Accelerometer variance (30s batched FIFO) plus TYPE_SIGNIFICANT_MOTION.
 * Variance handles both STATIONARY and MOVING transitions with hysteresis and
 * catches sustained low-amplitude vibration (still phone in a moving vehicle)
 * that SIG_MOTION filters out. SIG_MOTION runs in parallel for instant wake on
 * sharp events.
 *
 * @param getStationaryDwellMs read on each sample; lets the service inject the
 *   per-zone motionlessTimeoutMinutes without restarting the detector.
 */
class RawSensorMotionDetector(
    context: Context,
    private val getStationaryDwellMs: () -> Long = { DEFAULT_STATIONARY_DWELL_MS }
) : MotionStateDetector {

    companion object {
        private const val TAG = "MotionDetector"

        private const val MOVING_VARIANCE_THRESHOLD = 0.30
        private const val STATIONARY_VARIANCE_THRESHOLD = 0.15
        private const val MOVING_DWELL_MS = 3_000L
        const val DEFAULT_STATIONARY_DWELL_MS = 60_000L
        /** Sliding window over which accelerometer-magnitude variance is computed. Independent of dwell. */
        private const val VARIANCE_WINDOW_MS = 60_000L
        private const val MAX_REPORT_LATENCY_US = 30_000_000
        private const val MIN_SAMPLES_FOR_VARIANCE = 8
    }

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val accelSensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val sigMotionSensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_SIGNIFICANT_MOTION)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val lifecycleLock = Any()

    @Volatile private var listener: ((MotionState) -> Unit)? = null
    @Volatile private var currentState: MotionState = MotionState.MOVING

    private val sampleWindow = ArrayDeque<Sample>()
    private var aboveThresholdSinceMs: Long = 0L
    private var belowThresholdSinceMs: Long = 0L

    private data class Sample(val timestampMs: Long, val magnitude: Double)

    override val isAvailable: Boolean get() = accelSensor != null

    private val accelListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent?) {
            val e = event ?: return
            val ax = e.values[0]
            val ay = e.values[1]
            val az = e.values[2]
            val magnitude = sqrt((ax * ax + ay * ay + az * az).toDouble()) - SensorManager.GRAVITY_EARTH
            processSample(SystemClock.elapsedRealtime(), magnitude)
        }
        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
    }

    private val sigMotionListener = object : TriggerEventListener() {
        override fun onTrigger(event: TriggerEvent?) {
            sigMotionSensor?.let { sensorManager.requestTriggerSensor(this, it) }
            transitionTo(MotionState.MOVING, "sig_motion")
        }
    }

    override fun start(listener: (MotionState) -> Unit) {
        synchronized(lifecycleLock) {
            if (this.listener != null) return
            this.listener = listener
            currentState = MotionState.MOVING
            sampleWindow.clear()
            aboveThresholdSinceMs = 0L
            belowThresholdSinceMs = 0L

            accelSensor?.let {
                sensorManager.registerListener(accelListener, it, SensorManager.SENSOR_DELAY_NORMAL, MAX_REPORT_LATENCY_US)
            }
            sigMotionSensor?.let {
                sensorManager.requestTriggerSensor(sigMotionListener, it)
            }
        }
        AppLogger.d(TAG, "Started (accel=${accelSensor != null}, sigMotion=${sigMotionSensor != null}, batchUs=$MAX_REPORT_LATENCY_US)")
    }

    override fun stop() {
        synchronized(lifecycleLock) {
            if (listener == null) return
            listener = null
            accelSensor?.let { sensorManager.unregisterListener(accelListener, it) }
            sigMotionSensor?.let { sensorManager.cancelTriggerSensor(sigMotionListener, it) }
            sampleWindow.clear()
            // Drop transition posts queued before stop arrived. The listener null-check in
            // the posted lambda is the backstop if cancellation misses one.
            mainHandler.removeCallbacksAndMessages(null)
        }
        AppLogger.d(TAG, "Stopped")
    }

    /** Test-build hook: directly inject a state transition (called from ADB-debug receiver). */
    fun forceState(newState: MotionState) {
        transitionTo(newState, "debug_force")
    }

    private fun processSample(nowMs: Long, magnitude: Double) {
        sampleWindow.addLast(Sample(nowMs, magnitude))
        while (sampleWindow.isNotEmpty() && nowMs - sampleWindow.first().timestampMs > VARIANCE_WINDOW_MS) {
            sampleWindow.removeFirst()
        }

        if (sampleWindow.size < MIN_SAMPLES_FOR_VARIANCE) return

        val variance = computeVariance(sampleWindow)
        val stationaryDwellMs = getStationaryDwellMs().coerceAtLeast(0L)

        if (BuildConfig.DEBUG) {
            AppLogger.d(TAG, "t=$nowMs v=${"%.4f".format(variance)} n=${sampleWindow.size} state=$currentState")
        }

        when {
            variance > MOVING_VARIANCE_THRESHOLD -> {
                belowThresholdSinceMs = 0L
                if (aboveThresholdSinceMs == 0L) aboveThresholdSinceMs = nowMs
                if (currentState != MotionState.MOVING && nowMs - aboveThresholdSinceMs >= MOVING_DWELL_MS) {
                    transitionTo(MotionState.MOVING, "variance=${"%.3f".format(variance)}")
                    aboveThresholdSinceMs = 0L
                }
            }
            variance < STATIONARY_VARIANCE_THRESHOLD -> {
                aboveThresholdSinceMs = 0L
                if (belowThresholdSinceMs == 0L) belowThresholdSinceMs = nowMs
                if (currentState != MotionState.STATIONARY && nowMs - belowThresholdSinceMs >= stationaryDwellMs) {
                    transitionTo(MotionState.STATIONARY, "variance=${"%.3f".format(variance)} dwell=${stationaryDwellMs / 1000}s")
                    belowThresholdSinceMs = 0L
                }
            }
            else -> {
                // Ambiguous band between thresholds: drop both timers so a transition needs a fresh sustained period.
                aboveThresholdSinceMs = 0L
                belowThresholdSinceMs = 0L
            }
        }
    }

    private fun computeVariance(samples: ArrayDeque<Sample>): Double {
        val n = samples.size
        var sum = 0.0
        for (s in samples) sum += s.magnitude
        val mean = sum / n
        var sumSquares = 0.0
        for (s in samples) {
            val d = s.magnitude - mean
            sumSquares += d * d
        }
        return sumSquares / n
    }

    private fun transitionTo(newState: MotionState, reason: String) {
        if (currentState == newState) return
        currentState = newState
        AppLogger.i(TAG, "State -> $newState ($reason)")
        // Re-read listener at delivery: a stop() between post and run nulls it, and this exits.
        mainHandler.post { listener?.invoke(newState) }
    }
}
