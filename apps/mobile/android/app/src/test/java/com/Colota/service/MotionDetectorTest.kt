/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorManager
import android.hardware.TriggerEventListener
import io.mockk.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class MotionDetectorTest {

    private lateinit var context: Context
    private lateinit var sensorManager: SensorManager
    private lateinit var motionSensor: Sensor
    private var motionCallback = 0

    private fun makeDetector(sensorAvailable: Boolean = true): MotionDetector {
        context = mockk()
        sensorManager = mockk(relaxed = true)
        motionSensor = mockk()

        every { context.getSystemService(Context.SENSOR_SERVICE) } returns sensorManager
        every { sensorManager.getDefaultSensor(Sensor.TYPE_SIGNIFICANT_MOTION) } returns
                if (sensorAvailable) motionSensor else null
        every { sensorManager.requestTriggerSensor(any(), any()) } returns true

        motionCallback = 0
        return MotionDetector(context) { motionCallback++ }
    }

    @Test
    fun `isAvailable returns true when sensor exists`() {
        val detector = makeDetector(sensorAvailable = true)
        assertTrue(detector.isAvailable)
    }

    @Test
    fun `isAvailable returns false when sensor missing`() {
        val detector = makeDetector(sensorAvailable = false)
        assertFalse(detector.isAvailable)
    }

    @Test
    fun `arm registers trigger sensor`() {
        val detector = makeDetector()
        detector.arm()
        verify(exactly = 1) { sensorManager.requestTriggerSensor(any(), motionSensor) }
    }

    @Test
    fun `arm does nothing when sensor unavailable`() {
        val detector = makeDetector(sensorAvailable = false)
        detector.arm()
        verify(exactly = 0) { sensorManager.requestTriggerSensor(any(), any()) }
    }

    @Test
    fun `arm does not double-register when already armed`() {
        val detector = makeDetector()
        detector.arm()
        detector.arm()
        verify(exactly = 1) { sensorManager.requestTriggerSensor(any(), motionSensor) }
    }

    @Test
    fun `disarm cancels trigger sensor`() {
        val detector = makeDetector()
        detector.arm()
        detector.disarm()
        verify(exactly = 1) { sensorManager.cancelTriggerSensor(any(), motionSensor) }
    }

    @Test
    fun `disarm does nothing when not armed`() {
        val detector = makeDetector()
        detector.disarm()
        verify(exactly = 0) { sensorManager.cancelTriggerSensor(any(), any()) }
    }

    @Test
    fun `onTrigger invokes callback and resets armed state`() {
        val listenerSlot = slot<TriggerEventListener>()
        every { sensorManager.requestTriggerSensor(capture(listenerSlot), any()) } returns true

        val detector = makeDetector()
        detector.arm()
        listenerSlot.captured.onTrigger(null)

        assertEquals(1, motionCallback)
        // After trigger fires, armed should be false - disarm should not call cancel
        detector.disarm()
        verify(exactly = 0) { sensorManager.cancelTriggerSensor(any(), any()) }
    }
}
