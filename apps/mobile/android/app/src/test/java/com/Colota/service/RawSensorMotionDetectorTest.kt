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
import com.Colota.util.AppLogger
import io.mockk.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class RawSensorMotionDetectorTest {

    private lateinit var context: Context
    private lateinit var sensorManager: SensorManager
    private lateinit var accelSensor: Sensor
    private lateinit var sigMotionSensor: Sensor
    private lateinit var accelListenerSlot: CapturingSlot<SensorEventListener>
    private lateinit var sigListenerSlot: CapturingSlot<TriggerEventListener>

    @Before
    fun setUp() {
        context = mockk()
        sensorManager = mockk(relaxed = true)
        accelSensor = mockk()
        sigMotionSensor = mockk()
        accelListenerSlot = slot()
        sigListenerSlot = slot()

        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs

        // Detector constructs a Handler(Looper.getMainLooper()) — stub both.
        mockkStatic(Looper::class)
        every { Looper.getMainLooper() } returns mockk(relaxed = true)
        mockkConstructor(Handler::class)
        every { anyConstructed<Handler>().post(any()) } answers {
            firstArg<Runnable>().run()
            true
        }

        // SystemClock.elapsedRealtime is read inside accelListener.onSensorChanged; tests
        // that drive synthetic sensor events stub it via stubElapsedRealtime() per sample.
        mockkStatic(SystemClock::class)
        every { SystemClock.elapsedRealtime() } returns 0L

        every { context.getSystemService(Context.SENSOR_SERVICE) } returns sensorManager
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
        unmockkStatic(Looper::class)
        unmockkStatic(SystemClock::class)
        unmockkConstructor(Handler::class)
    }

    private fun makeDetector(
        accelAvailable: Boolean = true,
        sigMotionAvailable: Boolean = true,
        stationaryDwellMs: Long = RawSensorMotionDetector.DEFAULT_STATIONARY_DWELL_MS
    ): RawSensorMotionDetector {
        every { sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) } returns
            if (accelAvailable) accelSensor else null
        every { sensorManager.getDefaultSensor(Sensor.TYPE_SIGNIFICANT_MOTION) } returns
            if (sigMotionAvailable) sigMotionSensor else null
        every { sensorManager.requestTriggerSensor(capture(sigListenerSlot), any()) } returns true
        every { sensorManager.registerListener(capture(accelListenerSlot), any<Sensor>(), any<Int>(), any<Int>()) } returns true
        return RawSensorMotionDetector(context) { stationaryDwellMs }
    }

    /**
     * Build a SensorEvent whose accelerometer-magnitude minus GRAVITY_EARTH equals [magnitude].
     * The detector reads only event.values[0..2]; setting ay/az = 0 lets us encode the target
     * magnitude directly into ax.
     *
     * SensorEvent.values is a public final Java field, not a Kotlin property, so mockk's
     * `every { event.values } returns ...` cannot intercept the field read. We allocate a
     * relaxed mock (skips constructor stub) and set the final field via reflection.
     */
    private fun sensorEvent(magnitude: Double): SensorEvent {
        val ax = (magnitude + SensorManager.GRAVITY_EARTH).toFloat()
        val event = mockk<SensorEvent>(relaxed = true)
        SensorEvent::class.java.getDeclaredField("values").apply {
            isAccessible = true
            set(event, floatArrayOf(ax, 0f, 0f))
        }
        return event
    }

    private fun feedSample(magnitude: Double, atMs: Long) {
        every { SystemClock.elapsedRealtime() } returns atMs
        accelListenerSlot.captured.onSensorChanged(sensorEvent(magnitude))
    }

    @Test
    fun `isAvailable true when accelerometer exists`() {
        val detector = makeDetector(accelAvailable = true)
        assertTrue(detector.isAvailable)
    }

    @Test
    fun `isAvailable false when accelerometer missing`() {
        val detector = makeDetector(accelAvailable = false)
        assertFalse(detector.isAvailable)
    }

    @Test
    fun `start registers accelerometer with batched FIFO and SIG_MOTION`() {
        val detector = makeDetector()
        detector.start { /* no-op */ }
        verify { sensorManager.registerListener(any(), accelSensor, SensorManager.SENSOR_DELAY_NORMAL, 30_000_000) }
        verify { sensorManager.requestTriggerSensor(any(), sigMotionSensor) }
    }

    @Test
    fun `start is idempotent - second call does not re-register`() {
        val detector = makeDetector()
        detector.start { }
        detector.start { }
        verify(exactly = 1) { sensorManager.registerListener(any(), accelSensor, any(), any<Int>()) }
        verify(exactly = 1) { sensorManager.requestTriggerSensor(any(), sigMotionSensor) }
    }

    @Test
    fun `stop unregisters both sensors`() {
        val detector = makeDetector()
        detector.start { }
        detector.stop()
        verify { sensorManager.unregisterListener(any(), accelSensor) }
        verify { sensorManager.cancelTriggerSensor(any(), sigMotionSensor) }
    }

    @Test
    fun `stop without start is a no-op`() {
        val detector = makeDetector()
        detector.stop()
        verify(exactly = 0) { sensorManager.unregisterListener(any(), any<Sensor>()) }
        verify(exactly = 0) { sensorManager.cancelTriggerSensor(any(), any()) }
    }

    @Test
    fun `start works when SIG_MOTION sensor is missing`() {
        val detector = makeDetector(sigMotionAvailable = false)
        detector.start { }
        verify { sensorManager.registerListener(any(), accelSensor, any(), any<Int>()) }
        verify(exactly = 0) { sensorManager.requestTriggerSensor(any(), any()) }
    }

    @Test
    fun `forceState invokes listener with new state`() {
        val detector = makeDetector()
        var received: MotionState? = null
        detector.start { received = it }
        // Initial state is MOVING; force STATIONARY to observe a transition.
        detector.forceState(MotionState.STATIONARY)
        assertEquals(MotionState.STATIONARY, received)
    }

    @Test
    fun `forceState does not invoke listener when state unchanged`() {
        val detector = makeDetector()
        var callCount = 0
        detector.start { callCount++ }
        // Initial state is MOVING; forcing MOVING should be a no-op.
        detector.forceState(MotionState.MOVING)
        assertEquals(0, callCount)
    }

    @Test
    fun `stop drops any pending transition posts so late deliveries no-op`() {
        // Capture posts instead of running them synchronously to simulate the async race:
        // transition queued -> stop() -> post drains later.
        val pending = mutableListOf<Runnable>()
        every { anyConstructed<Handler>().post(any()) } answers {
            pending += firstArg<Runnable>()
            true
        }

        val detector = makeDetector()
        var received: MotionState? = null
        detector.start { received = it }

        detector.forceState(MotionState.STATIONARY)
        assertEquals(1, pending.size)

        detector.stop()

        // Drain the post that was queued before stop() ran. The defensive null-check
        // in the posted lambda should make it a no-op now that listener is null.
        pending.forEach { it.run() }
        assertNull(received)
    }

    @Test
    fun `stop cancels pending callbacks on the main handler`() {
        val detector = makeDetector()
        detector.start { /* no-op */ }
        detector.stop()
        verify { anyConstructed<Handler>().removeCallbacksAndMessages(null) }
    }

    // ── Algorithm: variance + hysteresis ──────────────────────────────────
    //
    // Timing notes for these tests:
    // - variance is first computed when the deque holds >= MIN_SAMPLES_FOR_VARIANCE (8)
    // - the threshold timestamp (`above`/`belowThresholdSinceMs`) is set on that first
    //   variance-computed sample, so a dwell of D ms requires extending the loop past
    //   `firstComputedSampleMs + D`
    // - sliding variance window is 60s; tests that need to keep the deque populated
    //   sample at <= 1Hz to stay inside the window

    @Test
    fun `variance not computed below MIN_SAMPLES_FOR_VARIANCE`() {
        val received = mutableListOf<MotionState>()
        val detector = makeDetector()
        detector.start { received += it }

        // 7 samples < MIN_SAMPLES_FOR_VARIANCE (8). State stays at initial MOVING;
        // no STATIONARY transition because variance was never evaluated.
        var t = 0L
        repeat(7) {
            feedSample(magnitude = 0.0, atMs = t)
            t += 1000L
        }
        assertTrue(received.isEmpty())
    }

    @Test
    fun `low variance for full dwell transitions MOVING to STATIONARY`() {
        val received = mutableListOf<MotionState>()
        val detector = makeDetector()
        detector.start { received += it }

        // Constant magnitude -> variance = 0 < STATIONARY threshold (0.15).
        // 8th sample lands at t=7000 -> belowThresholdSinceMs = 7000.
        // Default dwell = 60_000ms -> transition fires at t >= 67000.
        var t = 0L
        while (t <= 68_000L) {
            feedSample(magnitude = 0.0, atMs = t)
            t += 1000L
        }

        assertEquals(listOf(MotionState.STATIONARY), received)
    }

    @Test
    fun `low variance for less than dwell does not transition`() {
        val received = mutableListOf<MotionState>()
        val detector = makeDetector()
        detector.start { received += it }

        // 30s of low variance - half the default dwell. No transition.
        var t = 0L
        while (t <= 30_000L) {
            feedSample(magnitude = 0.0, atMs = t)
            t += 1000L
        }

        assertTrue(received.isEmpty())
    }

    @Test
    fun `high variance for MOVING_DWELL transitions STATIONARY to MOVING`() {
        val received = mutableListOf<MotionState>()
        val detector = makeDetector()
        detector.start { received += it }
        detector.forceState(MotionState.STATIONARY)
        received.clear()

        // Alternating ±0.6 -> variance = 0.36 > MOVING threshold (0.30).
        // 8th sample lands at t=700 -> aboveThresholdSinceMs = 700.
        // MOVING_DWELL = 3_000ms -> transition fires at t >= 3700.
        var t = 0L
        var hi = true
        while (t <= 4_000L) {
            feedSample(magnitude = if (hi) 0.6 else -0.6, atMs = t)
            hi = !hi
            t += 100L
        }

        assertEquals(listOf(MotionState.MOVING), received)
    }

    @Test
    fun `ambiguous-band variance does not transition either way`() {
        val received = mutableListOf<MotionState>()
        // Short 5s dwell so the test would clearly transition if ambiguous samples
        // were treated as low-variance.
        val detector = makeDetector(stationaryDwellMs = 5_000L)
        detector.start { received += it }

        // Alternating ±0.45 -> variance = 0.2025, sits between STATIONARY (0.15)
        // and MOVING (0.30) thresholds. Sustained for 10s (twice the dwell).
        var t = 0L
        var hi = true
        while (t <= 10_000L) {
            feedSample(magnitude = if (hi) 0.45 else -0.45, atMs = t)
            hi = !hi
            t += 200L
        }

        assertTrue(received.isEmpty())
    }

    @Test
    fun `SIG_MOTION trigger transitions STATIONARY to MOVING immediately`() {
        val received = mutableListOf<MotionState>()
        val detector = makeDetector()
        detector.start { received += it }
        detector.forceState(MotionState.STATIONARY)
        received.clear()

        sigListenerSlot.captured.onTrigger(mockk<TriggerEvent>(relaxed = true))

        assertEquals(listOf(MotionState.MOVING), received)
    }

    @Test
    fun `SIG_MOTION re-arms itself after firing`() {
        val detector = makeDetector()
        detector.start { /* no-op */ }

        sigListenerSlot.captured.onTrigger(mockk<TriggerEvent>(relaxed = true))

        // Initial registration in start() + re-arm inside onTrigger().
        verify(exactly = 2) { sensorManager.requestTriggerSensor(any(), sigMotionSensor) }
    }

    @Test
    fun `per-zone dwell override is honored`() {
        val received = mutableListOf<MotionState>()
        // Override default 60s with a 5s dwell - simulates a zone with motionlessTimeoutMinutes
        // set very low. 8th sample at t=700 -> transition fires at t >= 5700.
        val detector = makeDetector(stationaryDwellMs = 5_000L)
        detector.start { received += it }

        var t = 0L
        while (t <= 6_000L) {
            feedSample(magnitude = 0.0, atMs = t)
            t += 100L
        }

        assertEquals(listOf(MotionState.STATIONARY), received)
    }
}
