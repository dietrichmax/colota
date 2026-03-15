package com.Colota.service

import android.app.NotificationManager
import android.location.Location
import com.Colota.bridge.LocationServiceModule
import com.Colota.data.DatabaseHelper
import com.Colota.data.GeofenceHelper
import com.Colota.location.LocationProvider
import com.Colota.location.LocationUpdateCallback
import com.Colota.sync.PayloadBuilder
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
    private lateinit var payloadBuilder: PayloadBuilder
    private lateinit var deviceInfoHelper: DeviceInfoHelper
    private lateinit var notificationHelper: NotificationHelper
    private lateinit var profileManager: ProfileManager
    private lateinit var conditionMonitor: ConditionMonitor
    private lateinit var secureStorage: SecureStorageHelper
    private lateinit var androidNotificationManager: NotificationManager

    private lateinit var testDispatcher: TestDispatcher
    private lateinit var testScope: TestScope
    private lateinit var service: LocationForegroundService

    @Before
    fun setUp() {
        locationProvider = mockk(relaxed = true)
        dbHelper = mockk(relaxed = true)
        geofenceHelper = mockk(relaxed = true)
        syncManager = mockk(relaxed = true)
        payloadBuilder = mockk(relaxed = true)
        deviceInfoHelper = mockk(relaxed = true)
        notificationHelper = mockk(relaxed = true)
        profileManager = mockk(relaxed = true)
        conditionMonitor = mockk(relaxed = true)
        secureStorage = mockk(relaxed = true)
        androidNotificationManager = mockk(relaxed = true)

        testDispatcher = UnconfinedTestDispatcher()
        Dispatchers.setMain(testDispatcher)
        testScope = TestScope(testDispatcher)

        every { deviceInfoHelper.getCachedBatteryStatus() } returns Pair(80, 2)
        every { deviceInfoHelper.isBatteryCritical(any()) } returns false
        every { deviceInfoHelper.isBatteryCritical() } returns false
        every { geofenceHelper.getPauseZone(any()) } returns null
        every { payloadBuilder.buildPayload(any(), any(), any(), any(), any(), any()) } returns JSONObject()
        every { syncManager.getCachedQueuedCount() } returns 0
        every { syncManager.lastSuccessfulSyncTime } returns 0L
        every { profileManager.getActiveProfileName() } returns null
        every { secureStorage.getAuthHeaders() } returns emptyMap()

        mockkObject(AppLogger)
        every { AppLogger.enabled } returns false
        every { AppLogger.enabled = any() } just Runs
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs

        mockkObject(LocationServiceModule)
        every { LocationServiceModule.sendLocationEvent(any(), any(), any()) } returns true
        every { LocationServiceModule.sendPauseZoneEvent(any(), any()) } returns true
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
        testScope.cancel()
        Dispatchers.resetMain()
        unmockkObject(LocationServiceModule)
        unmockkObject(AppLogger)
        unmockkStatic(android.os.Looper::class)
    }

    private fun injectDependencies() {
        setField("locationProvider", locationProvider)
        setField("dbHelper", dbHelper)
        setField("geofenceHelper", geofenceHelper)
        setField("syncManager", syncManager)
        setField("payloadBuilder", payloadBuilder)
        setField("deviceInfoHelper", deviceInfoHelper)
        setField("notificationHelper", notificationHelper)
        setField("profileManager", profileManager)
        setField("conditionMonitor", conditionMonitor)
        setField("secureStorage", secureStorage)
        setField("notificationManager", androidNotificationManager)
        setField("serviceScope", testScope as CoroutineScope)
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            interval = 5000L,
            filterInaccurateLocations = true,
            accuracyThreshold = 50.0f,
            syncIntervalSeconds = 0
        ))
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
    fun `handleLocationUpdate builds payload with field map and custom fields`() = testScope.runTest {
        val location = mockLocation()
        val fieldMap = mapOf("lat" to "latitude", "lon" to "longitude")
        val customFields = mapOf("device" to "test")
        setField("fieldMap", fieldMap)
        setField("customFields", customFields)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify { payloadBuilder.buildPayload(location, 80, 2, fieldMap, any(), customFields) }
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
    fun `handleLocationUpdate enters pause zone when location is in geofence`() = testScope.runTest {
        every { geofenceHelper.getPauseZone(any()) } returns homeGeofence
        val location = mockLocation()

        invokeHandleLocationUpdate(location)

        assertTrue(getField("insidePauseZone"))
        assertEquals("Home", getField<String?>("currentZoneName"))
        verify { LocationServiceModule.sendPauseZoneEvent(true, "Home") }
        // Anchor point is saved at geofence center, but regular GPS location is not saved
        verify(exactly = 1) { dbHelper.saveLocation(
            latitude = homeGeofence.lat,
            longitude = homeGeofence.lon,
            accuracy = homeGeofence.radius,
            altitude = null,
            speed = null,
            bearing = null,
            battery = any(),
            battery_status = any(),
            timestamp = any(),
            endpoint = any()
        ) }
    }

    @Test
    fun `handleLocationUpdate skips saving when already inside pause zone`() = testScope.runTest {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        every { geofenceHelper.getPauseZone(any()) } returns homeGeofence
        val location = mockLocation()

        invokeHandleLocationUpdate(location)

        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `handleLocationUpdate updates zone when moving to different zone`() = testScope.runTest {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        every { geofenceHelper.getPauseZone(any()) } returns officeGeofence
        val location = mockLocation()

        invokeHandleLocationUpdate(location)

        assertTrue(getField("insidePauseZone"))
        assertEquals("Office", getField<String?>("currentZoneName"))
        assertEquals(officeGeofence, getField<GeofenceHelper.CachedGeofence?>("currentZoneGeofence"))
        // No anchor saved for zone-to-zone transition
        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
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

    @Test
    fun `handleLocationUpdate uses empty field map when none configured`() = testScope.runTest {
        setField("fieldMap", null)
        val location = mockLocation()
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(location)

        verify { payloadBuilder.buildPayload(any(), any(), any(), emptyMap(), any(), any()) }
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
    fun `ACTION_FORCE_EXIT_ZONE rechecks zone after forced exit`() {
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
    fun `ACTION_FORCE_EXIT_ZONE re-enters if still in zone after recheck`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Office")
        setField("currentZoneGeofence", officeGeofence)
        val location = mockLocation()
        setField("lastKnownLocation", location)
        every { geofenceHelper.getPauseZone(location) } returns officeGeofence

        invokeExitPauseZone()
        invokeRecheckZoneWithLocation(location)

        assertTrue(getField("insidePauseZone"))
        assertEquals("Office", getField<String?>("currentZoneName"))
    }

    @Test
    fun `ACTION_RECHECK_ZONE with fresh location rechecks immediately`() {
        val freshLocation = mockLocation(time = System.currentTimeMillis())
        setField("lastKnownLocation", freshLocation)
        every { geofenceHelper.getPauseZone(freshLocation) } returns parkGeofence

        invokeHandleZoneRecheckAction()

        verify { geofenceHelper.invalidateCache() }
        assertTrue(getField("insidePauseZone"))
        assertEquals("Park", getField<String?>("currentZoneName"))
    }

    @Test
    fun `ACTION_RECHECK_ZONE with stale location requests from provider`() {
        val staleLocation = mockLocation(time = System.currentTimeMillis() - 120_000)
        setField("lastKnownLocation", staleLocation)

        invokeHandleZoneRecheckAction()

        verify { geofenceHelper.invalidateCache() }
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
        assertEquals(homeGeofence, getField<GeofenceHelper.CachedGeofence?>("currentZoneGeofence"))
        verify { LocationServiceModule.sendPauseZoneEvent(true, "Home") }
    }

    @Test
    fun `enterPauseZone saves anchor point at geofence center`() = testScope.runTest {
        val location = mockLocation()
        setField("lastKnownLocation", location)

        invokeEnterPauseZone(homeGeofence)

        verify { dbHelper.saveLocation(
            latitude = homeGeofence.lat,
            longitude = homeGeofence.lon,
            accuracy = homeGeofence.radius,
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
    fun `enterPauseZone anchor queues sync after DB save`() = testScope.runTest {
        val location = mockLocation()
        setField("lastKnownLocation", location)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 42L

        invokeEnterPauseZone(homeGeofence)

        coVerify { syncManager.queueAndSend(42L, any()) }
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
        assertNull(getField<GeofenceHelper.CachedGeofence?>("currentZoneGeofence"))
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
            accuracy = homeGeofence.radius,
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
        assertNull(getField<GeofenceHelper.CachedGeofence?>("currentZoneGeofence"))
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
    fun `zone-to-zone transition skips anchor for second zone`() = testScope.runTest {
        val location = mockLocation()
        setField("lastKnownLocation", location)

        invokeEnterPauseZone(homeGeofence)

        clearMocks(dbHelper, answers = false)

        invokeEnterPauseZone(officeGeofence)

        // No anchor saved when switching directly between zones (no trip in between)
        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    // =========================================================================
    // recheckZoneWithLocation - zone recheck state machine
    // =========================================================================

    @Test
    fun `recheckZone enters zone when not currently in zone`() {
        setField("insidePauseZone", false)
        val location = mockLocation()
        every { geofenceHelper.getPauseZone(location) } returns parkGeofence

        invokeRecheckZoneWithLocation(location)

        assertTrue(getField("insidePauseZone"))
        assertEquals("Park", getField<String?>("currentZoneName"))
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
    fun `recheckZone changes zone when moving between zones`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        val location = mockLocation()
        every { geofenceHelper.getPauseZone(location) } returns officeGeofence

        invokeRecheckZoneWithLocation(location)

        assertTrue(getField("insidePauseZone"))
        assertEquals("Office", getField<String?>("currentZoneName"))
    }

    @Test
    fun `recheckZone zone-to-zone transition skips anchor for new zone`() = testScope.runTest {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        val location = mockLocation()
        every { geofenceHelper.getPauseZone(location) } returns officeGeofence

        clearMocks(dbHelper, answers = false)

        invokeRecheckZoneWithLocation(location)

        // No anchor saved when switching directly between zones (no trip in between)
        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        // State should still update
        assertEquals("Office", getField<String?>("currentZoneName"))
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
            maxRetries = 10,
            httpMethod = "GET"
        ))

        invokeApplyProfileConfig(interval = 2000L, distance = 5f, syncInterval = 30)

        val config = getField<ServiceConfig>("config")
        assertEquals("https://my-server.com", config.endpoint)
        assertEquals(100f, config.accuracyThreshold)
        assertTrue(config.filterInaccurateLocations)
        assertEquals(10, config.maxRetries)
        assertEquals("GET", config.httpMethod)
    }

    @Test
    fun `applyProfileConfig updates sync manager with new config`() {
        every { secureStorage.getAuthHeaders() } returns mapOf("Authorization" to "Bearer token")
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            retryIntervalSeconds = 60,
            maxRetries = 3,
            isOfflineMode = true,
            isWifiOnlySync = true,
            httpMethod = "GET"
        ))

        invokeApplyProfileConfig(interval = 2000L, distance = 5f, syncInterval = 30)

        verify { syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 30,
            retryIntervalSeconds = 60,
            maxRetries = 3,
            isOfflineMode = true,
            isWifiOnlySync = true,
            authHeaders = mapOf("Authorization" to "Bearer token"),
            httpMethod = "GET"
        ) }
    }

    @Test
    fun `applyProfileConfig restarts location updates`() = testScope.runTest {
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
    fun `applyProfileConfig cancels pending locationRestartJob`() {
        val mockJob = mockk<Job>(relaxed = true)
        setField("locationRestartJob", mockJob)

        invokeApplyProfileConfig(interval = 2000L, distance = 5f, syncInterval = 30)

        verify { mockJob.cancel() }
        assertNull(getField<Job?>("locationRestartJob"))
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

        verify { LocationServiceModule.sendTrackingStoppedEvent("Battery critical") }
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
    // Helpers - invoke private methods via reflection
    // =========================================================================

    private fun invokeHandleLocationUpdate(location: Location) {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "handleLocationUpdate", Location::class.java
        )
        method.isAccessible = true
        method.invoke(service, location)
    }

    private fun invokeEnterPauseZone(geofence: GeofenceHelper.CachedGeofence) {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "enterPauseZone", GeofenceHelper.CachedGeofence::class.java
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

    private fun invokeSaveAnchorPoint(geofence: GeofenceHelper.CachedGeofence) {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "saveAnchorPoint", GeofenceHelper.CachedGeofence::class.java
        )
        method.isAccessible = true
        method.invoke(service, geofence)
    }

    // =========================================================================
    // evaluateStationaryState - motion detection
    // =========================================================================

    @Test
    fun `evaluateStationaryState skips when pauseWhenStationary is disabled`() = testScope.runTest {
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            pauseWhenStationary = false,
            filterInaccurateLocations = true,
            accuracyThreshold = 50.0f
        ))
        val motionDetector = mockk<MotionDetector>(relaxed = true)
        every { motionDetector.isAvailable } returns true
        setField("motionDetector", motionDetector)

        val location = mockLocation(speed = 0.1f)
        invokeEvaluateStationaryState(location)

        val stationaryJob: Job? = getField("stationaryJob")
        assertNull("Should not start stationary timer when disabled", stationaryJob)
    }

    @Test
    fun `evaluateStationaryState skips when motion sensor unavailable`() = testScope.runTest {
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            pauseWhenStationary = true,
            filterInaccurateLocations = true,
            accuracyThreshold = 50.0f
        ))
        val motionDetector = mockk<MotionDetector>(relaxed = true)
        every { motionDetector.isAvailable } returns false
        setField("motionDetector", motionDetector)

        val location = mockLocation(speed = 0.1f)
        invokeEvaluateStationaryState(location)

        val stationaryJob: Job? = getField("stationaryJob")
        assertNull("Should not start timer when sensor unavailable", stationaryJob)
    }

    @Test
    fun `evaluateStationaryState starts timer when inside pause zone`() = testScope.runTest {
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            pauseWhenStationary = true,
            filterInaccurateLocations = true,
            accuracyThreshold = 50.0f
        ))
        val motionDetector = mockk<MotionDetector>(relaxed = true)
        every { motionDetector.isAvailable } returns true
        setField("motionDetector", motionDetector)
        setField("insidePauseZone", true)

        val location = mockLocation(speed = 0.1f)
        invokeEvaluateStationaryState(location)

        val stationaryJob: Job? = getField("stationaryJob")
        assertNotNull("Should start timer inside pause zone - GPS still running there", stationaryJob)
    }

    @Test
    fun `evaluateStationaryState starts timer when speed below threshold`() = testScope.runTest {
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            pauseWhenStationary = true,
            filterInaccurateLocations = true,
            accuracyThreshold = 50.0f
        ))
        val motionDetector = mockk<MotionDetector>(relaxed = true)
        every { motionDetector.isAvailable } returns true
        setField("motionDetector", motionDetector)

        val location = mockLocation(speed = 0.1f) // below 0.3 m/s threshold
        invokeEvaluateStationaryState(location)

        val stationaryJob: Job? = getField("stationaryJob")
        assertNotNull("Should start stationary timer", stationaryJob)
        assertTrue("Timer should be active", stationaryJob!!.isActive)
    }

    @Test
    fun `evaluateStationaryState cancels timer when speed above threshold`() = testScope.runTest {
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            pauseWhenStationary = true,
            filterInaccurateLocations = true,
            accuracyThreshold = 50.0f
        ))
        val motionDetector = mockk<MotionDetector>(relaxed = true)
        every { motionDetector.isAvailable } returns true
        setField("motionDetector", motionDetector)

        // First: trigger timer with low speed
        val slowLocation = mockLocation(speed = 0.1f)
        invokeEvaluateStationaryState(slowLocation)
        val job: Job? = getField("stationaryJob")
        assertNotNull("Timer should exist", job)

        // Then: cancel with movement
        val fastLocation = mockLocation(speed = 5.0f)
        invokeEvaluateStationaryState(fastLocation)
        val cancelledJob: Job? = getField("stationaryJob")
        assertNull("Timer should be cancelled", cancelledJob)
    }

    @Test
    fun `evaluateStationaryState treats missing speed as stationary`() = testScope.runTest {
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            pauseWhenStationary = true,
            filterInaccurateLocations = true,
            accuracyThreshold = 50.0f
        ))
        val motionDetector = mockk<MotionDetector>(relaxed = true)
        every { motionDetector.isAvailable } returns true
        setField("motionDetector", motionDetector)

        val location = mockLocation(hasSpeed = false)
        invokeEvaluateStationaryState(location)

        val stationaryJob: Job? = getField("stationaryJob")
        assertNotNull("Should start stationary timer when speed is missing", stationaryJob)
    }

    @Test
    fun `enterStationary stops location updates and arms motion sensor`() = testScope.runTest {
        val motionDetector = mockk<MotionDetector>(relaxed = true)
        setField("motionDetector", motionDetector)

        val callback = mockk<LocationUpdateCallback>(relaxed = true)
        setField("locationUpdateCallback", callback)

        invokeEnterStationary()

        assertTrue(getField<Boolean>("isStationary"))
        verify { locationProvider.removeLocationUpdates(callback) }
        verify { motionDetector.arm() }
        assertNull(getField<LocationUpdateCallback?>("locationUpdateCallback"))
    }

    @Test
    fun `enterStationary arms sensor when inside pause zone`() = testScope.runTest {
        val motionDetector = mockk<MotionDetector>(relaxed = true)
        setField("motionDetector", motionDetector)
        setField("insidePauseZone", true)

        invokeEnterStationary()

        assertTrue(getField<Boolean>("isStationary"))
        verify { motionDetector.arm() }
    }

    @Test
    fun `onMotionDetected resumes GPS when stationary`() = testScope.runTest {
        val motionDetector = mockk<MotionDetector>(relaxed = true)
        setField("motionDetector", motionDetector)
        setField("isStationary", true)

        invokeOnMotionDetected()

        assertFalse(getField<Boolean>("isStationary"))
        verify { motionDetector.disarm() }
    }

    @Test
    fun `onMotionDetected ignores when not stationary`() = testScope.runTest {
        val motionDetector = mockk<MotionDetector>(relaxed = true)
        setField("motionDetector", motionDetector)
        setField("isStationary", false)

        invokeOnMotionDetected()

        verify(exactly = 0) { motionDetector.disarm() }
    }

    @Test
    fun `applyProfileConfig resumes from stationary`() = testScope.runTest {
        val motionDetector = mockk<MotionDetector>(relaxed = true)
        setField("motionDetector", motionDetector)
        setField("isStationary", true)

        invokeApplyProfileConfig(10000L, 5.0f, 300)

        assertFalse(getField<Boolean>("isStationary"))
        verify { motionDetector.disarm() }
    }

    // =========================================================================
    // Reflection helpers
    // =========================================================================

    private fun invokeEvaluateStationaryState(location: Location) {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "evaluateStationaryState", Location::class.java
        )
        method.isAccessible = true
        method.invoke(service, location)
    }

    private fun invokeEnterStationary() {
        val method = LocationForegroundService::class.java.getDeclaredMethod("enterStationary")
        method.isAccessible = true
        method.invoke(service)
    }

    private fun invokeOnMotionDetected() {
        val method = LocationForegroundService::class.java.getDeclaredMethod("onMotionDetected")
        method.isAccessible = true
        method.invoke(service)
    }

    private fun geofence(name: String, lat: Double = 52.52, lon: Double = 13.405, radius: Double = 100.0) =
        GeofenceHelper.CachedGeofence(name, lat, lon, radius)

    private val homeGeofence = geofence("Home", 52.50, 13.40, 150.0)
    private val officeGeofence = geofence("Office", 48.14, 11.58, 200.0)
    private val parkGeofence = geofence("Park", 52.51, 13.35, 100.0)
}
