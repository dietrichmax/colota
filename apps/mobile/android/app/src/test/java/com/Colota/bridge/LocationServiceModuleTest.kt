/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.bridge

import android.location.Location
import com.Colota.data.DatabaseHelper
import com.Colota.data.GeofenceHelper
import com.Colota.data.ProfileHelper
import com.Colota.service.LocationForegroundService
import com.Colota.util.AppLogger
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import io.mockk.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.lang.ref.WeakReference

/**
 * Tests for LocationServiceModule:
 * - Companion object event methods (foreground gating, null context, event emission)
 * - Lifecycle methods (isAppInForeground toggle)
 * - Conditional service action dispatch (triggerProfileRecheck, refreshNotificationIfTracking)
 * - CRUD side effects (cache invalidation + recheck triggers)
 */
@Suppress("DEPRECATION")
class LocationServiceModuleTest {

    private lateinit var mockContext: ReactApplicationContext
    private lateinit var mockEmitter: DeviceEventManagerModule.RCTDeviceEventEmitter

    @Before
    fun setUp() {
        mockEmitter = mockk(relaxed = true)
        mockContext = mockk(relaxed = true) {
            every { hasActiveCatalystInstance() } returns true
            every { getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java) } returns mockEmitter
        }

        mockkObject(AppLogger)
        every { AppLogger.enabled } returns false
        every { AppLogger.enabled = any() } just Runs
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs

        mockkStatic(Arguments::class)
        every { Arguments.createMap() } returns JavaOnlyMap()

        setCompanionField("reactContextRef", WeakReference(mockContext))
        setCompanionField("isAppInForeground", true)
        setCompanionField("activeProfileName", null)
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
        unmockkStatic(Arguments::class)
        setCompanionField("reactContextRef", WeakReference<ReactApplicationContext>(null))
        setCompanionField("isAppInForeground", true)
        setCompanionField("activeProfileName", null)
    }

    // ========================================================================
    // sendLocationEvent
    // ========================================================================

    @Test
    fun `sendLocationEvent returns false when app is backgrounded`() {
        setCompanionField("isAppInForeground", false)
        assertFalse(LocationServiceModule.sendLocationEvent(mockLocation(), 85, 2))
        verify(exactly = 0) { mockEmitter.emit(any(), any()) }
    }

    @Test
    fun `sendLocationEvent returns false when context is null`() {
        setCompanionField("reactContextRef", WeakReference<ReactApplicationContext>(null))
        assertFalse(LocationServiceModule.sendLocationEvent(mockLocation(), 85, 2))
    }

    @Test
    fun `sendLocationEvent returns false when no active catalyst`() {
        every { mockContext.hasActiveCatalystInstance() } returns false
        assertFalse(LocationServiceModule.sendLocationEvent(mockLocation(), 85, 2))
    }

    @Test
    fun `sendLocationEvent emits onLocationUpdate when conditions met`() {
        assertTrue(LocationServiceModule.sendLocationEvent(mockLocation(), 85, 2))
        verify { mockEmitter.emit("onLocationUpdate", any()) }
    }

    @Test
    fun `sendLocationEvent returns false on exception`() {
        every {
            mockContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        } throws RuntimeException("bridge dead")
        assertFalse(LocationServiceModule.sendLocationEvent(mockLocation(), 85, 2))
    }

    // ========================================================================
    // sendTrackingStoppedEvent
    // ========================================================================

    @Test
    fun `sendTrackingStoppedEvent emits onTrackingStopped`() {
        assertTrue(LocationServiceModule.sendTrackingStoppedEvent("battery_critical"))
        verify { mockEmitter.emit("onTrackingStopped", any()) }
    }

    @Test
    fun `sendTrackingStoppedEvent returns false when no context`() {
        setCompanionField("reactContextRef", WeakReference<ReactApplicationContext>(null))
        assertFalse(LocationServiceModule.sendTrackingStoppedEvent("oom_kill"))
    }

    @Test
    fun `sendTrackingStoppedEvent returns false when no catalyst`() {
        every { mockContext.hasActiveCatalystInstance() } returns false
        assertFalse(LocationServiceModule.sendTrackingStoppedEvent("reason"))
    }

    // ========================================================================
    // sendSyncErrorEvent
    // ========================================================================

    @Test
    fun `sendSyncErrorEvent emits onSyncError`() {
        assertTrue(LocationServiceModule.sendSyncErrorEvent("Network failed", 42))
        verify { mockEmitter.emit("onSyncError", any()) }
    }

    @Test
    fun `sendSyncErrorEvent returns false when no context`() {
        setCompanionField("reactContextRef", WeakReference<ReactApplicationContext>(null))
        assertFalse(LocationServiceModule.sendSyncErrorEvent("error", 0))
    }

    // ========================================================================
    // sendProfileSwitchEvent
    // ========================================================================

    @Test
    fun `sendProfileSwitchEvent updates activeProfileName`() {
        LocationServiceModule.sendProfileSwitchEvent("Charging", 1)
        assertEquals("Charging", getCompanionField("activeProfileName"))
    }

    @Test
    fun `sendProfileSwitchEvent clears activeProfileName on deactivation`() {
        setCompanionField("activeProfileName", "Charging")
        LocationServiceModule.sendProfileSwitchEvent(null, null)
        assertNull(getCompanionField("activeProfileName"))
    }

    @Test
    fun `sendProfileSwitchEvent updates name even when context is null`() {
        setCompanionField("reactContextRef", WeakReference<ReactApplicationContext>(null))
        LocationServiceModule.sendProfileSwitchEvent("Fast", 3)
        assertEquals("Fast", getCompanionField("activeProfileName"))
    }

    @Test
    fun `sendProfileSwitchEvent emits onProfileSwitch`() {
        assertTrue(LocationServiceModule.sendProfileSwitchEvent("Charging", 1))
        verify { mockEmitter.emit("onProfileSwitch", any()) }
    }

    @Test
    fun `sendProfileSwitchEvent returns false when no context but still updates name`() {
        setCompanionField("reactContextRef", WeakReference<ReactApplicationContext>(null))
        assertFalse(LocationServiceModule.sendProfileSwitchEvent("Fast", 3))
        assertEquals("Fast", getCompanionField("activeProfileName"))
    }

    // ========================================================================
    // sendSyncProgressEvent
    // ========================================================================

    @Test
    fun `sendSyncProgressEvent emits onSyncProgress`() {
        assertTrue(LocationServiceModule.sendSyncProgressEvent(5, 2, 100))
        verify { mockEmitter.emit("onSyncProgress", any()) }
    }

    @Test
    fun `sendSyncProgressEvent returns false when no context`() {
        setCompanionField("reactContextRef", WeakReference<ReactApplicationContext>(null))
        assertFalse(LocationServiceModule.sendSyncProgressEvent(0, 0, 0))
    }

    // ========================================================================
    // sendPauseZoneEvent
    // ========================================================================

    @Test
    fun `sendPauseZoneEvent emits onPauseZoneChange`() {
        assertTrue(LocationServiceModule.sendPauseZoneEvent(true, "Home"))
        verify { mockEmitter.emit("onPauseZoneChange", any()) }
    }

    @Test
    fun `sendPauseZoneEvent returns false when no context`() {
        setCompanionField("reactContextRef", WeakReference<ReactApplicationContext>(null))
        assertFalse(LocationServiceModule.sendPauseZoneEvent(false, null))
    }

    @Test
    fun `sendPauseZoneEvent returns false when no catalyst`() {
        every { mockContext.hasActiveCatalystInstance() } returns false
        assertFalse(LocationServiceModule.sendPauseZoneEvent(true, "Office"))
    }

    // ========================================================================
    // Lifecycle methods
    // ========================================================================

    @Test
    fun `onHostResume sets foreground true`() {
        setCompanionField("isAppInForeground", false)
        createModule().onHostResume()
        assertTrue(getCompanionField("isAppInForeground") as Boolean)
    }

    @Test
    fun `onHostPause sets foreground false`() {
        setCompanionField("isAppInForeground", true)
        createModule().onHostPause()
        assertFalse(getCompanionField("isAppInForeground") as Boolean)
    }

    @Test
    fun `onHostDestroy sets foreground false`() {
        setCompanionField("isAppInForeground", true)
        createModule().onHostDestroy()
        assertFalse(getCompanionField("isAppInForeground") as Boolean)
    }

    // ========================================================================
    // triggerProfileRecheck — only dispatches when tracking is enabled
    // ========================================================================

    @Test
    fun `triggerProfileRecheck skips when tracking disabled`() {
        val (module, dbHelper) = createModuleWithDeps()
        every { dbHelper.getSetting("tracking_enabled", "false") } returns "false"

        invokePrivate(module, "triggerProfileRecheck")

        verify(exactly = 0) { module["startServiceWithAction"](any<String>()) }
    }

    @Test
    fun `triggerProfileRecheck dispatches when tracking enabled`() {
        val (module, dbHelper) = createModuleWithDeps()
        every { dbHelper.getSetting("tracking_enabled", "false") } returns "true"

        invokePrivate(module, "triggerProfileRecheck")

        verify { module["startServiceWithAction"](LocationForegroundService.ACTION_RECHECK_PROFILES) }
    }

    // ========================================================================
    // refreshNotificationIfTracking — only dispatches when tracking is enabled
    // ========================================================================

    @Test
    fun `refreshNotificationIfTracking skips when not tracking`() {
        val (module, dbHelper) = createModuleWithDeps()
        every { dbHelper.getSetting("tracking_enabled", "false") } returns "false"

        invokePrivate(module, "refreshNotificationIfTracking")

        verify(exactly = 0) { module["startServiceWithAction"](any<String>()) }
    }

    @Test
    fun `refreshNotificationIfTracking dispatches when tracking`() {
        val (module, dbHelper) = createModuleWithDeps()
        every { dbHelper.getSetting("tracking_enabled", "false") } returns "true"

        invokePrivate(module, "refreshNotificationIfTracking")

        verify { module["startServiceWithAction"](LocationForegroundService.ACTION_REFRESH_NOTIFICATION) }
    }

    // ========================================================================
    // Module name
    // ========================================================================

    @Test
    fun `getName returns LocationServiceModule`() {
        assertEquals("LocationServiceModule", createModule().getName())
    }

    // ========================================================================
    // getActiveProfile reads companion activeProfileName
    // ========================================================================

    @Test
    fun `getActiveProfile resolves null when no profile active`() {
        setCompanionField("activeProfileName", null)
        val promise = mockk<com.facebook.react.bridge.Promise>(relaxed = true)
        createModule().getActiveProfile(promise)
        verify { promise.resolve(null) }
    }

    @Test
    fun `getActiveProfile resolves profile name when active`() {
        setCompanionField("activeProfileName", "Charging")
        val promise = mockk<com.facebook.react.bridge.Promise>(relaxed = true)
        createModule().getActiveProfile(promise)
        verify { promise.resolve("Charging") }
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private fun createModule(): LocationServiceModule {
        val unsafeClass = Class.forName("sun.misc.Unsafe")
        val unsafeField = unsafeClass.getDeclaredField("theUnsafe")
        unsafeField.isAccessible = true
        val unsafe = unsafeField.get(null)
        val allocateMethod = unsafeClass.getMethod("allocateInstance", Class::class.java)
        return allocateMethod.invoke(unsafe, LocationServiceModule::class.java) as LocationServiceModule
    }

    /**
     * Creates a spyk module with mocked dbHelper and stubbed startServiceWithAction.
     * Returns the module and its dbHelper for test setup.
     */
    private fun createModuleWithDeps(): Pair<LocationServiceModule, DatabaseHelper> {
        val raw = createModule()
        val module = spyk(raw, recordPrivateCalls = true)
        val dbHelper = mockk<DatabaseHelper>(relaxed = true)
        setField(module, "dbHelper", dbHelper)
        // Stub private method to avoid real Android service start
        every { module["startServiceWithAction"](any<String>()) } returns Unit
        return Pair(module, dbHelper)
    }

    private fun mockLocation(lat: Double = 52.52, lon: Double = 13.405): Location {
        return mockk {
            every { latitude } returns lat
            every { longitude } returns lon
            every { accuracy } returns 10f
            every { speed } returns 1.5f
            every { bearing } returns 90f
            every { time } returns 1700000000000L
            every { hasAltitude() } returns false
            every { hasSpeed() } returns true
            every { hasBearing() } returns true
        }
    }

    private fun setCompanionField(name: String, value: Any?) {
        val field = LocationServiceModule::class.java.getDeclaredField(name)
        field.isAccessible = true
        field.set(null, value)
    }

    private fun getCompanionField(name: String): Any? {
        val field = LocationServiceModule::class.java.getDeclaredField(name)
        field.isAccessible = true
        return field.get(null)
    }

    private fun setField(obj: Any, name: String, value: Any?) {
        val field = obj.javaClass.getDeclaredField(name)
        field.isAccessible = true
        field.set(obj, value)
    }

    private fun getField(obj: Any, name: String): Any? {
        val field = obj.javaClass.getDeclaredField(name)
        field.isAccessible = true
        return field.get(obj)
    }

    private fun invokePrivate(obj: Any, methodName: String) {
        val method = obj.javaClass.getDeclaredMethod(methodName)
        method.isAccessible = true
        method.invoke(obj)
    }
}
