package com.Colota.service

import android.app.NotificationManager
import android.location.Location
import com.Colota.bridge.LocationServiceModule
import com.Colota.data.DatabaseHelper
import com.Colota.data.GeofenceHelper
import com.Colota.location.LocationProvider
import com.Colota.location.LocationUpdateCallback
import com.Colota.sync.PayloadBuilder
import com.Colota.sync.NetworkManager
import com.Colota.sync.SyncManager
import com.Colota.util.AppLogger
import com.Colota.util.DeviceInfoHelper
import com.Colota.util.SecureStorageHelper
import io.mockk.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Tests for LocationForegroundService logic using mock-injected dependencies.
 *
 * Covers:
 * - handleLocationUpdate full pipeline (accuracy filter, zone check, DB save, sync, notification)
 * - Lightweight action handlers (zone recheck, force exit, profile recheck)
 * - enterPauseZone / exitPauseZone state transitions
 * - applyProfileConfig dynamic switching
 * - onDestroy cleanup
 */
@OptIn(ExperimentalCoroutinesApi::class)
class LocationForegroundServiceTest {

    private lateinit var locationProvider: LocationProvider
    private lateinit var dbHelper: DatabaseHelper
    private lateinit var geofenceHelper: GeofenceHelper
    private lateinit var syncManager: SyncManager
    private lateinit var deviceInfoHelper: DeviceInfoHelper
    private lateinit var notificationHelper: NotificationHelper
    private lateinit var profileManager: ProfileManager
    private lateinit var conditionMonitor: ConditionMonitor
    private lateinit var secureStorage: SecureStorageHelper
    private lateinit var networkManager: NetworkManager
    private lateinit var androidNotificationManager: NotificationManager

    private lateinit var testDispatcher: TestDispatcher
    private lateinit var testScope: TestScope
    private lateinit var defaultServiceScope: CoroutineScope
    private lateinit var service: LocationForegroundService

    @Before
    fun setUp() {
        locationProvider = mockk(relaxed = true)
        dbHelper = mockk(relaxed = true)
        geofenceHelper = mockk(relaxed = true)
        syncManager = mockk(relaxed = true)
        deviceInfoHelper = mockk(relaxed = true)
        notificationHelper = mockk(relaxed = true)
        profileManager = mockk(relaxed = true)
        conditionMonitor = mockk(relaxed = true)
        secureStorage = mockk(relaxed = true)
        networkManager = mockk(relaxed = true)
        androidNotificationManager = mockk(relaxed = true)

        testDispatcher = UnconfinedTestDispatcher()
        Dispatchers.setMain(testDispatcher)
        testScope = TestScope(testDispatcher)
        defaultServiceScope = CoroutineScope(testDispatcher + SupervisorJob())

        every { deviceInfoHelper.getCachedBatteryStatus() } returns Pair(80, 2)
        every { deviceInfoHelper.isBatteryCritical(any()) } returns false
        every { deviceInfoHelper.isBatteryCritical() } returns false
        every { deviceInfoHelper.isLocationEnabled() } returns true
        every { geofenceHelper.getPauseZone(any()) } returns null
        mockkObject(PayloadBuilder)
        every { PayloadBuilder.buildLocationPayload(any(), any(), any(), any(), any(), any(), any()) } returns JSONObject()
        every { PayloadBuilder.parseFieldMap(any()) } returns null
        every { PayloadBuilder.parseCustomFields(any()) } returns null
        every { syncManager.getCachedQueuedCount() } returns 0
        every { syncManager.lastSuccessfulSyncTime } returns 0L
        every { profileManager.getActiveProfileName() } returns null
        every { secureStorage.getAuthHeaders() } returns emptyMap()

        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs

        mockkObject(LocationServiceModule)
        every { LocationServiceModule.sendLocationEvent(any(), any(), any()) } returns true
        every { LocationServiceModule.sendPauseZoneEvent(any(), any()) } returns true
        every { LocationServiceModule.sendPauseZoneEvent(any(), any(), any()) } returns true
        every { LocationServiceModule.sendTrackingStoppedEvent(any()) } returns true
        every { LocationServiceModule.sendProfileSwitchEvent(any(), any()) } returns true

        mockkStatic(android.os.Looper::class)
        every { android.os.Looper.getMainLooper() } returns mockk(relaxed = true)

        service = spyk(LocationForegroundService(), recordPrivateCalls = true)
        every { service.stopForeground(any<Int>()) } returns Unit
        @Suppress("DEPRECATION")
        every { service.stopForeground(any<Boolean>()) } returns Unit
        every { service.stopSelf() } returns Unit
        injectDependencies()
    }

    @After
    fun tearDown() {
        defaultServiceScope.cancel()
        testScope.cancel()
        Dispatchers.resetMain()
        unmockkObject(LocationServiceModule)
        unmockkObject(PayloadBuilder)
        unmockkObject(AppLogger)
        unmockkStatic(android.os.Looper::class)
    }

    private fun injectDependencies() {
        setField("locationProvider", locationProvider)
        setField("dbHelper", dbHelper)
        setField("geofenceHelper", geofenceHelper)
        setField("syncManager", syncManager)
        setField("deviceInfoHelper", deviceInfoHelper)
        setField("notificationHelper", notificationHelper)
        setField("profileManager", profileManager)
        setField("conditionMonitor", conditionMonitor)
        setField("secureStorage", secureStorage)
        setField("networkManager", networkManager)
        setField("notificationManager", androidNotificationManager)
        setField("serviceScope", defaultServiceScope)
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            interval = 5000L,
            filterInaccurateLocations = true,
            accuracyThreshold = 50.0f,
            syncIntervalSeconds = 0
        ))
    }

    /**
     * Runs a test body on [testScope] with `serviceScope` pointed at `runTest`'s
     * [backgroundScope], which auto-cancels at the end of the test body. Use this for any
     * test that exercises code launching long-running jobs on `serviceScope` (eg the
     * tracking heartbeat started by `setupLocationUpdates`).
     */
    private fun runServiceTest(block: suspend TestScope.() -> Unit): TestResult = testScope.runTest {
        setField("serviceScope", backgroundScope)
        block()
    }

    private fun setField(name: String, value: Any?) {
        val field = LocationForegroundService::class.java.getDeclaredField(name)
        field.isAccessible = true
        field.set(service, value)
    }

    @Suppress("UNCHECKED_CAST")
    private fun <T> getField(name: String): T {
        val field = LocationForegroundService::class.java.getDeclaredField(name)
        field.isAccessible = true
        return field.get(service) as T
    }

    private fun mockLocation(
        lat: Double = 52.52,
        lon: Double = 13.405,
        accuracy: Float = 10f,
        altitude: Double = 50.0,
        hasAltitude: Boolean = true,
        speed: Float = 5f,
        hasSpeed: Boolean = true,
        bearing: Float = 90f,
        hasBearing: Boolean = true,
        time: Long = System.currentTimeMillis(),
        distanceTo: Float = 0f
    ): Location = mockk {
        every { latitude } returns lat
        every { longitude } returns lon
        every { this@mockk.accuracy } returns accuracy
        every { this@mockk.altitude } returns altitude
        every { hasAltitude() } returns hasAltitude
        every { this@mockk.speed } returns speed
        every { hasSpeed() } returns hasSpeed
        every { this@mockk.bearing } returns bearing
        every { hasBearing() } returns hasBearing
        every { this@mockk.time } returns time
        every { provider } returns "gps"
        every { distanceTo(any()) } returns distanceTo
        every { setSpeed(any()) } just Runs
    }

    // =========================================================================
    // handleLocationUpdate - full pipeline
    // =========================================================================

    @Test
    fun `handleLocationUpdate saves location to DB and queues sync`() = testScope.runTest {
        val location = mockLocation()
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 42L

        invokeHandleLocationUpdate(location)

        verify { dbHelper.saveLocation(
            latitude = 52.52,
            longitude = 13.405,
            accuracy = 10.0,
            altitude = 50,
            speed = 5.0,
            bearing = 90.0,
            battery = 80,
            battery_status = 2,
            timestamp = any(),
            endpoint = "https://example.com"
        ) }
        coVerify { syncManager.queueAndSend(42L, any()) }
    }

    @Test
    fun `handleLocationUpdate sends location event to JS bridge`() = testScope.runTest {
        val location = mockLocation()
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify { LocationServiceModule.sendLocationEvent(location, 80, 2) }
    }

    @Test
    fun `handleLocationUpdate builds location payload from PayloadBuilder`() = testScope.runTest {
        val location = mockLocation()
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify { PayloadBuilder.buildLocationPayload(location, any(), 80, 2, any(), any(), any()) }
    }

    @Test
    fun `handleLocationUpdate filters inaccurate location above threshold`() = testScope.runTest {
        val location = mockLocation(accuracy = 75f)

        invokeHandleLocationUpdate(location)

        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        coVerify(exactly = 0) { syncManager.queueAndSend(any(), any()) }
    }

    @Test
    fun `handleLocationUpdate passes location at exactly threshold`() = testScope.runTest {
        val location = mockLocation(accuracy = 50f)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `handleLocationUpdate skips filter when filterInaccurateLocations disabled`() = testScope.runTest {
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            filterInaccurateLocations = false,
            accuracyThreshold = 50f
        ))
        val location = mockLocation(accuracy = 500f)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `handleLocationUpdate feeds location to profile manager after accuracy filter`() = testScope.runTest {
        val location = mockLocation(accuracy = 10f)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify { profileManager.onLocationUpdate(location) }
    }

    @Test
    fun `handleLocationUpdate does not feed filtered location to profile manager`() = testScope.runTest {
        val location = mockLocation(accuracy = 75f)

        invokeHandleLocationUpdate(location)

        verify(exactly = 0) { profileManager.onLocationUpdate(any()) }
    }

    @Test
    fun `handleLocationUpdate updates lastKnownLocation`() = testScope.runTest {
        val location = mockLocation()
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        assertEquals(location, getField<Location?>("lastKnownLocation"))
    }

    @Test
    fun `handleLocationUpdate handles null altitude`() = testScope.runTest {
        val location = mockLocation(hasAltitude = false)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify { dbHelper.saveLocation(
            any(), any(), any(),
            altitude = null,
            any(), any(), any(), any(), any(), any()
        ) }
    }

    @Test
    fun `handleLocationUpdate handles null speed when no previous location`() = testScope.runTest {
        val location = mockLocation(hasSpeed = false)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify { dbHelper.saveLocation(
            any(), any(), any(), any(),
            speed = null,
            any(), any(), any(), any(), any()
        ) }
        verify(exactly = 0) { location.setSpeed(any()) }
    }

    // =========================================================================
    // applySpeedFallback
    // =========================================================================

    @Test
    fun `applySpeedFallback calculates speed from consecutive points`() = testScope.runTest {
        val now = System.currentTimeMillis()
        val prev = mockLocation(time = now - 10_000, distanceTo = 50f)  // 50m in 10s = 5 m/s
        setField("lastKnownLocation", prev)

        val location = mockLocation(hasSpeed = false, time = now)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify { location.setSpeed(5.0f) }
    }

    @Test
    fun `applySpeedFallback does not override GPS-provided speed`() = testScope.runTest {
        val now = System.currentTimeMillis()
        val prev = mockLocation(time = now - 10_000, distanceTo = 50f)
        setField("lastKnownLocation", prev)

        val location = mockLocation(hasSpeed = true, speed = 3f, time = now)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify(exactly = 0) { location.setSpeed(any()) }
    }

    @Test
    fun `applySpeedFallback skips when time delta too small`() = testScope.runTest {
        val now = System.currentTimeMillis()
        val prev = mockLocation(time = now - 500, distanceTo = 50f)  // 500ms
        setField("lastKnownLocation", prev)

        val location = mockLocation(hasSpeed = false, time = now)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify(exactly = 0) { location.setSpeed(any()) }
    }

    @Test
    fun `applySpeedFallback skips when time delta too large`() = testScope.runTest {
        val now = System.currentTimeMillis()
        val prev = mockLocation(time = now - 120_000, distanceTo = 500f)  // 2 minutes
        setField("lastKnownLocation", prev)

        val location = mockLocation(hasSpeed = false, time = now)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify(exactly = 0) { location.setSpeed(any()) }
    }

    @Test
    fun `applySpeedFallback rejects unreasonable speed`() = testScope.runTest {
        val now = System.currentTimeMillis()
        val prev = mockLocation(time = now - 1000, distanceTo = 500f)  // 500m/s > 278 cap
        setField("lastKnownLocation", prev)

        val location = mockLocation(hasSpeed = false, time = now)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify(exactly = 0) { location.setSpeed(any()) }
    }

    @Test
    fun `applySpeedFallback calculates at exactly 1s boundary`() = testScope.runTest {
        val now = System.currentTimeMillis()
        val prev = mockLocation(time = now - 1000, distanceTo = 10f)  // 10m in 1s = 10 m/s
        setField("lastKnownLocation", prev)

        val location = mockLocation(hasSpeed = false, time = now)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify { location.setSpeed(10.0f) }
    }

    @Test
    fun `applySpeedFallback calculates at exactly 60s boundary`() = testScope.runTest {
        val now = System.currentTimeMillis()
        val prev = mockLocation(time = now - 60_000, distanceTo = 120f)  // 120m in 60s = 2 m/s
        setField("lastKnownLocation", prev)

        val location = mockLocation(hasSpeed = false, time = now)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify { location.setSpeed(2.0f) }
    }

    @Test
    fun `handleLocationUpdate stops service when battery critical during tracking`() = testScope.runTest {
        every { deviceInfoHelper.isBatteryCritical() } returns true
        val location = mockLocation()

        invokeHandleLocationUpdate(location)

        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `handleLocationUpdate starts entry delay when location enters geofence`() = testScope.runTest {
        every { geofenceHelper.getPauseZone(any()) } returns homeGeofence
        val location = mockLocation()
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        // Entry delay pending - not yet inside zone
        assertFalse(getField("insidePauseZone"))
        assertEquals(homeGeofence, getField<GeofenceHelper.Geofence?>("pendingPauseZone"))
        // GPS location is saved during the delay window
        verify { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        // Zone event not sent until delay completes
        verify(exactly = 0) { LocationServiceModule.sendPauseZoneEvent(true, any()) }
    }

    @Test
    fun `handleLocationUpdate skips saving but sends UI event when already inside pause zone`() = testScope.runTest {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        every { geofenceHelper.getPauseZone(any()) } returns homeGeofence
        val location = mockLocation()

        invokeHandleLocationUpdate(location)

        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        verify { LocationServiceModule.sendLocationEvent(location, any(), any()) }
    }

    @Test
    fun `handleLocationUpdate starts entry delay when moving between zones`() = testScope.runTest {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        every { geofenceHelper.getPauseZone(any()) } returns officeGeofence
        val location = mockLocation()
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        // Still in Home until delay fires
        assertTrue(getField("insidePauseZone"))
        assertEquals("Home", getField<String?>("currentZoneName"))
        assertEquals(officeGeofence, getField<GeofenceHelper.Geofence?>("pendingPauseZone"))
    }

    @Test
    fun `handleLocationUpdate exits pause zone and resumes saving`() = testScope.runTest {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        every { geofenceHelper.getPauseZone(any()) } returns null
        val location = mockLocation()
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        assertFalse(getField("insidePauseZone"))
        assertNull(getField<String?>("currentZoneName"))
        verify { LocationServiceModule.sendPauseZoneEvent(false, "Home") }
        // Anchor point + regular GPS location = 2 saves
        verify(atLeast = 2) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `handleLocationUpdate converts timestamp to seconds`() = testScope.runTest {
        val timeMs = 1700000000000L
        val location = mockLocation(time = timeMs)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(),
            timestamp = 1700000000L,
            any()
        ) }
    }

    // =========================================================================
    // setupLocationUpdates - error handling
    // =========================================================================

    @Test
    fun `setupLocationUpdates stops service on SecurityException`() {
        every { locationProvider.requestLocationUpdates(any(), any(), any(), any()) } throws SecurityException("no permission")

        invokeSetupLocationUpdates()

        verify { service.stopSelf() }
    }

    @Test
    fun `setupLocationUpdates stops service on generic Exception`() {
        every { locationProvider.requestLocationUpdates(any(), any(), any(), any()) } throws RuntimeException("provider crashed")

        invokeSetupLocationUpdates()

        verify { service.stopSelf() }
    }

    // =========================================================================
    // Lightweight action handlers
    // =========================================================================

    @Test
    fun `exitPauseZone followed by recheck clears zone when location outside`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Office")
        setField("currentZoneGeofence", officeGeofence)
        val location = mockLocation()
        setField("lastKnownLocation", location)
        every { geofenceHelper.getPauseZone(location) } returns null

        invokeExitPauseZone()
        invokeRecheckZoneWithLocation(location)

        assertFalse(getField("insidePauseZone"))
    }

    @Test
    fun `exitPauseZone followed by recheck starts delay when still in zone`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Office")
        setField("currentZoneGeofence", officeGeofence)
        val location = mockLocation()
        setField("lastKnownLocation", location)
        every { geofenceHelper.getPauseZone(location) } returns officeGeofence

        invokeExitPauseZone()
        invokeRecheckZoneWithLocation(location)

        assertFalse(getField("insidePauseZone"))
        assertEquals(officeGeofence, getField<GeofenceHelper.Geofence?>("pendingPauseZone"))
    }

    @Test
    fun `ACTION_RECHECK_ZONE with fresh location starts entry delay`() {
        val freshLocation = mockLocation(time = System.currentTimeMillis())
        setField("lastKnownLocation", freshLocation)
        every { geofenceHelper.getPauseZone(freshLocation) } returns parkGeofence

        invokeHandleZoneRecheckAction()

        assertFalse(getField("insidePauseZone"))
        assertEquals(parkGeofence, getField<GeofenceHelper.Geofence?>("pendingPauseZone"))
    }

    @Test
    fun `ACTION_RECHECK_ZONE with stale location requests from provider`() {
        val staleLocation = mockLocation(time = System.currentTimeMillis() - 120_000)
        setField("lastKnownLocation", staleLocation)

        invokeHandleZoneRecheckAction()

        verify { locationProvider.getLastLocation(any(), any()) }
    }

    @Test
    fun `ACTION_RECHECK_ZONE with no cached location requests from provider`() {
        setField("lastKnownLocation", null)

        invokeHandleZoneRecheckAction()

        verify { locationProvider.getLastLocation(any(), any()) }
    }

    @Test
    fun `ACTION_RECHECK_ZONE exits zone when provider returns no location`() {
        setField("lastKnownLocation", null)
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)

        every { locationProvider.getLastLocation(any(), any()) } answers {
            val onSuccess = firstArg<(Location?) -> Unit>()
            onSuccess(null)
        }

        invokeHandleZoneRecheckAction()

        assertFalse(getField("insidePauseZone"))
    }

    @Test
    fun `ACTION_RECHECK_ZONE exits zone on provider failure`() {
        setField("lastKnownLocation", null)
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)

        every { locationProvider.getLastLocation(any(), any()) } answers {
            val onFailure = secondArg<(Exception) -> Unit>()
            onFailure(SecurityException("Permission denied"))
        }

        invokeHandleZoneRecheckAction()

        assertFalse(getField("insidePauseZone"))
    }

    @Test
    fun `ACTION_RECHECK_ZONE provider success updates lastKnownLocation`() {
        setField("lastKnownLocation", null)
        val freshLocation = mockLocation(lat = 48.0, lon = 11.0)
        every { geofenceHelper.getPauseZone(freshLocation) } returns null

        every { locationProvider.getLastLocation(any(), any()) } answers {
            val onSuccess = firstArg<(Location?) -> Unit>()
            onSuccess(freshLocation)
        }

        invokeHandleZoneRecheckAction()

        assertEquals(freshLocation, getField<Location?>("lastKnownLocation"))
    }

    // =========================================================================
    // enterPauseZone / exitPauseZone state transitions
    // =========================================================================

    @Test
    fun `enterPauseZone sets state and sends event`() {
        val location = mockLocation()
        setField("lastKnownLocation", location)

        invokeEnterPauseZone(homeGeofence)

        assertTrue(getField("insidePauseZone"))
        assertEquals("Home", getField<String?>("currentZoneName"))
        assertEquals(homeGeofence, getField<GeofenceHelper.Geofence?>("currentZoneGeofence"))
        verify { LocationServiceModule.sendPauseZoneEvent(true, "Home") }
    }

    @Test
    fun `enterPauseZone does not save anchor on entry`() = testScope.runTest {
        val location = mockLocation()
        setField("lastKnownLocation", location)

        invokeEnterPauseZone(homeGeofence)

        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `saveAnchorPoint skips when config not initialized`() = testScope.runTest {
        // Reset config to uninitialized (lateinit backs to null at JVM level)
        setField("config", null)

        invokeSaveAnchorPoint(homeGeofence)

        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        verify { AppLogger.w("LocationService", match { it.contains("Config not yet initialized") }) }
    }

    @Test
    fun `enterPauseZone updates notification with paused status`() {
        val location = mockLocation(lat = 52.0, lon = 13.0)
        setField("lastKnownLocation", location)

        invokeEnterPauseZone(officeGeofence)

        verify { notificationHelper.update(
            lat = 52.0,
            lon = 13.0,
            isPaused = true,
            zoneName = "Office",
            queuedCount = any(),
            lastSyncTime = any(),
            activeProfileName = any(),
            forceUpdate = true
        ) }
    }

    @Test
    fun `enterPauseZone handles null lastKnownLocation`() {
        setField("lastKnownLocation", null)

        invokeEnterPauseZone(homeGeofence)

        verify { notificationHelper.update(
            lat = null,
            lon = null,
            isPaused = true,
            zoneName = "Home",
            queuedCount = any(),
            lastSyncTime = any(),
            activeProfileName = any(),
            forceUpdate = true
        ) }
    }

    @Test
    fun `exitPauseZone clears state and sends event`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)

        invokeExitPauseZone()

        assertFalse(getField("insidePauseZone"))
        assertNull(getField<String?>("currentZoneName"))
        assertNull(getField<GeofenceHelper.Geofence?>("currentZoneGeofence"))
        verify { LocationServiceModule.sendPauseZoneEvent(false, "Home") }
    }

    @Test
    fun `exitPauseZone saves anchor point from stored geofence`() = testScope.runTest {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)

        invokeExitPauseZone()

        verify { dbHelper.saveLocation(
            latitude = homeGeofence.lat,
            longitude = homeGeofence.lon,
            accuracy = 0.0,
            altitude = null,
            speed = null,
            bearing = null,
            battery = 80,
            battery_status = 2,
            timestamp = any(),
            endpoint = "https://example.com"
        ) }
    }

    @Test
    fun `anchor point timestamp is 1s before lastKnownLocation`() = testScope.runTest {
        val location = mockLocation(lat = 52.1, lon = 13.1)
        every { location.time } returns 1774863384000L // 09:36:24

        setField("lastKnownLocation", location)
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)

        invokeExitPauseZone()

        val expectedTimestamp = (1774863384000L - 1000L) / 1000L
        verify { dbHelper.saveLocation(
            latitude = homeGeofence.lat,
            longitude = homeGeofence.lon,
            accuracy = 0.0,
            altitude = null,
            speed = null,
            bearing = null,
            battery = 80,
            battery_status = 2,
            timestamp = expectedTimestamp,
            endpoint = "https://example.com"
        ) }
    }

    @Test
    fun `exitPauseZone skips anchor when no stored geofence`() = testScope.runTest {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", null)

        invokeExitPauseZone()

        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `exitPauseZone updates notification without paused status`() {
        val location = mockLocation(lat = 52.0, lon = 13.0)
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        setField("lastKnownLocation", location)

        invokeExitPauseZone()

        verify { notificationHelper.update(
            lat = 52.0,
            lon = 13.0,
            isPaused = false,
            zoneName = null,
            queuedCount = any(),
            lastSyncTime = any(),
            activeProfileName = any(),
            forceUpdate = true
        ) }
    }

    @Test
    fun `zone transition enter then exit restores clean state`() {
        invokeEnterPauseZone(homeGeofence)
        assertTrue(getField("insidePauseZone"))

        invokeExitPauseZone()
        assertFalse(getField("insidePauseZone"))
        assertNull(getField<String?>("currentZoneName"))
        assertNull(getField<GeofenceHelper.Geofence?>("currentZoneGeofence"))
    }

    @Test
    fun `zone change from one zone to another updates name`() {
        invokeEnterPauseZone(homeGeofence)
        assertEquals("Home", getField<String?>("currentZoneName"))

        invokeEnterPauseZone(officeGeofence)
        assertEquals("Office", getField<String?>("currentZoneName"))
        assertTrue(getField("insidePauseZone"))
    }

    @Test
    fun `enterPauseZone never saves anchor on zone entry`() = testScope.runTest {
        val location = mockLocation()
        setField("lastKnownLocation", location)

        invokeEnterPauseZone(homeGeofence)
        invokeEnterPauseZone(officeGeofence)

        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    // =========================================================================
    // recheckZoneWithLocation - zone recheck state machine
    // =========================================================================

    @Test
    fun `recheckZone starts entry delay when not currently in zone`() {
        setField("insidePauseZone", false)
        val location = mockLocation()
        every { geofenceHelper.getPauseZone(location) } returns parkGeofence

        invokeRecheckZoneWithLocation(location)

        assertFalse(getField("insidePauseZone"))
        assertEquals(parkGeofence, getField<GeofenceHelper.Geofence?>("pendingPauseZone"))
    }

    @Test
    fun `recheckZone exits zone when location leaves geofence`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        val location = mockLocation()
        every { geofenceHelper.getPauseZone(location) } returns null

        invokeRecheckZoneWithLocation(location)

        assertFalse(getField("insidePauseZone"))
    }

    @Test
    fun `recheckZone starts entry delay when moving between zones`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        val location = mockLocation()
        every { geofenceHelper.getPauseZone(location) } returns officeGeofence

        invokeRecheckZoneWithLocation(location)

        // Still in Home until delay fires
        assertTrue(getField("insidePauseZone"))
        assertEquals("Home", getField<String?>("currentZoneName"))
        assertEquals(officeGeofence, getField<GeofenceHelper.Geofence?>("pendingPauseZone"))
    }

    @Test
    fun `recheckZone zone-to-zone transition starts delay for new zone`() = testScope.runTest {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        val location = mockLocation()
        every { geofenceHelper.getPauseZone(location) } returns officeGeofence

        clearMocks(dbHelper, answers = false)

        invokeRecheckZoneWithLocation(location)

        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        // Still in Home - delay pending for Office
        assertEquals("Home", getField<String?>("currentZoneName"))
        assertEquals(officeGeofence, getField<GeofenceHelper.Geofence?>("pendingPauseZone"))
    }

    @Test
    fun `recheckZone updates notification when staying in same zone`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        val location = mockLocation(lat = 52.0, lon = 13.0)
        every { geofenceHelper.getPauseZone(location) } returns homeGeofence

        invokeRecheckZoneWithLocation(location)

        verify { notificationHelper.update(
            lat = 52.0,
            lon = 13.0,
            isPaused = true,
            zoneName = "Home",
            queuedCount = any(),
            lastSyncTime = any(),
            activeProfileName = any(),
            forceUpdate = true
        ) }
        verify { LocationServiceModule.sendPauseZoneEvent(true, "Home", null) }
    }

    @Test
    fun `recheckZone sends wifi pause reason when wifi paused in same zone`() {
        val wifiGeofence = geofence("Home", 52.50, 13.40, 150.0, pauseOnWifi = true)
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", wifiGeofence)
        setField("isWifiPaused", true)
        setField("wifiCallback", mockk<android.net.ConnectivityManager.NetworkCallback>(relaxed = true))
        val location = mockLocation(lat = 52.0, lon = 13.0)
        every { geofenceHelper.getPauseZone(location) } returns wifiGeofence

        invokeRecheckZoneWithLocation(location)

        verify { LocationServiceModule.sendPauseZoneEvent(true, "Home", "wifi") }
    }

    @Test
    fun `recheckZone sends motionless pause reason when motionless paused in same zone`() {
        val motionlessGeofence = geofence("Home", 52.50, 13.40, 150.0, pauseOnMotionless = true)
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", motionlessGeofence)
        setField("isMotionlessPaused", true)
        val location = mockLocation(lat = 52.0, lon = 13.0)
        every { geofenceHelper.getPauseZone(location) } returns motionlessGeofence

        invokeRecheckZoneWithLocation(location)

        verify { LocationServiceModule.sendPauseZoneEvent(true, "Home", "motionless") }
    }

    @Test
    fun `recheckZone sends wifi reason when both wifi and motionless paused`() {
        val bothGeofence = geofence("Home", 52.50, 13.40, 150.0, pauseOnWifi = true, pauseOnMotionless = true)
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", bothGeofence)
        setField("isWifiPaused", true)
        setField("isMotionlessPaused", true)
        setField("wifiCallback", mockk<android.net.ConnectivityManager.NetworkCallback>(relaxed = true))
        val location = mockLocation(lat = 52.0, lon = 13.0)
        every { geofenceHelper.getPauseZone(location) } returns bothGeofence

        invokeRecheckZoneWithLocation(location)

        verify { LocationServiceModule.sendPauseZoneEvent(true, "Home", "wifi") }
    }

    @Test
    fun `recheckZone updates notification when not in any zone`() {
        setField("insidePauseZone", false)
        val location = mockLocation(lat = 52.0, lon = 13.0)
        every { geofenceHelper.getPauseZone(location) } returns null

        invokeRecheckZoneWithLocation(location)

        verify { notificationHelper.update(
            lat = 52.0,
            lon = 13.0,
            isPaused = false,
            zoneName = null,
            queuedCount = any(),
            lastSyncTime = any(),
            activeProfileName = any(),
            forceUpdate = true
        ) }
    }

    // =========================================================================
    // startEntryDelay / cancelEntryDelay
    // =========================================================================

    @Test
    fun `startEntryDelay sets pendingPauseZone without entering zone`() {
        invokeStartEntryDelay(homeGeofence)

        assertFalse(getField("insidePauseZone"))
        assertEquals(homeGeofence, getField<GeofenceHelper.Geofence?>("pendingPauseZone"))
        assertNotNull(getField<Job?>("entryDelayJob"))
    }

    @Test
    fun `startEntryDelay enters zone after delay completes`() = testScope.runTest {
        invokeStartEntryDelay(homeGeofence)

        assertFalse(getField("insidePauseZone"))

        advanceTimeBy((5000L * 3.5 + 1).toLong())

        assertTrue(getField("insidePauseZone"))
        assertEquals("Home", getField<String?>("currentZoneName"))
        assertNull(getField<GeofenceHelper.Geofence?>("pendingPauseZone"))
        verify { LocationServiceModule.sendPauseZoneEvent(true, "Home") }
    }

    @Test
    fun `startEntryDelay does not enter zone if pendingPauseZone cleared before timer fires`() = testScope.runTest {
        invokeStartEntryDelay(homeGeofence)
        setField("pendingPauseZone", null)

        advanceTimeBy((5000L * 3.5 + 1).toLong())

        assertFalse(getField("insidePauseZone"))
        verify(exactly = 0) { LocationServiceModule.sendPauseZoneEvent(true, any()) }
    }

    @Test
    fun `startEntryDelay cancels previous delay when called again`() {
        invokeStartEntryDelay(homeGeofence)
        val firstJob: Job? = getField("entryDelayJob")

        invokeStartEntryDelay(officeGeofence)

        assertTrue(firstJob?.isCancelled == true)
        assertEquals(officeGeofence, getField<GeofenceHelper.Geofence?>("pendingPauseZone"))
    }

    @Test
    fun `cancelEntryDelay clears pendingPauseZone and job`() {
        invokeStartEntryDelay(homeGeofence)

        invokeCancelEntryDelay()

        assertNull(getField<GeofenceHelper.Geofence?>("pendingPauseZone"))
        assertNull(getField<Job?>("entryDelayJob"))
    }

    @Test
    fun `cancelEntryDelay updates notification`() {
        invokeStartEntryDelay(homeGeofence)
        val loc = mockLocation(lat = 52.0, lon = 13.0)
        setField("lastKnownLocation", loc)

        invokeCancelEntryDelay()

        verify { notificationHelper.update(
            lat = 52.0,
            lon = 13.0,
            isPaused = false,
            zoneName = null,
            queuedCount = any(),
            lastSyncTime = any(),
            activeProfileName = any(),
            forceUpdate = true
        ) }
    }

    @Test
    fun `handleLocationUpdate cancels delay when leaving zone mid-delay`() = testScope.runTest {
        setField("pendingPauseZone", homeGeofence)
        val mockJob = mockk<Job>(relaxed = true)
        setField("entryDelayJob", mockJob)
        every { geofenceHelper.getPauseZone(any()) } returns null
        val location = mockLocation()
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify { mockJob.cancel() }
        assertNull(getField<GeofenceHelper.Geofence?>("pendingPauseZone"))
    }

    @Test
    fun `handleLocationUpdate bypasses distance filter during entry delay`() = testScope.runTest {
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            interval = 5000L,
            minUpdateDistance = 50f,
            filterInaccurateLocations = false
        ))
        val prev = mockLocation(distanceTo = 10f)
        setField("lastKnownLocation", prev)
        setField("pendingPauseZone", homeGeofence)
        every { geofenceHelper.getPauseZone(any()) } returns homeGeofence
        val location = mockLocation(distanceTo = 10f)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    // =========================================================================
    // applyProfileConfig - dynamic config switching
    // =========================================================================

    @Test
    fun `applyProfileConfig updates service config`() {
        invokeApplyProfileConfig(interval = 2000L, distance = 10f, syncInterval = 60)

        val config = getField<ServiceConfig>("config")
        assertEquals(2000L, config.interval)
        assertEquals(10f, config.minUpdateDistance)
        assertEquals(60, config.syncIntervalSeconds)
    }

    @Test
    fun `applyProfileConfig preserves non-profile config fields`() {
        setField("config", ServiceConfig(
            endpoint = "https://my-server.com",
            interval = 5000L,
            minUpdateDistance = 0f,
            accuracyThreshold = 100f,
            filterInaccurateLocations = true,
            httpMethod = "GET"
        ))

        invokeApplyProfileConfig(interval = 2000L, distance = 5f, syncInterval = 30)

        val config = getField<ServiceConfig>("config")
        assertEquals("https://my-server.com", config.endpoint)
        assertEquals(100f, config.accuracyThreshold)
        assertTrue(config.filterInaccurateLocations)
        assertEquals("GET", config.httpMethod)
    }

    @Test
    fun `applyProfileConfig updates sync manager with new config`() {
        every { secureStorage.getAuthHeaders() } returns mapOf("Authorization" to "Bearer token")
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            retryIntervalSeconds = 60,
            isOfflineMode = true,
            syncCondition = "wifi_any",
            syncSsid = "",
            httpMethod = "GET"
        ))

        invokeApplyProfileConfig(interval = 2000L, distance = 5f, syncInterval = 30)

        verify { syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 30,
            retryIntervalSeconds = 60,
            isOfflineMode = true,
            syncCondition = "wifi_any",
            syncSsid = "",
            authHeaders = mapOf("Authorization" to "Bearer token"),
            httpMethod = "GET"
        ) }
    }

    @Test
    fun `applyProfileConfig restarts location updates`() = runServiceTest {
        val oldCallback = mockk<LocationUpdateCallback>(relaxed = true)
        setField("locationUpdateCallback", oldCallback)

        invokeApplyProfileConfig(interval = 2000L, distance = 5f, syncInterval = 30)

        verify { locationProvider.removeLocationUpdates(oldCallback) }
        verify { locationProvider.requestLocationUpdates(2000L, 5f, any(), any()) }
    }

    @Test
    fun `applyProfileConfig forces notification update`() {
        invokeApplyProfileConfig(interval = 2000L, distance = 5f, syncInterval = 30)

        verify { notificationHelper.update(any(), any(), any(), any(), any(), any(), any(), forceUpdate = true) }
    }

    @Test
    fun `applyProfileConfig cancels pending entry delay`() {
        val mockJob = mockk<Job>(relaxed = true)
        setField("entryDelayJob", mockJob)
        setField("pendingPauseZone", homeGeofence)

        invokeApplyProfileConfig(interval = 2000L, distance = 5f, syncInterval = 30)

        verify { mockJob.cancel() }
        assertNull(getField<GeofenceHelper.Geofence?>("pendingPauseZone"))
    }

    @Test
    fun `applyProfileConfig cancels pending locationRestartJob`() {
        val mockJob = mockk<Job>(relaxed = true)
        setField("locationRestartJob", mockJob)

        invokeApplyProfileConfig(interval = 2000L, distance = 5f, syncInterval = 30)

        verify { mockJob.cancel() }
        assertNull(getField<Job?>("locationRestartJob"))
    }

    // =========================================================================
    // OS-level distance filter bypass for location-dependent profiles
    // =========================================================================

    @Test
    fun `setupLocationUpdates passes configured distance when no location-dependent profile enabled`() {
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            interval = 5000L,
            minUpdateDistance = 50f,
            filterInaccurateLocations = false
        ))
        every { profileManager.getNeededConditionTypes() } returns setOf(ProfileConstants.CONDITION_CHARGING)

        invokeSetupLocationUpdates()

        verify { locationProvider.requestLocationUpdates(5000L, 50f, any(), any()) }
        assertFalse(getField("lastRequestedBypassOsFilter"))
    }

    @Test
    fun `setupLocationUpdates passes zero when a speed_above profile is enabled`() {
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            interval = 5000L,
            minUpdateDistance = 50f,
            filterInaccurateLocations = false
        ))
        every { profileManager.getNeededConditionTypes() } returns setOf(ProfileConstants.CONDITION_SPEED_ABOVE)

        invokeSetupLocationUpdates()

        verify { locationProvider.requestLocationUpdates(5000L, 0f, any(), any()) }
        assertTrue(getField("lastRequestedBypassOsFilter"))
    }

    @Test
    fun `setupLocationUpdates passes zero when a speed_below profile is enabled`() {
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            interval = 5000L,
            minUpdateDistance = 50f,
            filterInaccurateLocations = false
        ))
        every { profileManager.getNeededConditionTypes() } returns setOf(ProfileConstants.CONDITION_SPEED_BELOW)

        invokeSetupLocationUpdates()

        verify { locationProvider.requestLocationUpdates(5000L, 0f, any(), any()) }
    }

    @Test
    fun `setupLocationUpdates passes zero when a stationary profile is enabled`() {
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            interval = 5000L,
            minUpdateDistance = 50f,
            filterInaccurateLocations = false
        ))
        every { profileManager.getNeededConditionTypes() } returns setOf(ProfileConstants.CONDITION_STATIONARY)

        invokeSetupLocationUpdates()

        verify { locationProvider.requestLocationUpdates(5000L, 0f, any(), any()) }
    }

    @Test
    fun `handleRecheckProfiles restarts updates when effective OS filter flips to bypassed`() = runServiceTest {
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            interval = 5000L,
            minUpdateDistance = 50f,
            filterInaccurateLocations = false
        ))
        val existingCallback = mockk<LocationUpdateCallback>(relaxed = true)
        setField("locationUpdateCallback", existingCallback)
        setField("lastRequestedBypassOsFilter", false)
        every { profileManager.getNeededConditionTypes() } returns setOf(ProfileConstants.CONDITION_SPEED_ABOVE)

        invokeHandleRecheckProfiles()

        verify { locationProvider.removeLocationUpdates(existingCallback) }
        verify { locationProvider.requestLocationUpdates(5000L, 0f, any(), any()) }
    }

    @Test
    fun `handleRecheckProfiles does not restart when effective OS filter unchanged`() {
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            interval = 5000L,
            minUpdateDistance = 50f,
            filterInaccurateLocations = false
        ))
        val existingCallback = mockk<LocationUpdateCallback>(relaxed = true)
        setField("locationUpdateCallback", existingCallback)
        setField("lastRequestedBypassOsFilter", false)
        every { profileManager.getNeededConditionTypes() } returns setOf(ProfileConstants.CONDITION_CHARGING)

        invokeHandleRecheckProfiles()

        verify(exactly = 0) { locationProvider.removeLocationUpdates(any()) }
        verify(exactly = 0) { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `handleRecheckProfiles does not restart when not tracking`() {
        setField("locationUpdateCallback", null)
        setField("lastRequestedBypassOsFilter", false)
        every { profileManager.getNeededConditionTypes() } returns setOf(ProfileConstants.CONDITION_SPEED_ABOVE)

        invokeHandleRecheckProfiles()

        verify(exactly = 0) { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    // =========================================================================
    // onDestroy - cleanup
    // =========================================================================

    @Test
    fun `onDestroy stops condition monitor`() {
        invokeOnDestroy()

        verify { conditionMonitor.stop() }
    }

    @Test
    fun `onDestroy removes location updates`() {
        val callback = mockk<LocationUpdateCallback>(relaxed = true)
        setField("locationUpdateCallback", callback)

        invokeOnDestroy()

        verify { locationProvider.removeLocationUpdates(callback) }
    }

    @Test
    fun `onDestroy stops periodic sync`() {
        invokeOnDestroy()

        verify { syncManager.stopPeriodicSync() }
    }

    @Test
    fun `onDestroy cancels service scope`() {
        val scope = getField<CoroutineScope?>("serviceScope")
        assertNotNull(scope)

        invokeOnDestroy()

        assertNull(getField<CoroutineScope?>("serviceScope"))
    }

    @Test
    fun `onDestroy cancels entry delay job`() {
        val mockJob = mockk<Job>(relaxed = true)
        setField("entryDelayJob", mockJob)
        setField("pendingPauseZone", homeGeofence)

        invokeOnDestroy()

        verify { mockJob.cancel() }
        assertNull(getField<GeofenceHelper.Geofence?>("pendingPauseZone"))
    }

    @Test
    fun `onDestroy handles null location callback gracefully`() {
        setField("locationUpdateCallback", null)

        invokeOnDestroy()

        verify(exactly = 0) { locationProvider.removeLocationUpdates(any()) }
    }

    @Test
    fun `onDestroy order is monitor then location then sync then scope`() {
        val order = mutableListOf<String>()

        every { conditionMonitor.stop() } answers { order.add("conditionMonitor.stop") }
        every { locationProvider.removeLocationUpdates(any()) } answers { order.add("locationProvider.remove") }
        every { syncManager.stopPeriodicSync() } answers { order.add("syncManager.stop") }

        val callback = mockk<LocationUpdateCallback>(relaxed = true)
        setField("locationUpdateCallback", callback)

        invokeOnDestroy()

        assertEquals("conditionMonitor.stop", order[0])
        assertEquals("locationProvider.remove", order[1])
        assertEquals("syncManager.stop", order[2])
    }

    // =========================================================================
    // stopForegroundServiceWithReason - battery critical path
    // =========================================================================

    @Test
    fun `stopForBattery clears active profile event`() = testScope.runTest {
        every { profileManager.getActiveProfileName() } returns "Charging"
        every { deviceInfoHelper.isBatteryCritical() } returns true
        val location = mockLocation()

        invokeHandleLocationUpdate(location)

        verify { LocationServiceModule.sendProfileSwitchEvent(null, null) }
    }

    @Test
    fun `stopForBattery sends tracking stopped event`() = testScope.runTest {
        every { deviceInfoHelper.isBatteryCritical() } returns true
        val location = mockLocation()

        invokeHandleLocationUpdate(location)

        verify { LocationServiceModule.sendTrackingStoppedEvent("Battery below 5% - tracking paused") }
    }

    @Test
    fun `stopForBattery saves tracking_enabled false`() = testScope.runTest {
        every { deviceInfoHelper.isBatteryCritical() } returns true
        val location = mockLocation()

        invokeHandleLocationUpdate(location)

        verify { dbHelper.saveSetting("tracking_enabled", "false") }
    }

    @Test
    fun `stopForBattery does not send profile event when no active profile`() = testScope.runTest {
        every { profileManager.getActiveProfileName() } returns null
        every { deviceInfoHelper.isBatteryCritical() } returns true
        val location = mockLocation()

        invokeHandleLocationUpdate(location)

        verify(exactly = 0) { LocationServiceModule.sendProfileSwitchEvent(any(), any()) }
    }

    // =========================================================================
    // enterPauseZone - pause flag registration
    // =========================================================================

    @Test
    fun `enterPauseZone with pauseOnWifi registers wifi callback`() {
        val wifiGeofence = geofence("Home", 52.50, 13.40, 150.0, pauseOnWifi = true)
        coEvery { service["registerWifiPause"]() } returns Unit

        invokeEnterPauseZone(wifiGeofence)

        verify { service["registerWifiPause"]() }
    }

    @Test
    fun `enterPauseZone without pauseOnWifi skips wifi callback`() {
        coEvery { service["registerWifiPause"]() } returns Unit

        invokeEnterPauseZone(homeGeofence)

        verify(exactly = 0) { service["registerWifiPause"]() }
    }

    @Test
    fun `enterPauseZone with pauseOnMotionless starts motion detector`() {
        val motionlessGeofence = geofence("Home", 52.50, 13.40, 150.0, pauseOnMotionless = true)
        val detector = mockk<MotionStateDetector>(relaxed = true)
        setField("motionDetector", detector)

        invokeEnterPauseZone(motionlessGeofence)

        verify { detector.start(any()) }
    }

    @Test
    fun `enterPauseZone without pauseOnMotionless does not start motion detector`() {
        val detector = mockk<MotionStateDetector>(relaxed = true)
        setField("motionDetector", detector)
        every { profileManager.isStationary } returns false

        invokeEnterPauseZone(homeGeofence)

        verify(exactly = 0) { detector.start(any()) }
    }

    // =========================================================================
    // exitPauseZone - pause state cleanup
    // =========================================================================

    @Test
    fun `exitPauseZone saves pause_zone_motionless_active false`() {
        setField("insidePauseZone", true)
        setField("currentZoneGeofence", homeGeofence)

        invokeExitPauseZone()

        verify { dbHelper.saveSetting("pause_zone_motionless_active", "false") }
    }

    @Test
    fun `exitPauseZone with isWifiPaused resumes GPS`() {
        setField("insidePauseZone", true)
        setField("currentZoneGeofence", homeGeofence)
        setField("isWifiPaused", true)

        invokeExitPauseZone()

        verify { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `exitPauseZone with isMotionlessPaused resumes GPS`() {
        setField("insidePauseZone", true)
        setField("currentZoneGeofence", homeGeofence)
        setField("isMotionlessPaused", true)

        invokeExitPauseZone()

        verify { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `exitPauseZone without pause holds does not resume GPS`() {
        setField("insidePauseZone", true)
        setField("currentZoneGeofence", homeGeofence)
        setField("isWifiPaused", false)
        setField("isMotionlessPaused", false)

        invokeExitPauseZone()

        verify(exactly = 0) { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    // =========================================================================
    // onMotionStateChange - STATIONARY (motionless pause entry)
    // =========================================================================

    @Test
    fun `onMotionStateChange STATIONARY pauses GPS when in pauseOnMotionless zone`() = runServiceTest {
        val motionlessGeofence = geofence("Home", 52.50, 13.40, 150.0, pauseOnMotionless = true)
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", motionlessGeofence)
        setField("isMotionlessPaused", false)

        invokeOnMotionStateChange(MotionState.STATIONARY)

        assertTrue(getField<Boolean>("isMotionlessPaused"))
        verify { dbHelper.saveSetting("pause_zone_motionless_active", "true") }
        verify { LocationServiceModule.sendPauseZoneEvent(true, "Home", "motionless") }
    }

    @Test
    fun `onMotionStateChange STATIONARY ignored when zone has no motionless setting`() = runServiceTest {
        setField("insidePauseZone", true)
        setField("currentZoneGeofence", homeGeofence) // pauseOnMotionless=false

        invokeOnMotionStateChange(MotionState.STATIONARY)

        assertFalse(getField<Boolean>("isMotionlessPaused"))
        verify(exactly = 0) { dbHelper.saveSetting("pause_zone_motionless_active", "true") }
    }

    @Test
    fun `onMotionStateChange STATIONARY ignored when already motionless paused`() = runServiceTest {
        val motionlessGeofence = geofence("Home", 52.50, 13.40, 150.0, pauseOnMotionless = true)
        setField("insidePauseZone", true)
        setField("currentZoneGeofence", motionlessGeofence)
        setField("isMotionlessPaused", true)

        invokeOnMotionStateChange(MotionState.STATIONARY)

        verify(exactly = 0) { dbHelper.saveSetting("pause_zone_motionless_active", "true") }
    }

    @Test
    fun `onMotionStateChange STATIONARY ignored when not inside any pause zone`() = runServiceTest {
        setField("insidePauseZone", false)
        setField("currentZoneGeofence", null)

        invokeOnMotionStateChange(MotionState.STATIONARY)

        assertFalse(getField<Boolean>("isMotionlessPaused"))
    }

    // =========================================================================
    // onMotionStateChange - MOVING (motionless pause exit + profile notify)
    // =========================================================================

    @Test
    fun `onMotionStateChange MOVING clears motionless pause and resumes GPS`() = runServiceTest {
        val motionlessGeofence = geofence("Home", 52.50, 13.40, 150.0, pauseOnMotionless = true)
        val detector = mockk<MotionStateDetector>(relaxed = true)
        setField("motionDetector", detector)
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", motionlessGeofence)
        setField("isMotionlessPaused", true)

        invokeOnMotionStateChange(MotionState.MOVING)

        assertFalse(getField<Boolean>("isMotionlessPaused"))
        verify { dbHelper.saveSetting("pause_zone_motionless_active", "false") }
        verify { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `onMotionStateChange MOVING does not resume GPS when wifi hold still active`() = runServiceTest {
        val bothGeofence = geofence("Home", 52.50, 13.40, 150.0, pauseOnWifi = true, pauseOnMotionless = true)
        val detector = mockk<MotionStateDetector>(relaxed = true)
        setField("motionDetector", detector)
        setField("insidePauseZone", true)
        setField("currentZoneGeofence", bothGeofence)
        setField("isMotionlessPaused", true)
        setField("isWifiPaused", true)

        invokeOnMotionStateChange(MotionState.MOVING)

        assertFalse(getField<Boolean>("isMotionlessPaused"))
        verify(exactly = 0) { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `onMotionStateChange MOVING notifies profile manager`() = runServiceTest {
        val detector = mockk<MotionStateDetector>(relaxed = true)
        setField("motionDetector", detector)
        setField("isMotionlessPaused", false)

        invokeOnMotionStateChange(MotionState.MOVING)

        verify { profileManager.onMotionDetected() }
    }

    // =========================================================================
    // ensureMotionDetectorRunning - lifecycle
    // =========================================================================

    @Test
    fun `ensureMotionDetectorRunning starts detector when in pauseOnMotionless zone`() {
        val detector = mockk<MotionStateDetector>(relaxed = true)
        setField("motionDetector", detector)
        setField("insidePauseZone", true)
        setField("currentZoneGeofence", geofence("Home", 52.50, 13.40, 150.0, pauseOnMotionless = true))
        every { profileManager.isStationary } returns false

        invokeEnsureMotionDetectorRunning()

        verify { detector.start(any()) }
    }

    @Test
    fun `ensureMotionDetectorRunning starts detector when profile is stationary`() {
        val detector = mockk<MotionStateDetector>(relaxed = true)
        setField("motionDetector", detector)
        setField("insidePauseZone", false)
        every { profileManager.isStationary } returns true

        invokeEnsureMotionDetectorRunning()

        verify { detector.start(any()) }
    }

    @Test
    fun `ensureMotionDetectorRunning stops detector when neither condition holds`() {
        val detector = mockk<MotionStateDetector>(relaxed = true)
        setField("motionDetector", detector)
        setField("insidePauseZone", false)
        setField("currentZoneGeofence", null)
        every { profileManager.isStationary } returns false

        invokeEnsureMotionDetectorRunning()

        verify { detector.stop() }
    }

    // =========================================================================
    // maybeResumeGps - dual hold logic
    // =========================================================================

    @Test
    fun `maybeResumeGps resumes GPS when no holds active`() = runServiceTest {
        setField("currentZoneGeofence", geofence("Home", 52.50, 13.40, 150.0, pauseOnWifi = true, pauseOnMotionless = true))
        setField("isWifiPaused", false)
        setField("isMotionlessPaused", false)

        invokeMaybeResumeGps()

        verify { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `maybeResumeGps blocked when wifi hold active`() = testScope.runTest {
        setField("currentZoneGeofence", geofence("Home", 52.50, 13.40, 150.0, pauseOnWifi = true))
        setField("isWifiPaused", true)
        setField("isMotionlessPaused", false)

        invokeMaybeResumeGps()

        verify(exactly = 0) { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `maybeResumeGps blocked when motionless hold active`() = testScope.runTest {
        setField("currentZoneGeofence", geofence("Home", 52.50, 13.40, 150.0, pauseOnMotionless = true))
        setField("isWifiPaused", false)
        setField("isMotionlessPaused", true)

        invokeMaybeResumeGps()

        verify(exactly = 0) { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `maybeResumeGps resumes when currentZoneGeofence is null`() = runServiceTest {
        setField("currentZoneGeofence", null)

        invokeMaybeResumeGps()

        verify { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    // =========================================================================
    // applyZoneSettingsIfChanged
    // =========================================================================

    @Test
    fun `applyZoneSettingsIfChanged enables wifi callback when pauseOnWifi toggled on`() {
        setField("currentZoneGeofence", homeGeofence) // pauseOnWifi=false
        coEvery { service["registerWifiPause"]() } returns Unit
        val updatedGeofence = geofence("Home", 52.50, 13.40, 150.0, pauseOnWifi = true)

        invokeApplyZoneSettingsIfChanged(updatedGeofence)

        verify { service["registerWifiPause"]() }
    }

    @Test
    fun `applyZoneSettingsIfChanged disables wifi hold and resumes GPS`() {
        val wifiGeofence = geofence("Home", 52.50, 13.40, 150.0, pauseOnWifi = true)
        setField("currentZoneGeofence", wifiGeofence)
        setField("isWifiPaused", true)

        invokeApplyZoneSettingsIfChanged(homeGeofence) // pauseOnWifi=false

        assertFalse(getField<Boolean>("isWifiPaused"))
        verify { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `applyZoneSettingsIfChanged disables motionless hold and resumes GPS`() {
        val motionlessGeofence = geofence("Home", 52.50, 13.40, 150.0, pauseOnMotionless = true)
        val detector = mockk<MotionStateDetector>(relaxed = true)
        setField("motionDetector", detector)
        setField("currentZoneGeofence", motionlessGeofence)
        setField("isMotionlessPaused", true)

        invokeApplyZoneSettingsIfChanged(homeGeofence) // pauseOnMotionless=false

        assertFalse(getField<Boolean>("isMotionlessPaused"))
        verify { dbHelper.saveSetting("pause_zone_motionless_active", "false") }
        verify { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `applyZoneSettingsIfChanged starts motion detector when pauseOnMotionless toggled on`() {
        val detector = mockk<MotionStateDetector>(relaxed = true)
        setField("motionDetector", detector)
        setField("insidePauseZone", true)
        setField("currentZoneGeofence", homeGeofence) // pauseOnMotionless=false
        every { profileManager.isStationary } returns false
        val updatedGeofence = geofence("Home", 52.50, 13.40, 150.0, pauseOnMotionless = true)

        invokeApplyZoneSettingsIfChanged(updatedGeofence)

        verify { detector.start(any()) }
    }

    // =========================================================================
    // Helpers - invoke private methods via reflection
    // =========================================================================

    private fun invokeHandleLocationUpdate(location: Location) {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "handleLocationUpdate", Location::class.java
        )
        method.isAccessible = true
        method.invoke(service, location)
    }

    private fun invokeEnterPauseZone(geofence: GeofenceHelper.Geofence) {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "enterPauseZone", GeofenceHelper.Geofence::class.java
        )
        method.isAccessible = true
        method.invoke(service, geofence)
    }

    private fun invokeExitPauseZone() {
        val method = LocationForegroundService::class.java.getDeclaredMethod("exitPauseZone")
        method.isAccessible = true
        method.invoke(service)
    }

    private fun invokeRecheckZoneWithLocation(location: Location) {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "recheckZoneWithLocation", Location::class.java
        )
        method.isAccessible = true
        method.invoke(service, location)
    }

    private fun invokeApplyProfileConfig(interval: Long, distance: Float, syncInterval: Int) {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "applyProfileConfig", Long::class.java, Float::class.java, Int::class.java
        )
        method.isAccessible = true
        method.invoke(service, interval, distance, syncInterval)
    }

    private fun invokeOnDestroy() {
        val method = LocationForegroundService::class.java.getDeclaredMethod("onDestroy")
        method.isAccessible = true
        method.invoke(service)
    }

    private fun invokeHandleZoneRecheckAction() {
        val method = LocationForegroundService::class.java
            .getDeclaredMethod("handleZoneRecheckAction")
        method.isAccessible = true
        method.invoke(service)
    }

    private fun invokeSetupLocationUpdates() {
        val method = LocationForegroundService::class.java
            .getDeclaredMethod("setupLocationUpdates")
        method.isAccessible = true
        method.invoke(service)
    }

    private fun invokeHandleRecheckProfiles() {
        val method = LocationForegroundService::class.java
            .getDeclaredMethod("handleRecheckProfiles")
        method.isAccessible = true
        method.invoke(service)
    }

    private fun invokeSaveAnchorPoint(geofence: GeofenceHelper.Geofence) {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "saveAnchorPoint", GeofenceHelper.Geofence::class.java
        )
        method.isAccessible = true
        method.invoke(service, geofence)
    }

    // =========================================================================
    // Entry delay calculation
    // =========================================================================

    @Test
    fun `entry delay uses 3_5x tracking interval`() = testScope.runTest {
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            interval = 10000L,
            filterInaccurateLocations = false
        ))

        invokeStartEntryDelay(homeGeofence)

        // At 3.5x 10000ms = 35000ms, zone should not be entered yet
        advanceTimeBy(34999L)
        assertFalse(getField("insidePauseZone"))

        // At 35001ms, zone should be entered
        advanceTimeBy(2L)
        assertTrue(getField("insidePauseZone"))
    }

    // =========================================================================
    // WiFi pause restore on service restart
    // =========================================================================

    @Test
    fun `setupLocationUpdates skips GPS when isWifiPaused is true`() {
        setField("isWifiPaused", true)

        invokeSetupLocationUpdates()

        verify(exactly = 0) { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `setupLocationUpdates starts GPS when inside zone but neither wifi nor motionless paused`() {
        setField("insidePauseZone", true)
        setField("isWifiPaused", false)
        setField("isMotionlessPaused", false)

        invokeSetupLocationUpdates()

        verify { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    // =========================================================================
    // WiFi pause event reason
    // =========================================================================

    @Test
    fun `enterPauseZone with both WiFi and motionless registers both`() {
        val dualGeofence = geofence("Home", 52.50, 13.40, 150.0, pauseOnWifi = true, pauseOnMotionless = true)
        val detector = mockk<MotionStateDetector>(relaxed = true)
        setField("motionDetector", detector)
        coEvery { service["registerWifiPause"]() } returns Unit

        invokeEnterPauseZone(dualGeofence)

        verify { service["registerWifiPause"]() }
        verify { detector.start(any()) }
    }

    @Test
    fun `exitPauseZone clears both WiFi and motionless state`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", geofence("Home", 52.50, 13.40, 150.0, pauseOnWifi = true, pauseOnMotionless = true))
        setField("isWifiPaused", true)
        setField("isMotionlessPaused", true)

        invokeExitPauseZone()

        assertFalse(getField<Boolean>("isWifiPaused"))
        assertFalse(getField<Boolean>("isMotionlessPaused"))
        verify { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    // =========================================================================
    // maybeResumeGps - both holds active
    // =========================================================================

    @Test
    fun `maybeResumeGps blocked when both wifi and motionless holds active`() = testScope.runTest {
        setField("currentZoneGeofence", geofence("Home", 52.50, 13.40, 150.0, pauseOnWifi = true, pauseOnMotionless = true))
        setField("isWifiPaused", true)
        setField("isMotionlessPaused", true)

        invokeMaybeResumeGps()

        verify(exactly = 0) { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    // =========================================================================
    // enterPauseZone - flush respects sync condition
    // =========================================================================

    @Test
    fun `enterPauseZone flushes queue when sync is allowed`() = testScope.runTest {
        every { syncManager.isSyncAllowed() } returns true
        val location = mockLocation()
        setField("lastKnownLocation", location)

        invokeEnterPauseZone(homeGeofence)

        coVerify { syncManager.manualFlush() }
    }

    @Test
    fun `enterPauseZone skips flush when sync condition not met`() = testScope.runTest {
        every { syncManager.isSyncAllowed() } returns false
        val location = mockLocation()
        setField("lastKnownLocation", location)

        invokeEnterPauseZone(homeGeofence)

        coVerify(exactly = 0) { syncManager.manualFlush() }
    }

    // =========================================================================
    // sendHeartbeatLocation - sync condition check
    // =========================================================================

    @Test
    fun `sendHeartbeatLocation skips send when sync condition not met`() = testScope.runTest {
        every { syncManager.isSyncAllowed() } returns false
        setField("currentZoneGeofence", homeGeofence)

        invokeSendHeartbeatLocation()

        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
        verify { AppLogger.d("LocationService", "Heartbeat skipped: sync condition not met") }
    }

    @Test
    fun `sendHeartbeatLocation sends when sync condition is met`() = testScope.runTest {
        every { syncManager.isSyncAllowed() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns true
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L
        setField("currentZoneGeofence", homeGeofence)

        invokeSendHeartbeatLocation()

        coVerify { networkManager.sendToEndpoint(any(), "https://example.com", any(), any(), any()) }
        verify { AppLogger.i("LocationService", "Heartbeat sent for zone 'Home'") }
    }

    @Test
    fun `sendHeartbeatLocation skips when no current zone`() = testScope.runTest {
        every { syncManager.isSyncAllowed() } returns true
        setField("currentZoneGeofence", null)

        invokeSendHeartbeatLocation()

        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `sendHeartbeatLocation must not overwrite lastKnownLocation`() = testScope.runTest {
        val realPreviousFix = mockLocation(lat = 52.50, lon = 13.40,
            time = System.currentTimeMillis() - 60_000)
        setField("currentZoneGeofence", homeGeofence)
        setField("lastKnownLocation", realPreviousFix)
        every { syncManager.isSyncAllowed() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns true
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(),
            any(), any(), any(), any()) } returns 1L

        invokeSendHeartbeatLocation()

        assertSame(realPreviousFix, getField<Location?>("lastKnownLocation"))
    }


    // =========================================================================
    // Reflection helpers
    // =========================================================================

    private fun invokeStartEntryDelay(geofence: GeofenceHelper.Geofence) {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "startEntryDelay", GeofenceHelper.Geofence::class.java
        )
        method.isAccessible = true
        method.invoke(service, geofence)
    }

    private fun invokeCancelEntryDelay() {
        val method = LocationForegroundService::class.java.getDeclaredMethod("cancelEntryDelay")
        method.isAccessible = true
        method.invoke(service)
    }

    private fun invokeOnMotionStateChange(state: MotionState) {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "onMotionStateChange", MotionState::class.java
        )
        method.isAccessible = true
        method.invoke(service, state)
    }

    private fun invokeEnsureMotionDetectorRunning() {
        val method = LocationForegroundService::class.java.getDeclaredMethod("ensureMotionDetectorRunning")
        method.isAccessible = true
        method.invoke(service)
    }

    private fun invokeMaybeResumeGps() {
        val method = LocationForegroundService::class.java.getDeclaredMethod("maybeResumeGps")
        method.isAccessible = true
        method.invoke(service)
    }

    private fun invokeApplyZoneSettingsIfChanged(zone: GeofenceHelper.Geofence) {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "applyZoneSettingsIfChanged", GeofenceHelper.Geofence::class.java
        )
        method.isAccessible = true
        method.invoke(service, zone)
    }

    private fun geofence(
        name: String,
        lat: Double = 52.52,
        lon: Double = 13.405,
        radius: Double = 100.0,
        pauseOnWifi: Boolean = false,
        pauseOnMotionless: Boolean = false,
        motionlessTimeoutMinutes: Int = 10
    ) = GeofenceHelper.Geofence(name, lat, lon, radius, pauseOnWifi, pauseOnMotionless, motionlessTimeoutMinutes)

    private fun invokeSendHeartbeatLocation() = runBlocking {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "sendHeartbeatLocation", kotlin.coroutines.Continuation::class.java
        )
        method.isAccessible = true
        suspendCancellableCoroutine<Unit> { cont ->
            val result = method.invoke(service, cont)
            if (result !== kotlin.coroutines.intrinsics.COROUTINE_SUSPENDED) {
                cont.resumeWith(Result.success(Unit))
            }
        }
    }

    private val homeGeofence = geofence("Home", 52.50, 13.40, 150.0)
    private val officeGeofence = geofence("Office", 48.14, 11.58, 200.0)
    private val parkGeofence = geofence("Park", 52.51, 13.35, 100.0)
}
