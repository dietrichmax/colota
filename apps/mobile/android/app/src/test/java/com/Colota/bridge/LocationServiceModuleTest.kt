/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.bridge

import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.location.Location
import com.Colota.data.DatabaseHelper
import com.Colota.data.GeofenceHelper
import com.Colota.data.ProfileHelper
import com.Colota.service.LocationForegroundService
import com.Colota.service.TrackingWatchdogScheduler
import com.Colota.util.AppLogger
import com.Colota.util.SecureStorageHelper
import com.Colota.util.DeviceInfoHelper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.JavaOnlyArray
import com.facebook.react.bridge.JavaOnlyMap
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import io.mockk.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.lang.ref.WeakReference
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

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
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs

        mockkStatic(Arguments::class)
        // A fresh map per call. One shared instance makes every emitted payload look identical, so
        // an assertion about what one event carries silently reads what a later one wrote.
        every { Arguments.createMap() } answers { JavaOnlyMap() }

        // NetworkManager casts this in a field initialiser, and a relaxed mock hands back an Object.
        every { mockContext.getSystemService(Context.CONNECTIVITY_SERVICE) } returns mockk<ConnectivityManager>(relaxed = true)

        mockkObject(DatabaseHelper.Companion)
        // The module builds one in a field initialiser, and it opens an encrypted keystore a plain
        // JVM has no keys for, so constructing the module needs this stubbed.
        mockkObject(SecureStorageHelper.Companion)
        every { SecureStorageHelper.getInstance(any()) } returns mockk(relaxed = true)
        mockkObject(LocationForegroundService.Companion)
        every { LocationForegroundService.isRunning } returns true

        // Alarm plumbing is not under test here, and a plain-JVM getSystemService cannot
        // produce a real AlarmManager.
        mockkObject(TrackingWatchdogScheduler)
        every { TrackingWatchdogScheduler.cancel(any()) } just Runs
        every { TrackingWatchdogScheduler.schedule(any()) } just Runs

        setCompanionField("reactContextRef", WeakReference(mockContext))
        setCompanionField("isAppInForeground", true)
        setCompanionField("activeProfileName", null)
        setCompanionField("activeProfileId", null)
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
        unmockkStatic(Arguments::class)
        unmockkObject(DatabaseHelper.Companion)
        unmockkObject(SecureStorageHelper.Companion)
        unmockkObject(LocationForegroundService.Companion)
        unmockkObject(TrackingWatchdogScheduler)
        setCompanionField("reactContextRef", WeakReference<ReactApplicationContext>(null))
        setCompanionField("isAppInForeground", true)
        setCompanionField("activeProfileName", null)
        setCompanionField("activeProfileId", null)
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
    fun `sendProfileSwitchEvent keeps the active name and id for a reconnecting UI`() {
        LocationServiceModule.sendProfileSwitchEvent("Charging", 1)
        assertEquals("Charging", getCompanionField("activeProfileName"))
        assertEquals(1, getCompanionField("activeProfileId"))
    }

    @Test
    fun `sendProfileSwitchEvent clears the name and id on deactivation`() {
        setCompanionField("activeProfileName", "Charging")
        setCompanionField("activeProfileId", 1)
        LocationServiceModule.sendProfileSwitchEvent(null, null)
        assertNull(getCompanionField("activeProfileName"))
        assertNull(getCompanionField("activeProfileId"))
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

    /**
     * `remaining` is the whole completion contract. A pass caps at MAX_BATCHES_PER_SYNC, so the
     * running count need not reach the queue it started with, and a tick carrying the key would end
     * the caller's flush on the first batch.
     */
    @Test
    fun `a progress tick carries no remaining, and only the event that ends a pass does`() {
        val payloads = mutableListOf<WritableMap>()
        every { mockEmitter.emit("onSyncProgress", capture(payloads)) } just Runs

        LocationServiceModule.sendSyncProgressEvent(50, 0, 412)
        LocationServiceModule.sendSyncProgressEvent(500, 3, 503, 120)

        assertFalse(payloads[0].hasKey("remaining"))
        assertTrue(payloads[1].hasKey("remaining"))
        assertEquals(120, payloads[1].getInt("remaining"))
        assertEquals(3, payloads[1].getInt("failed"))
    }

    @Test
    fun `sendSyncProgressEvent returns false when no context`() {
        setCompanionField("reactContextRef", WeakReference<ReactApplicationContext>(null))
        assertFalse(LocationServiceModule.sendSyncProgressEvent(0, 0, 0))
    }

    // ========================================================================
    // sendAutoExportEvent
    // ========================================================================

    @Test
    fun `sendAutoExportEvent emits onAutoExportComplete on success`() {
        assertTrue(LocationServiceModule.sendAutoExportEvent(true, "export.geojson", 42, null))
        verify { mockEmitter.emit("onAutoExportComplete", any()) }
    }

    @Test
    fun `sendAutoExportEvent emits onAutoExportComplete on failure`() {
        assertTrue(LocationServiceModule.sendAutoExportEvent(false, null, 0, "IO error"))
        verify { mockEmitter.emit("onAutoExportComplete", any()) }
    }

    @Test
    fun `sendAutoExportEvent returns false when no context`() {
        setCompanionField("reactContextRef", WeakReference<ReactApplicationContext>(null))
        assertFalse(LocationServiceModule.sendAutoExportEvent(true, "file.csv", 10, null))
    }

    @Test
    fun `sendAutoExportEvent returns false when no catalyst`() {
        every { mockContext.hasActiveCatalystInstance() } returns false
        assertFalse(LocationServiceModule.sendAutoExportEvent(true, "file.csv", 10, null))
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
    // sendChargingStateEvent
    // ========================================================================

    @Test
    fun `sendChargingStateEvent emits onChargingStateChanged when charging`() {
        assertTrue(LocationServiceModule.sendChargingStateEvent(true))
        verify { mockEmitter.emit("onChargingStateChanged", any()) }
    }

    @Test
    fun `sendChargingStateEvent emits onChargingStateChanged when discharging`() {
        assertTrue(LocationServiceModule.sendChargingStateEvent(false))
        verify { mockEmitter.emit("onChargingStateChanged", any()) }
    }

    @Test
    fun `sendChargingStateEvent returns false when no context`() {
        setCompanionField("reactContextRef", WeakReference<ReactApplicationContext>(null))
        assertFalse(LocationServiceModule.sendChargingStateEvent(true))
    }

    @Test
    fun `sendChargingStateEvent returns false when no catalyst`() {
        every { mockContext.hasActiveCatalystInstance() } returns false
        assertFalse(LocationServiceModule.sendChargingStateEvent(true))
    }

    // ========================================================================
    // sendLocationStateEvent
    // ========================================================================

    @Test
    fun `sendLocationStateEvent emits onLocationStateChanged when enabled`() {
        assertTrue(LocationServiceModule.sendLocationStateEvent(true))
        verify { mockEmitter.emit("onLocationStateChanged", any()) }
    }

    @Test
    fun `sendLocationStateEvent emits onLocationStateChanged when disabled`() {
        assertTrue(LocationServiceModule.sendLocationStateEvent(false))
        verify { mockEmitter.emit("onLocationStateChanged", any()) }
    }

    @Test
    fun `sendLocationStateEvent returns false when no context`() {
        setCompanionField("reactContextRef", WeakReference<ReactApplicationContext>(null))
        assertFalse(LocationServiceModule.sendLocationStateEvent(true))
    }

    // ========================================================================
    // handleChargingChange — invalidates cache and emits event
    // ========================================================================

    @Test
    fun `handleChargingChange invalidates battery cache and emits charging event`() {
        val module = createModule()
        val deviceInfo = mockk<DeviceInfoHelper>(relaxed = true)
        setField(module, "deviceInfo", deviceInfo)

        module.handleChargingChange(true)

        verify { deviceInfo.invalidateBatteryCache() }
        verify { mockEmitter.emit("onChargingStateChanged", any()) }
    }

    @Test
    fun `handleChargingChange emits discharging event`() {
        val module = createModule()
        val deviceInfo = mockk<DeviceInfoHelper>(relaxed = true)
        setField(module, "deviceInfo", deviceInfo)

        module.handleChargingChange(false)

        verify { deviceInfo.invalidateBatteryCache() }
        verify { mockEmitter.emit("onChargingStateChanged", any()) }
    }

    // ========================================================================
    // resyncChargingState — reads sticky and forwards to handleChargingChange
    // ========================================================================

    @Test
    fun `resyncChargingState forwards plugged state to handleChargingChange`() {
        val module = spyk(createModule())
        val deviceInfo = mockk<DeviceInfoHelper>(relaxed = true) {
            every { isPluggedIn() } returns true
        }
        setField(module, "deviceInfo", deviceInfo)
        every { module.handleChargingChange(any()) } just Runs

        module.resyncChargingState()

        verify { deviceInfo.isPluggedIn() }
        verify { module.handleChargingChange(true) }
    }

    @Test
    fun `resyncChargingState forwards unplugged state to handleChargingChange`() {
        val module = spyk(createModule())
        val deviceInfo = mockk<DeviceInfoHelper>(relaxed = true) {
            every { isPluggedIn() } returns false
        }
        setField(module, "deviceInfo", deviceInfo)
        every { module.handleChargingChange(any()) } just Runs

        module.resyncChargingState()

        verify { module.handleChargingChange(false) }
    }

    // ========================================================================
    // Lifecycle methods
    // ========================================================================

    @Test
    fun `onHostResume sets foreground true and registers receiver`() {
        setCompanionField("isAppInForeground", false)
        val module = spyk(createModule())
        every { module.registerChargingReceiver() } just Runs

        module.onHostResume()

        assertTrue(getCompanionField("isAppInForeground") as Boolean)
        verify { module.registerChargingReceiver() }
    }

    @Test
    fun `onHostPause sets foreground false and unregisters receiver`() {
        setCompanionField("isAppInForeground", true)
        val module = spyk(createModule())
        every { module.unregisterChargingReceiver() } just Runs

        module.onHostPause()

        assertFalse(getCompanionField("isAppInForeground") as Boolean)
        verify { module.unregisterChargingReceiver() }
    }

    @Test
    fun `onHostDestroy sets foreground false and unregisters receiver`() {
        setCompanionField("isAppInForeground", true)
        val module = spyk(createModule())
        every { module.unregisterChargingReceiver() } just Runs

        module.onHostDestroy()

        assertFalse(getCompanionField("isAppInForeground") as Boolean)
        verify { module.unregisterChargingReceiver() }
    }

    // ========================================================================
    // triggerProfileRecheck — only dispatches when tracking is enabled
    // ========================================================================

    @Test
    fun `triggerProfileRecheck skips when the service is not running`() {
        val (module, _) = createModuleWithDeps()
        every { LocationForegroundService.isRunning } returns false

        invokePrivate(module, "triggerProfileRecheck")

        verify(exactly = 0) { module["startServiceWithAction"](any<String>()) }
    }

    @Test
    fun `triggerProfileRecheck dispatches when the service is running`() {
        val (module, _) = createModuleWithDeps()
        every { LocationForegroundService.isRunning } returns true

        invokePrivate(module, "triggerProfileRecheck")

        verify { module["startServiceWithAction"](LocationForegroundService.ACTION_RECHECK_PROFILES) }
    }

    /**
     * The intent flag outlives a service the system killed, so gating on it used to send a
     * lightweight action to nothing - cold-starting a service that never begins tracking.
     */
    @Test
    fun `triggerProfileRecheck skips a dead service even though the user still wants tracking`() {
        val (module, dbHelper) = createModuleWithDeps()
        every { dbHelper.getSetting("tracking_enabled", "false") } returns "true"
        every { LocationForegroundService.isRunning } returns false

        invokePrivate(module, "triggerProfileRecheck")

        verify(exactly = 0) { module["startServiceWithAction"](any<String>()) }
    }

    // ========================================================================
    // refreshNotificationIfTracking — only dispatches when the service is alive
    // ========================================================================

    @Test
    fun `refreshNotificationIfTracking skips when the service is not running`() {
        val (module, _) = createModuleWithDeps()
        every { LocationForegroundService.isRunning } returns false

        invokePrivate(module, "refreshNotificationIfTracking")

        verify(exactly = 0) { module["startServiceWithAction"](any<String>()) }
    }

    @Test
    fun `refreshNotificationIfTracking dispatches when the service is running`() {
        val (module, _) = createModuleWithDeps()
        every { LocationForegroundService.isRunning } returns true

        invokePrivate(module, "refreshNotificationIfTracking")

        verify { module["startServiceWithAction"](LocationForegroundService.ACTION_REFRESH_NOTIFICATION) }
    }

    // ========================================================================
    // triggerZoneRecheck — same liveness gate
    // ========================================================================

    @Test
    fun `triggerZoneRecheck skips when the service is not running`() {
        val (module, _) = createModuleWithDeps()
        every { LocationForegroundService.isRunning } returns false

        invokePrivate(module, "triggerZoneRecheck")

        verify(exactly = 0) { module["startServiceWithAction"](any<String>()) }
    }

    @Test
    fun `triggerZoneRecheck dispatches when the service is running`() {
        val (module, _) = createModuleWithDeps()
        every { LocationForegroundService.isRunning } returns true

        invokePrivate(module, "triggerZoneRecheck")

        verify { module["startServiceWithAction"](LocationForegroundService.ACTION_RECHECK_ZONE) }
    }

    // ========================================================================
    // stopService — intent is cleared before the service goes away
    // ========================================================================

    /**
     * Written after the stop, the flag left a window where the service was already gone but the
     * user's intent still read true - long enough for a liveness check to restart what they
     * had just turned off.
     */
    @Test
    fun `stopService clears the user's intent before stopping the service`() {
        val (module, dbHelper) = createModuleWithDeps()
        mockkConstructor(Intent::class)
        try {
            module.stopService()

            verifyOrder {
                dbHelper.saveSetting("tracking_enabled", "false")
                mockContext.stopService(any())
            }
        } finally {
            unmockkConstructor(Intent::class)
        }
    }

    // ========================================================================
    // startService — records a recovery start in the native log
    // ========================================================================

    /**
     * The JS reconciler's own logging never reaches the exported log, so this line is the
     * only evidence a report will carry that the service had died while tracking was on.
     */
    @Test
    fun `startService records that it is reviving a service which died while tracking was on`() {
        val (module, dbHelper) = createModuleWithDeps()
        every { LocationForegroundService.isRunning } returns false
        every { dbHelper.getSetting("tracking_enabled", "false") } returns "true"
        mockkConstructor(Intent::class)
        try {
            module.startService(JavaOnlyMap(), mockk(relaxed = true))

            verify { AppLogger.w(any(), "Starting a service that died while tracking was on") }
        } finally {
            unmockkConstructor(Intent::class)
        }
    }

    @Test
    fun `startService stays quiet on an ordinary user start`() {
        val (module, dbHelper) = createModuleWithDeps()
        every { LocationForegroundService.isRunning } returns false
        every { dbHelper.getSetting("tracking_enabled", "false") } returns "false"
        mockkConstructor(Intent::class)
        try {
            module.startService(JavaOnlyMap(), mockk(relaxed = true))

            verify(exactly = 0) { AppLogger.w(any(), "Starting a service that died while tracking was on") }
        } finally {
            unmockkConstructor(Intent::class)
        }
    }

    // ========================================================================
    // isServiceRunning
    // ========================================================================

    @Test
    fun `isServiceRunning resolves the service's own liveness flag`() {
        val (module, _) = createModuleWithDeps()
        val promise = mockk<com.facebook.react.bridge.Promise>(relaxed = true)
        every { LocationForegroundService.isRunning } returns true

        module.isServiceRunning(promise)

        verify { promise.resolve(true) }
    }

    // ========================================================================
    // Module name
    // ========================================================================

    @Test
    fun `getName returns LocationServiceModule`() {
        assertEquals("LocationServiceModule", createModule().getName())
    }

    // ========================================================================
    // getActiveProfile reads the companion's active name and id
    // ========================================================================

    @Test
    fun `getActiveProfile resolves null when no profile active`() {
        setCompanionField("activeProfileName", null)
        val promise = mockk<com.facebook.react.bridge.Promise>(relaxed = true)
        createModule().getActiveProfile(promise)
        verify { promise.resolve(null) }
    }

    @Test
    fun `getActiveProfile resolves the name and id when active, so the UI can show the profile's interval after a restart`() {
        setCompanionField("activeProfileName", "Charging")
        setCompanionField("activeProfileId", 3)
        val promise = mockk<com.facebook.react.bridge.Promise>(relaxed = true)
        createModule().getActiveProfile(promise)
        val map = slot<JavaOnlyMap>()
        verify { promise.resolve(capture(map)) }
        assertEquals("Charging", map.captured.getString("name"))
        assertEquals(3, map.captured.getInt("id"))
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
        // Unsafe-allocated module skipped construction; supply the context the dbHelper getter reads.
        setSuperField(module, "mReactApplicationContext", mockContext)
        every { DatabaseHelper.getInstance(any()) } returns dbHelper
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

    private fun setSuperField(obj: Any, name: String, value: Any?) {
        var clazz: Class<*>? = obj.javaClass
        while (clazz != null) {
            try {
                val field = clazz.getDeclaredField(name)
                field.isAccessible = true
                field.set(obj, value)
                return
            } catch (_: NoSuchFieldException) {
                clazz = clazz.superclass
            }
        }
        throw NoSuchFieldException(name)
    }

    // ========================================================================
    // Which deletes rewrite the database
    // ========================================================================

    /**
     * A track edit is a few rows out of millions and gets repeated, so it must not trigger a full
     * rewrite: VACUUM holds the one write connection for minutes and stalls the recording service.
     * The bulk deletes on Data management are rare and asked for, so they still do.
     */
    @Test
    fun `deleting a trip does not rewrite the database`() {
        val db = stubDatabase()
        every { db.deleteInRange(any(), any()) } returns 120

        awaitPromise { promise -> LocationServiceModule(mockContext).deleteLocationsInRange(1000.0, 2000.0, promise) }

        verify(exactly = 1) { db.deleteInRange(1000L, 2000L) }
        assertNoVacuum(db)
    }

    @Test
    fun `deleting selected trips does not rewrite the database`() {
        val db = stubDatabase()
        every { db.deleteInRanges(any()) } returns 40
        val ranges = JavaOnlyArray().apply {
            pushMap(JavaOnlyMap().apply {
                putDouble("start", 10.0)
                putDouble("end", 20.0)
            })
        }

        awaitPromise { promise -> LocationServiceModule(mockContext).deleteLocationsInRanges(ranges, promise) }

        verify(exactly = 1) { db.deleteInRanges(listOf(10L to 20L)) }
        assertNoVacuum(db)
    }

    @Test
    fun `deleting single points does not rewrite the database`() {
        val db = stubDatabase()
        every { db.deleteLocations(any()) } returns 1
        val ids = JavaOnlyArray().apply { pushDouble(7.0) }

        awaitPromise { promise -> LocationServiceModule(mockContext).deleteLocationsByIds(ids, promise) }

        verify(exactly = 1) { db.deleteLocations(listOf(7L)) }
        assertNoVacuum(db)
    }

    @Test
    fun `a bulk delete on Data management still rewrites the database`() {
        val db = stubDatabase()
        every { db.deleteOlderThan(any()) } returns 9000

        awaitPromise { promise -> LocationServiceModule(mockContext).deleteOlderThan(90, promise) }

        verify(exactly = 1) { db.deleteOlderThan(90) }
        // Fire-and-forget on its own coroutine, so the promise resolves before it runs.
        verify(timeout = 5000, exactly = 1) { db.vacuum() }
    }

    /**
     * The rewrite runs on a detached coroutine, so the promise can settle before it would have
     * started. Proving it never runs means giving it the chance and then checking.
     */
    private fun assertNoVacuum(db: DatabaseHelper) {
        Thread.sleep(200)
        verify(exactly = 0) { db.vacuum() }
    }

    private fun stubDatabase(): DatabaseHelper {
        val db = mockk<DatabaseHelper>(relaxed = true)
        every { DatabaseHelper.getInstance(any()) } returns db
        return db
    }

    /** The bridge resolves on its own coroutine, so a test has to wait for the promise, not the call. */
    private fun awaitPromise(call: (Promise) -> Unit) {
        val latch = CountDownLatch(1)
        val promise = mockk<Promise>(relaxed = true)
        every { promise.resolve(any()) } answers { latch.countDown() }
        every { promise.reject(any<String>(), any<String>(), any<Throwable>()) } answers { latch.countDown() }

        call(promise)

        assertTrue("the bridge never settled its promise", latch.await(5, TimeUnit.SECONDS))
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
