package com.Colota.service

import android.app.NotificationManager
import android.content.Intent
import android.location.Location
import com.Colota.bridge.LocationServiceModule
import com.Colota.data.DatabaseHelper
import com.Colota.data.GeofenceHelper
import com.Colota.data.SettingsKeys
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
    private lateinit var batteryMonitor: BatteryMonitor
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
        batteryMonitor = mockk(relaxed = true)
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
        // Default the fresh-fix probe to a timeout (null) so requestFreshOrLastLocation falls
        // back to getLastLocation, preserving prior recheck-test behavior. Fresh-path tests override.
        every { locationProvider.getCurrentLocation(any(), any()) } answers {
            secondArg<(Location?) -> Unit>()(null)
        }
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

        mockkObject(BatteryRecoveryScheduler)
        mockkObject(GeofenceHeartbeatScheduler)
        every { GeofenceHeartbeatScheduler.schedule(any(), any()) } just Runs
        every { GeofenceHeartbeatScheduler.cancel(any()) } just Runs
        every { BatteryRecoveryScheduler.schedule(any()) } just Runs
        every { BatteryRecoveryScheduler.cancel(any()) } just Runs

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
        unmockkObject(BatteryRecoveryScheduler)
        unmockkObject(GeofenceHeartbeatScheduler)
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
        setField("batteryMonitor", batteryMonitor)
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
        elapsedNanos: Long = 0L,
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
        every { elapsedRealtimeNanos } returns elapsedNanos
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
    // Position-jump filter (#382) - implied-speed vs chip-Doppler-speed disagreement
    // =========================================================================

    @Test
    fun `position-jump filter drops fix when implied speed far exceeds chip speed`() = testScope.runTest {
        // Bug signature: chip reports 0 m/s but position jumps 1670m in 10s (implied 167 m/s).
        val now = System.currentTimeMillis()
        val prev = mockLocation(time = now - 10_000, distanceTo = 1670f)
        setField("lastKnownLocation", prev)

        val jump = mockLocation(hasSpeed = true, speed = 0f, time = now)
        invokeHandleLocationUpdate(jump)

        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        // Anchor must stay on prev so the next good fix is judged against a trusted point.
        assertEquals(prev, getField<Location?>("lastKnownLocation"))
    }

    @Test
    fun `position-jump filter keeps flight cruise where chip and implied agree`() = testScope.runTest {
        // ~250 m/s (900 km/h) cruise. Both measurements agree -> ratio check passes.
        val now = System.currentTimeMillis()
        val prev = mockLocation(time = now - 5_000, distanceTo = 1250f)  // 1250m in 5s = 250 m/s
        setField("lastKnownLocation", prev)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        val cruise = mockLocation(hasSpeed = true, speed = 250f, time = now)
        invokeHandleLocationUpdate(cruise)

        verify { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `position-jump filter keeps highway driving`() = testScope.runTest {
        val now = System.currentTimeMillis()
        val prev = mockLocation(time = now - 2_000, distanceTo = 60f)  // 60m in 2s = 30 m/s
        setField("lastKnownLocation", prev)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        val driving = mockLocation(hasSpeed = true, speed = 30f, time = now)
        invokeHandleLocationUpdate(driving)

        verify { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `position-jump filter keeps stationary GPS jitter below floor`() = testScope.runTest {
        // chip=0, implied=0.5 m/s. Implied is below the 20 m/s floor -> not flagged.
        val now = System.currentTimeMillis()
        val prev = mockLocation(time = now - 10_000, distanceTo = 5f)
        setField("lastKnownLocation", prev)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        val jitter = mockLocation(hasSpeed = true, speed = 0f, time = now)
        invokeHandleLocationUpdate(jitter)

        verify { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `position-jump filter bypassed when gap exceeds window`() = testScope.runTest {
        // 10-minute gap (e.g. post-airplane-mode, deep sleep resume). Implied is huge but
        // we cannot judge it, so the first fix after a long pause is accepted unconditionally.
        val now = System.currentTimeMillis()
        val prev = mockLocation(time = now - 600_000, distanceTo = 50_000f)
        setField("lastKnownLocation", prev)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        val resume = mockLocation(hasSpeed = true, speed = 0f, time = now)
        invokeHandleLocationUpdate(resume)

        verify { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `position-jump filter skipped when chip omits speed`() = testScope.runTest {
        // Without chip-Doppler speed there's nothing to compare against, so we can't tell
        // a jump from a legitimate fast fix - accept rather than false-drop flight fixes.
        val now = System.currentTimeMillis()
        val prev = mockLocation(time = now - 10_000, distanceTo = 1670f)
        setField("lastKnownLocation", prev)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        val noSpeed = mockLocation(hasSpeed = false, time = now)
        invokeHandleLocationUpdate(noSpeed)

        verify { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `position-jump filter not applied on first fix without previous anchor`() = testScope.runTest {
        // No lastKnownLocation -> nothing to compare against; first fix is always accepted.
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        val firstFix = mockLocation(hasSpeed = true, speed = 0f)
        invokeHandleLocationUpdate(firstFix)

        verify { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `consecutive position-jumps both dropped with anchor stuck on last good fix`() = testScope.runTest {
        val t0 = System.currentTimeMillis()
        val anchor = mockLocation(time = t0, distanceTo = 1670f)
        setField("lastKnownLocation", anchor)

        val jump1 = mockLocation(hasSpeed = true, speed = 0f, time = t0 + 10_000)
        invokeHandleLocationUpdate(jump1)
        val jump2 = mockLocation(hasSpeed = true, speed = 0f, time = t0 + 20_000)
        invokeHandleLocationUpdate(jump2)

        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        assertEquals(anchor, getField<Location?>("lastKnownLocation"))
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
    // #444 - restored / paused zone recheck against a fresh fix
    // =========================================================================

    @Test
    fun `recheck while paused forces a fresh fix and exits when it lands outside`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        val fresh = mockLocation(lat = 48.0, lon = 11.0)
        every { geofenceHelper.getPauseZone(fresh) } returns null
        every { locationProvider.getCurrentLocation(any(), any()) } answers {
            secondArg<(Location?) -> Unit>()(fresh)
        }

        invokeHandleZoneRecheckAction()

        verify { locationProvider.getCurrentLocation(any(), any()) }
        assertFalse(getField("insidePauseZone"))
    }

    @Test
    fun `recheck while paused stays paused when the fresh fix is still inside`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        val fresh = mockLocation(lat = 52.50, lon = 13.40)
        every { geofenceHelper.getPauseZone(fresh) } returns homeGeofence
        every { locationProvider.getCurrentLocation(any(), any()) } answers {
            secondArg<(Location?) -> Unit>()(fresh)
        }

        invokeHandleZoneRecheckAction()

        assertTrue(getField("insidePauseZone"))
        assertEquals("Home", getField<String?>("currentZoneName"))
    }

    @Test
    fun `recheck while paused falls back to last-known when the fresh fix times out`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        val lastKnown = mockLocation(lat = 48.0, lon = 11.0)
        every { geofenceHelper.getPauseZone(lastKnown) } returns null
        // getCurrentLocation defaults to null (timeout) from setUp.
        every { locationProvider.getLastLocation(any(), any()) } answers {
            firstArg<(Location?) -> Unit>()(lastKnown)
        }

        invokeHandleZoneRecheckAction()

        verify { locationProvider.getLastLocation(any(), any()) }
        assertFalse(getField("insidePauseZone"))
    }

    @Test
    fun `paused recheck throttles a second fresh probe within the min interval`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        val fresh = mockLocation(lat = 52.50, lon = 13.40)   // still inside -> stays paused
        every { geofenceHelper.getPauseZone(fresh) } returns homeGeofence
        every { locationProvider.getCurrentLocation(any(), any()) } answers {
            secondArg<(Location?) -> Unit>()(fresh)
        }
        every { locationProvider.getLastLocation(any(), any()) } answers {
            firstArg<(Location?) -> Unit>()(fresh)
        }

        invokeHandleZoneRecheckAction()   // first: spins the fresh probe
        invokeHandleZoneRecheckAction()   // second: throttled -> serves last-known instead

        verify(exactly = 1) { locationProvider.getCurrentLocation(any(), any()) }
        verify { locationProvider.getLastLocation(any(), any()) }
    }

    @Test
    fun `recheck while paused force-exits when the only available fix is a stale in-zone fix`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        // Probe times out (default getCurrentLocation stub -> null), and the last-known fix is the
        // old in-zone home fix (stale by the monotonic clock). getPauseZone returns Home for it, so
        // without the staleness guard it would re-confirm the pause - the guard must force exit instead.
        val stale = mockLocation(lat = 52.50, lon = 13.40, elapsedNanos = -(10L * 60_000L) * 1_000_000L)
        every { geofenceHelper.getPauseZone(stale) } returns homeGeofence
        every { locationProvider.getLastLocation(any(), any()) } answers {
            firstArg<(Location?) -> Unit>()(stale)
        }

        invokeHandleZoneRecheckAction()

        assertFalse("a stale in-zone fix must not re-confirm the pause", getField("insidePauseZone"))
    }

    @Test
    fun `recheck while paused force-exits when the probe returns a stale replayed fix`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        // A chip replays the cached in-zone fix - non-null but old by the monotonic clock - and
        // getPauseZone returns Home for it, so without the guard it would re-confirm the pause.
        val staleProbe = mockLocation(lat = 52.50, lon = 13.40, elapsedNanos = -(6L * 60_000L) * 1_000_000L)
        every { geofenceHelper.getPauseZone(staleProbe) } returns homeGeofence
        every { locationProvider.getCurrentLocation(any(), any()) } answers {
            secondArg<(Location?) -> Unit>()(staleProbe)
        }
        every { locationProvider.getLastLocation(any(), any()) } answers {
            firstArg<(Location?) -> Unit>()(null)
        }

        invokeHandleZoneRecheckAction()

        assertFalse("a stale replayed probe fix must not re-confirm the pause", getField("insidePauseZone"))
    }

    @Test
    fun `throttled paused recheck does not fabricate a departure on a stale last-known`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        // A fresh probe ran moments ago (SystemClock.elapsedRealtime()=0 in tests), so this recheck is
        // throttled to the stale last-known home fix. It must STAY paused, not fabricate a departure.
        setField("lastFreshProbeAtMs", 0L)
        val staleHome = mockLocation(lat = 52.50, lon = 13.40, elapsedNanos = -(10L * 60_000L) * 1_000_000L)
        every { locationProvider.getLastLocation(any(), any()) } answers {
            firstArg<(Location?) -> Unit>()(staleHome)
        }

        invokeHandleZoneRecheckAction()

        verify(exactly = 0) { locationProvider.getCurrentLocation(any(), any()) }
        assertTrue("a throttled recheck with a stale fix must not force a departure", getField("insidePauseZone"))
    }

    @Test
    fun `a restored pause with no usable fix holds and waits for the watchdog`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        // Fresh probe times out (default stub -> null) and last-known is unavailable, so no fix can
        // confirm a departure. The pause must hold, not force a false exit - previously a user-initiated
        // start force-exited here, unpausing at a poor-GPS home zone after a backup restore.
        every { locationProvider.getLastLocation(any(), any()) } answers {
            firstArg<(Location?) -> Unit>()(null)
        }

        invokeSetupLocationUpdates()

        assertTrue("no usable fix must hold the pause, not force a false exit", getField("insidePauseZone"))
    }

    @Test
    fun `pause watchdog does not probe while the live stream is still delivering fixes`() {
        setField("insidePauseZone", true)
        setField("currentZoneGeofence", homeGeofence)
        setField("lastFixAtMs", 0L)   // SystemClock.elapsedRealtime()=0 in tests -> stream "just delivered"

        invokeRunPauseWatchdogTick()

        verify(exactly = 0) { locationProvider.getCurrentLocation(any(), any()) }
    }

    @Test
    fun `pause watchdog probes and exits when the stream is quiet and the fresh fix is outside`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        setField("lastFixAtMs", -700_000L)   // sinceLastFix > 10min interval -> stream quiet
        val fresh = mockLocation(lat = 48.0, lon = 11.0)
        every { geofenceHelper.getPauseZone(fresh) } returns null
        every { locationProvider.getCurrentLocation(any(), any()) } answers {
            secondArg<(Location?) -> Unit>()(fresh)
        }

        invokeRunPauseWatchdogTick()

        verify { locationProvider.getCurrentLocation(any(), any()) }
        assertFalse(getField("insidePauseZone"))
    }

    @Test
    fun `pause watchdog stays paused when the quiet-stream probe is still inside`() {
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)
        setField("lastFixAtMs", -700_000L)
        val fresh = mockLocation(lat = 52.50, lon = 13.40)
        every { geofenceHelper.getPauseZone(fresh) } returns homeGeofence
        every { locationProvider.getCurrentLocation(any(), any()) } answers {
            secondArg<(Location?) -> Unit>()(fresh)
        }

        invokeRunPauseWatchdogTick()

        assertTrue(getField("insidePauseZone"))
    }

    @Test
    fun `pause watchdog skips probing while a motionless hold has GPS stopped`() {
        setField("insidePauseZone", true)
        setField("currentZoneGeofence", homeGeofence)
        setField("isMotionlessPaused", true)
        setField("lastFixAtMs", -700_000L)

        invokeRunPauseWatchdogTick()

        verify(exactly = 0) { locationProvider.getCurrentLocation(any(), any()) }
    }

    @Test
    fun `pause watchdog stall threshold scales with the configured interval`() {
        // 30-min interval -> stall threshold max(10min, 60min) = 60min, so an 11-min gap that would
        // trip the fixed 10-min floor must NOT probe; the watchdog respects the user's interval.
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            interval = 30 * 60_000L,
            accuracyThreshold = 50f,
            filterInaccurateLocations = true,
            syncIntervalSeconds = 0
        ))
        setField("insidePauseZone", true)
        setField("currentZoneGeofence", homeGeofence)
        setField("lastFixAtMs", -700_000L)   // ~11.6 min: past the 10-min floor, well under 60min

        invokeRunPauseWatchdogTick()

        verify(exactly = 0) { locationProvider.getCurrentLocation(any(), any()) }
    }

    // =========================================================================
    // Active-stream stall recovery
    // =========================================================================

    @Test
    fun `re-registers the location stream after it goes quiet while active`() = runServiceTest {
        // The pause watchdog only probes inside a zone, so a stream that dies while active
        // otherwise stays dead
        setField("locationUpdateCallback", mockk<LocationUpdateCallback>(relaxed = true))
        setField("lastFixAtUptimeMs", -700_000L) // ~11.6 min awake, past the 10-min floor

        invokeRecoverStalledStream()

        verify { locationProvider.removeLocationUpdates(any()) }
        verify { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `tolerates a doze-length gap on a short interval`() = runServiceTest {
        // Several minutes without a fix is normal on a 5s interval; the floor keeps that from
        // reading as a fault
        setField("locationUpdateCallback", mockk<LocationUpdateCallback>(relaxed = true))
        setField("lastFixAtUptimeMs", -420_000L) // 7 min awake

        invokeRecoverStalledStream()

        verify(exactly = 0) { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `does not count a night of deep sleep as silence`() = runServiceTest {
        // 8h of wall clock but no awake time: the phone was suspended, so it produced no fixes
        // by design
        setField("locationUpdateCallback", mockk<LocationUpdateCallback>(relaxed = true))
        setField("lastFixAtMs", -8 * 60 * 60_000L)
        setField("lastFixAtUptimeMs", -10_000L)

        invokeRecoverStalledStream()

        verify(exactly = 0) { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `does not re-register while system location is switched off`() = runServiceTest {
        // The OS hands out no fixes while location is off, and the request survives the toggle
        every { deviceInfoHelper.isLocationEnabled() } returns false
        setField("locationUpdateCallback", mockk<LocationUpdateCallback>(relaxed = true))
        setField("lastFixAtUptimeMs", -700_000L)

        invokeRecoverStalledStream()

        verify(exactly = 0) { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `the 5-minute loop is what drives stall recovery`() = runServiceTest {
        // Nothing else probes a stream that died while active, so if this loop stops calling
        // recoverStalledStream the stall is never noticed
        setField("locationUpdateCallback", mockk<LocationUpdateCallback>(relaxed = true))
        setField("lastFixAtUptimeMs", -700_000L)
        invokeStartTrackingHeartbeatLogger()

        advanceTimeBy(5 * 60_000L + 1)
        runCurrent()

        verify { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
        assertTrue("and it has to keep ticking afterwards", getField<Job?>("trackingHeartbeatJob")?.isActive == true)
    }

    @Test
    fun `heartbeat logger survives a pause stopping the stream`() = runServiceTest {
        // Every pause path goes through stopLocationUpdates, and a pause is a state worth logging
        invokeStartTrackingHeartbeatLogger()

        invokeStopLocationUpdates()

        assertTrue(
            "a pause must not silence the diagnostic that explains the pause",
            getField<Job?>("trackingHeartbeatJob")?.isActive == true
        )
    }

    @Test
    fun `starting the heartbeat logger twice keeps the original loop`() = runServiceTest {
        // onStartCommand re-enters often; a restart would reset the interval before it ever fires
        invokeStartTrackingHeartbeatLogger()
        val first = getField<Job?>("trackingHeartbeatJob")

        invokeStartTrackingHeartbeatLogger()

        assertSame("second call must be a no-op", first, getField<Job?>("trackingHeartbeatJob"))
        assertTrue(first?.isActive == true)
    }

    /** Stands in for the API 31+ framework class, which deniedStartCause matches by simple name. */
    private class ForegroundServiceStartNotAllowedException : IllegalStateException()

    @Test
    fun `a denied start names which failure it was`() = runServiceTest {
        // A start refused at boot reaches no one, so the log is the only place the two causes can
        // still be told apart afterwards
        assertEquals(
            "background start not allowed",
            invokeDeniedStartCause(ForegroundServiceStartNotAllowedException())
        )
        assertTrue(invokeDeniedStartCause(SecurityException("nope")).contains("permission"))
        assertEquals("IllegalArgumentException", invokeDeniedStartCause(IllegalArgumentException("odd")))
    }

    @Test
    fun `leaves a healthy stream alone`() = runServiceTest {
        setField("locationUpdateCallback", mockk<LocationUpdateCallback>(relaxed = true))
        setField("lastFixAtUptimeMs", -10_000L) // 10s since the last fix

        invokeRecoverStalledStream()

        verify(exactly = 0) { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `does not re-register while paused in a zone`() = runServiceTest {
        // A zone pause stops fixes on purpose, and the pause watchdog owns that resume
        setField("locationUpdateCallback", mockk<LocationUpdateCallback>(relaxed = true))
        setField("insidePauseZone", true)
        setField("lastFixAtUptimeMs", -700_000L)

        invokeRecoverStalledStream()

        verify(exactly = 0) { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `stall threshold scales with the configured interval`() = runServiceTest {
        // 30-min interval -> threshold max(10min, 150min), so an 11-min gap is normal, not a stall
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            interval = 30 * 60_000L,
            accuracyThreshold = 50f,
            filterInaccurateLocations = true,
            syncIntervalSeconds = 0
        ))
        setField("locationUpdateCallback", mockk<LocationUpdateCallback>(relaxed = true))
        setField("lastFixAtUptimeMs", -700_000L)

        invokeRecoverStalledStream()

        verify(exactly = 0) { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `handleLocationUpdate while paused rejects a hallucinated outlier instead of fabricating an exit`() = testScope.runTest {
        // A teleport-signature fix (huge implied speed, ~0 chip speed) lands outside the radius but
        // must not fake a departure - the jump filter stays active while paused.
        val prev = mockLocation(lat = 52.50, lon = 13.40, time = 1_000_000L, distanceTo = 2000f)
        setField("lastKnownLocation", prev)
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)

        val outlier = mockLocation(lat = 48.0, lon = 11.0, speed = 1f, hasSpeed = true, time = 1_002_000L)
        every { geofenceHelper.getPauseZone(outlier) } returns null

        invokeHandleLocationUpdate(outlier)

        assertTrue("paused zone must not exit on a single hallucinated outlier", getField("insidePauseZone"))
        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `handleLocationUpdate while paused exits on a genuine departure the min-distance filter would drop`() = testScope.runTest {
        // While paused the min-distance filter is bypassed so a small step across the radius still
        // reaches the zone-exit check; getPauseZone enforces the actual radius (#444).
        setField("config", ServiceConfig(
            endpoint = "https://example.com",
            interval = 5000L,
            minUpdateDistance = 50f,
            accuracyThreshold = 50f,
            filterInaccurateLocations = true,
            syncIntervalSeconds = 0
        ))
        val prev = mockLocation(lat = 52.50, lon = 13.40, time = 1_000_000L, distanceTo = 30f)
        setField("lastKnownLocation", prev)
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", homeGeofence)

        // 30m step (< 50m min-distance) just outside the radius, no chip speed -> jump filter N/A.
        val departing = mockLocation(lat = 52.49, lon = 13.39, hasSpeed = false, time = 1_020_000L)
        every { geofenceHelper.getPauseZone(departing) } returns null
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeHandleLocationUpdate(departing)

        assertFalse("a sub-min-distance departure must still exit while paused", getField("insidePauseZone"))
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
    fun `applyProfileConfig arms the stationary heartbeat for a stationary profile`() {
        invokeApplyProfileConfig(
            interval = 2000L, distance = 0f, syncInterval = 0,
            conditionType = ProfileConstants.CONDITION_STATIONARY
        )

        assertTrue(getField("stationaryHeartbeatArmed"))
    }

    @Test
    fun `applyProfileConfig forces the distance filter to 0 for a stationary profile`() {
        invokeApplyProfileConfig(
            interval = 2000L, distance = 5f, syncInterval = 0,
            conditionType = ProfileConstants.CONDITION_STATIONARY
        )

        assertEquals(0f, getField<ServiceConfig>("config").minUpdateDistance)
    }

    @Test
    fun `applyProfileConfig disarms the stationary heartbeat for a non-stationary profile`() {
        invokeApplyProfileConfig(
            interval = 2000L, distance = 0f, syncInterval = 0,
            conditionType = ProfileConstants.CONDITION_STATIONARY
        )
        invokeApplyProfileConfig(interval = 5000L, distance = 0f, syncInterval = 0, conditionType = "")

        assertFalse(getField("stationaryHeartbeatArmed"))
    }

    @Test
    fun `stationary heartbeat fired is a no-op when not armed`() {
        invokeStationaryHeartbeatFired()

        assertFalse(getField("stationaryHeartbeatArmed"))
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
    // Destroyed instance must not keep receiving fixes
    // =========================================================================

    @Test
    fun `onDestroy removes location updates even when an earlier teardown step throws`() {
        val callback = mockk<LocationUpdateCallback>(relaxed = true)
        setField("locationUpdateCallback", callback)
        every { conditionMonitor.stop() } throws IllegalStateException("db closed during restore")

        invokeOnDestroy()

        // The scope is cancelled either way, so a skipped unregister leaves a dead instance
        // receiving fixes it can no longer save.
        verify { locationProvider.removeLocationUpdates(callback) }
        verify { syncManager.stopPeriodicSync() }
        assertNull(getField<CoroutineScope?>("serviceScope"))
    }

    @Test
    fun `onDestroy removes location updates when the providers receiver was never registered`() {
        val callback = mockk<LocationUpdateCallback>(relaxed = true)
        setField("locationUpdateCallback", callback)
        every { service.unregisterReceiver(any()) } throws IllegalArgumentException("Receiver not registered")

        invokeOnDestroy()

        verify { locationProvider.removeLocationUpdates(callback) }
    }

    @Test
    fun `location callback sheds its registration once the service scope is gone`() {
        val registered = slot<LocationUpdateCallback>()
        every { locationProvider.requestLocationUpdates(any(), any(), any(), capture(registered)) } just Runs
        invokeSetupLocationUpdates()
        setField("serviceScope", null)

        registered.captured.onLocationUpdate(mockLocation())

        // A dead instance can't persist anything, so it must let go instead of holding GNSS open.
        verify { locationProvider.removeLocationUpdates(registered.captured) }
        verify(exactly = 0) {
            dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any())
        }
    }

    @Test
    fun `setupLocationUpdates drops the previous registration before replacing it`() {
        val orphan = mockk<LocationUpdateCallback>(relaxed = true)
        setField("locationUpdateCallback", orphan)

        invokeSetupLocationUpdates()

        // Without this the old callback is orphaned and nothing can unregister it again.
        verify { locationProvider.removeLocationUpdates(orphan) }
    }

    // =========================================================================
    // trackingStateLabel - heartbeat diagnostics
    // =========================================================================

    @Test
    fun `trackingStateLabel reports a zone pause instead of ACTIVE`() {
        setField("locationUpdateCallback", mockk<LocationUpdateCallback>(relaxed = true))
        setField("insidePauseZone", true)

        // ACTIVE here leaves an exported log ambiguous about whether the zone is still latched.
        assertEquals("PAUSED(zone)", invokeTrackingStateLabel())
    }

    @Test
    fun `trackingStateLabel reports the wifi hold ahead of the zone pause`() {
        setField("locationUpdateCallback", mockk<LocationUpdateCallback>(relaxed = true))
        setField("insidePauseZone", true)
        setField("isWifiPaused", true)

        assertEquals("PAUSED(wifi)", invokeTrackingStateLabel())
    }

    @Test
    fun `trackingStateLabel reports ACTIVE while tracking outside every zone`() {
        setField("locationUpdateCallback", mockk<LocationUpdateCallback>(relaxed = true))

        assertEquals("ACTIVE", invokeTrackingStateLabel())
    }

    // =========================================================================
    // stopForegroundServiceWithReason - battery critical path
    // =========================================================================

    @Test
    fun `stopForBattery clears active profile event`() {
        every { profileManager.getActiveProfileName() } returns "Charging"

        invokeOnBatteryCritical()

        verify { LocationServiceModule.sendProfileSwitchEvent(null, null) }
    }

    @Test
    fun `stopForBattery sends tracking stopped event`() {
        invokeOnBatteryCritical()

        verify { LocationServiceModule.sendTrackingStoppedEvent("Battery below 5% - tracking paused") }
    }

    @Test
    fun `stopForBattery saves tracking_enabled false`() {
        invokeOnBatteryCritical()

        verify { dbHelper.saveSetting("tracking_enabled", "false") }
    }

    @Test
    fun `stopForBattery does not send profile event when no active profile`() {
        every { profileManager.getActiveProfileName() } returns null

        invokeOnBatteryCritical()

        verify(exactly = 0) { LocationServiceModule.sendProfileSwitchEvent(any(), any()) }
    }

    @Test
    fun `stopForBattery marks stopped_by_battery so charger can auto-resume`() {
        invokeOnBatteryCritical()

        verify { dbHelper.saveSetting("stopped_by_battery", "true") }
    }

    @Test
    fun `stopForBattery arms the charger recovery worker`() {
        invokeOnBatteryCritical()

        verify { BatteryRecoveryScheduler.schedule(any()) }
    }

    @Test
    fun `non-battery stop clears stopped_by_battery and does not arm recovery`() {
        invokeStopWithReason("Location permission missing", stoppedByBattery = false)

        verify { dbHelper.saveSetting("stopped_by_battery", "false") }
        verify(exactly = 0) { BatteryRecoveryScheduler.schedule(any()) }
    }

    @Test
    fun `battery critical via monitor stops and arms recovery even while wifi paused`() {
        // GPS is off while wifi-paused, so the stop has to come from the battery monitor.
        setField("isWifiPaused", true)

        invokeOnBatteryCritical()

        verify { dbHelper.saveSetting("stopped_by_battery", "true") }
        verify { BatteryRecoveryScheduler.schedule(any()) }
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

    @Test
    fun `handleStationaryChanged true resyncs detector baseline`() {
        val detector = mockk<RawSensorMotionDetector>(relaxed = true)
        setField("motionDetector", detector)
        every { profileManager.isStationary } returns true

        invokeHandleStationaryChanged(true)

        verify { detector.resyncStationaryBaseline() }
    }

    @Test
    fun `handleStationaryChanged false does not resync`() {
        val detector = mockk<RawSensorMotionDetector>(relaxed = true)
        setField("motionDetector", detector)
        every { profileManager.isStationary } returns false

        invokeHandleStationaryChanged(false)

        verify(exactly = 0) { detector.resyncStationaryBaseline() }
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
    fun `applyZoneSettingsIfChanged resumes GPS that no hold explains`() {
        // A restore that dropped a stale motionless hold leaves the flag already false, so there
        // is no transition to resume on and a lightweight action never runs handleStart
        val detector = mockk<MotionStateDetector>(relaxed = true)
        setField("motionDetector", detector)
        setField("currentZoneGeofence", homeGeofence)
        setField("isMotionlessPaused", false)
        setField("locationUpdateCallback", null)

        invokeApplyZoneSettingsIfChanged(homeGeofence)

        verify { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `applyZoneSettingsIfChanged leaves a held stream stopped`() {
        // The state check must not defeat the holds: a motionless hold means GPS is off on purpose
        val motionlessGeofence = geofence("Home", 52.50, 13.40, 150.0, pauseOnMotionless = true)
        setField("motionDetector", mockk<MotionStateDetector>(relaxed = true))
        setField("insidePauseZone", true)
        setField("currentZoneGeofence", motionlessGeofence)
        setField("isMotionlessPaused", true)
        setField("locationUpdateCallback", null)

        invokeApplyZoneSettingsIfChanged(motionlessGeofence)

        verify(exactly = 0) { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
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

    private fun invokeStopWithReason(reason: String, stoppedByBattery: Boolean) {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "stopForegroundServiceWithReason", String::class.java, Boolean::class.javaPrimitiveType
        )
        method.isAccessible = true
        method.invoke(service, reason, stoppedByBattery)
    }

    private fun invokeOnBatteryCritical() {
        val method = LocationForegroundService::class.java.getDeclaredMethod("onBatteryCritical")
        method.isAccessible = true
        method.invoke(service)
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

    private fun invokeApplyProfileConfig(interval: Long, distance: Float, syncInterval: Int, conditionType: String = "") {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "applyProfileConfig", Long::class.java, Float::class.java, Int::class.java, String::class.java
        )
        method.isAccessible = true
        method.invoke(service, interval, distance, syncInterval, conditionType)
    }

    private fun invokeStationaryHeartbeatFired() {
        val method = LocationForegroundService::class.java.getDeclaredMethod("handleStationaryHeartbeatFired")
        method.isAccessible = true
        method.invoke(service)
    }

    private fun invokeTrackingStateLabel(): String {
        val method = LocationForegroundService::class.java.getDeclaredMethod("trackingStateLabel")
        method.isAccessible = true
        return method.invoke(service) as String
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

    private fun invokeStartTrackingHeartbeatLogger() {
        val method = LocationForegroundService::class.java.getDeclaredMethod("startTrackingHeartbeatLogger")
        method.isAccessible = true
        method.invoke(service)
    }

    private fun invokeStopLocationUpdates() {
        val method = LocationForegroundService::class.java.getDeclaredMethod("stopLocationUpdates")
        method.isAccessible = true
        method.invoke(service)
    }

    private fun invokeDeniedStartCause(e: Exception): String {
        val method = LocationForegroundService::class.java
            .getDeclaredMethod("deniedStartCause", Exception::class.java)
        method.isAccessible = true
        return method.invoke(service, e) as String
    }

    private fun invokeRecoverStalledStream() {
        val method = LocationForegroundService::class.java.getDeclaredMethod("recoverStalledStream")
        method.isAccessible = true
        method.invoke(service)
    }

    private fun invokeRunPauseWatchdogTick() {
        val method = LocationForegroundService::class.java
            .getDeclaredMethod("runPauseWatchdogTick")
        method.isAccessible = true
        method.invoke(service)
    }

    private fun invokeRestoreMotionlessHold(geofence: GeofenceHelper.Geofence?, savedActive: Boolean) {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "restoreMotionlessHold", GeofenceHelper.Geofence::class.java, Boolean::class.java
        )
        method.isAccessible = true
        method.invoke(service, geofence, savedActive)
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
    // Motionless pause restore on service restart
    // =========================================================================

    @Test
    fun `restore keeps the motionless hold while the zone still pauses on motionless`() {
        setField("currentZoneName", "Home")

        invokeRestoreMotionlessHold(geofence("Home", pauseOnMotionless = true), savedActive = true)

        assertTrue(getField("isMotionlessPaused"))
        verify(exactly = 0) { dbHelper.saveSetting(SettingsKeys.PAUSE_ZONE_MOTIONLESS_ACTIVE, "false") }
    }

    @Test
    fun `restore drops a motionless hold whose geofence is gone`() {
        // Only the motion detector clears this hold and it is never started for a zone that no longer
        // exists, so keeping the flag would leave GPS off for good - surviving restarts and force-stops.
        setField("currentZoneName", "Home")

        invokeRestoreMotionlessHold(null, savedActive = true)

        assertFalse(getField("isMotionlessPaused"))
        verify { dbHelper.saveSetting(SettingsKeys.PAUSE_ZONE_MOTIONLESS_ACTIVE, "false") }
    }

    @Test
    fun `restore drops a motionless hold when the zone no longer pauses on motionless`() {
        setField("currentZoneName", "Home")

        invokeRestoreMotionlessHold(geofence("Home", pauseOnMotionless = false), savedActive = true)

        assertFalse(getField("isMotionlessPaused"))
        verify { dbHelper.saveSetting(SettingsKeys.PAUSE_ZONE_MOTIONLESS_ACTIVE, "false") }
    }

    @Test
    fun `GPS starts again after a stale motionless hold is dropped`() = runServiceTest {
        setField("currentZoneName", "Home")
        setField("insidePauseZone", true)
        setField("isMotionlessPaused", true)

        invokeRestoreMotionlessHold(null, savedActive = true)
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
    // recordHeartbeatLocation - recording is independent of sending (#524)
    // =========================================================================

    @Test
    fun `recordHeartbeatLocation records the point even when the sync condition is not met`() = testScope.runTest {
        // The stay must survive offline mode and a disallowed connection. Whether it also goes
        // out is SyncManager's call, which still honours the SSID condition (fdw's fix).
        every { syncManager.isSyncAllowed() } returns false
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L
        setField("currentZoneGeofence", homeGeofence)

        invokeRecordHeartbeatLocation()

        verify { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        coVerify { syncManager.queueAndSend(1L, any(), true) }
    }

    @Test
    fun `recordHeartbeatLocation never sends around SyncManager`() = testScope.runTest {
        // Going straight to networkManager would bypass the sync condition entirely
        every { syncManager.isSyncAllowed() } returns true
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L
        setField("currentZoneGeofence", homeGeofence)

        invokeRecordHeartbeatLocation()

        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
        verify { AppLogger.i("LocationService", "Heartbeat recorded for zone 'Home'") }
    }

    @Test
    fun `recordHeartbeatLocation asks to send past the sync interval`() = testScope.runTest {
        // Queued like an ordinary fix, the stay arrives a full sync interval late
        every { syncManager.isSyncAllowed() } returns true
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L
        setField("currentZoneGeofence", homeGeofence)

        invokeRecordHeartbeatLocation()

        coVerify { syncManager.queueAndSend(1L, any(), true) }
    }

    @Test
    fun `recordHeartbeatLocation skips when no current zone`() = testScope.runTest {
        setField("currentZoneGeofence", null)

        invokeRecordHeartbeatLocation()

        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        coVerify(exactly = 0) { syncManager.queueAndSend(any(), any()) }
    }

    @Test
    fun `recordHeartbeatLocation must not overwrite lastKnownLocation`() = testScope.runTest {
        val realPreviousFix = mockLocation(lat = 52.50, lon = 13.40,
            time = System.currentTimeMillis() - 60_000)
        setField("currentZoneGeofence", homeGeofence)
        setField("lastKnownLocation", realPreviousFix)
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(),
            any(), any(), any(), any()) } returns 1L

        invokeRecordHeartbeatLocation()

        assertSame(realPreviousFix, getField<Location?>("lastKnownLocation"))
    }

    @Test
    fun `startHeartbeat records at once on zone entry`() = runServiceTest {
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L
        setField("currentZoneGeofence", homeGeofence)

        invokeStartHeartbeat(15, firstDelayMs = 0L)
        advanceTimeBy(1_000)

        verify(exactly = 1) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        verify { GeofenceHeartbeatScheduler.schedule(any(), 15 * 60_000L) }
    }

    @Test
    fun `restore resumes the running interval instead of restarting it`() {
        // A device that respawns the service more often than the interval would otherwise never
        // reach a heartbeat at all, which is worse than the duplicate this replaced
        every { dbHelper.getSetting(SettingsKeys.HEARTBEAT_LAST_AT) } returns
            (System.currentTimeMillis() - 10 * 60_000L).toString()

        val remaining = invokeRemainingHeartbeatDelay(15)

        assertTrue("Expected about 5 min left, got ${remaining}ms", remaining in 4 * 60_000L..5 * 60_000L)
    }

    @Test
    fun `restore records at once when no heartbeat was ever taken`() {
        // Self-correcting: recording establishes the timestamp the next restart reads
        every { dbHelper.getSetting(SettingsKeys.HEARTBEAT_LAST_AT) } returns null

        assertEquals(0L, invokeRemainingHeartbeatDelay(15))
    }

    @Test
    fun `restore records at once when the interval already elapsed`() {
        every { dbHelper.getSetting(SettingsKeys.HEARTBEAT_LAST_AT) } returns
            (System.currentTimeMillis() - 60 * 60_000L).toString()

        assertEquals(0L, invokeRemainingHeartbeatDelay(15))
    }

    @Test
    fun `entering a zone with the heartbeat on records a point at once`() = runServiceTest {
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L

        invokeEnterPauseZone(geofence("Home", heartbeatEnabled = true))
        advanceTimeBy(1_000)

        verify(exactly = 1) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        verify { GeofenceHeartbeatScheduler.schedule(any(), 15 * 60_000L) }
    }

    @Test
    fun `switching the heartbeat on from the editor records a point at once`() = runServiceTest {
        // The editor promises changes take effect immediately, and the interval is unchanged here,
        // so nothing else in applyZoneSettingsIfChanged marks this as new
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L
        setField("currentZoneGeofence", geofence("Home", heartbeatEnabled = false))

        invokeApplyZoneSettingsIfChanged(geofence("Home", heartbeatEnabled = true))
        advanceTimeBy(1_000)

        verify(exactly = 1) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `re-applying an unchanged zone does not record another point`() = runServiceTest {
        // RECHECK fires on unrelated edits too; each one must not stack a duplicate on an
        // interval that is already running
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L
        every { dbHelper.getSetting(SettingsKeys.HEARTBEAT_LAST_AT) } returns
            (System.currentTimeMillis() - 60_000L).toString()
        setField("currentZoneGeofence", geofence("Home", heartbeatEnabled = true))

        invokeApplyZoneSettingsIfChanged(geofence("Home", heartbeatEnabled = true))
        advanceTimeBy(1_000)

        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `restoring arms for the time left on the interval, not a fresh one`() = runServiceTest {
        // Restarting the clock would starve a device that respawns more often than the interval
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L
        setField("currentZoneGeofence", homeGeofence)

        invokeStartHeartbeat(15, firstDelayMs = 5 * 60_000L)
        advanceTimeBy(1_000)

        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        verify { GeofenceHeartbeatScheduler.schedule(any(), 5 * 60_000L) }
    }

    @Test
    fun `a fired heartbeat re-registers a location stream the cold start never made`() = runServiceTest {
        // Zone exit is only ever seen on the stream, so without this the alarm keeps recording at a
        // zone the user already left
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L
        every { dbHelper.getSetting(SettingsKeys.HEARTBEAT_LAST_AT) } returns
            (System.currentTimeMillis() - 20 * 60_000L).toString()
        setField("insidePauseZone", true)
        setField("currentZoneName", "Home")
        setField("currentZoneGeofence", geofence("Home", heartbeatEnabled = true))
        setField("locationUpdateCallback", null)

        invokeGeofenceHeartbeatFired()

        verify { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `a fired heartbeat records and re-arms for the next interval`() = runServiceTest {
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L
        every { dbHelper.getSetting(SettingsKeys.HEARTBEAT_LAST_AT) } returns
            (System.currentTimeMillis() - 20 * 60_000L).toString()
        setField("insidePauseZone", true)
        setField("currentZoneGeofence", geofence("Home", heartbeatEnabled = true))

        invokeGeofenceHeartbeatFired()
        advanceTimeBy(1_000)

        verify(exactly = 1) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        verify { GeofenceHeartbeatScheduler.schedule(any(), 15 * 60_000L) }
    }

    @Test
    fun `a fired heartbeat does not duplicate the point a restore just recorded`() = runServiceTest {
        // A cold service restores the zone and records in onStartCommand before this action runs
        every { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } returns 1L
        every { dbHelper.getSetting(SettingsKeys.HEARTBEAT_LAST_AT) } returns
            System.currentTimeMillis().toString()
        setField("insidePauseZone", true)
        setField("currentZoneGeofence", geofence("Home", heartbeatEnabled = true))

        invokeGeofenceHeartbeatFired()
        advanceTimeBy(1_000)

        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        verify { GeofenceHeartbeatScheduler.schedule(any(), match { it > 14 * 60_000L }) }
    }

    @Test
    fun `cancelling clears an alarm a previous process left pending`() = runServiceTest {
        // A fresh instance reads as unarmed, but the alarm outlives the process that set it
        setField("heartbeatArmed", false)

        invokeCancelHeartbeat()

        verify { GeofenceHeartbeatScheduler.cancel(any()) }
    }

    @Test
    fun `a stale heartbeat stops a service the user already stopped`() = runServiceTest {
        setField("heartbeatArmed", true)
        setField("insidePauseZone", false)
        setField("currentZoneGeofence", null)

        invokeGeofenceHeartbeatFired(shouldBeTracking = false)

        verify { GeofenceHeartbeatScheduler.cancel(any()) }
        // startForeground already ran, so without this a dead service keeps its notification
        verify { service.stopSelf() }
    }

    @Test
    fun `a bail-out repairs the stream when no hold explains its absence`() = runServiceTest {
        // A latched zone with no geofence and no stream would otherwise never recover
        setField("heartbeatArmed", true)
        setField("insidePauseZone", true)
        setField("currentZoneGeofence", null)
        setField("locationUpdateCallback", null)

        invokeGeofenceHeartbeatFired(shouldBeTracking = true)

        verify(exactly = 0) { service.stopSelf() }
        verify { locationProvider.requestLocationUpdates(any(), any(), any(), any()) }
    }

    @Test
    fun `an old zone's heartbeat never stops a service the user still wants`() = runServiceTest {
        // A wifi hold makes a healthy paused service look streamless
        setField("heartbeatArmed", true)
        setField("insidePauseZone", true)
        setField("isWifiPaused", true)
        setField("currentZoneGeofence", geofence("Neighbourhood", heartbeatEnabled = false))

        invokeGeofenceHeartbeatFired(shouldBeTracking = true)

        verify { GeofenceHeartbeatScheduler.cancel(any()) }
        verify(exactly = 0) { service.stopSelf() }
        verify(exactly = 0) { dbHelper.saveLocation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
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

    private fun invokeHandleStationaryChanged(stationary: Boolean) {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "handleStationaryChanged", Boolean::class.javaPrimitiveType
        )
        method.isAccessible = true
        method.invoke(service, stationary)
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
        motionlessTimeoutMinutes: Int = 10,
        heartbeatEnabled: Boolean = false,
        heartbeatIntervalMinutes: Int = 15
    ) = GeofenceHelper.Geofence(
        name, lat, lon, radius, pauseOnWifi, pauseOnMotionless, motionlessTimeoutMinutes,
        heartbeatEnabled, heartbeatIntervalMinutes
    )

    private fun invokeRemainingHeartbeatDelay(intervalMinutes: Int): Long {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "remainingHeartbeatDelay", Int::class.java
        )
        method.isAccessible = true
        return method.invoke(service, intervalMinutes) as Long
    }

    private fun invokeStartHeartbeat(intervalMinutes: Int, firstDelayMs: Long) {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "startHeartbeat", Int::class.java, Long::class.java
        )
        method.isAccessible = true
        method.invoke(service, intervalMinutes, firstDelayMs)
    }

    private fun invokeCancelHeartbeat() {
        val method = LocationForegroundService::class.java.getDeclaredMethod("cancelHeartbeat")
        method.isAccessible = true
        method.invoke(service)
    }

    private fun invokeGeofenceHeartbeatFired(shouldBeTracking: Boolean = true) {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "handleGeofenceHeartbeatFired", Boolean::class.java
        )
        method.isAccessible = true
        method.invoke(service, shouldBeTracking)
    }

    private fun invokeRecordHeartbeatLocation() = runBlocking {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "recordHeartbeatLocation", kotlin.coroutines.Continuation::class.java
        )
        method.isAccessible = true
        suspendCancellableCoroutine<Unit> { cont ->
            val result = method.invoke(service, cont)
            if (result !== kotlin.coroutines.intrinsics.COROUTINE_SUSPENDED) {
                cont.resumeWith(Result.success(Unit))
            }
        }
    }

    private fun invokeLoadConfigFromIntent(intent: Intent?) {
        val method = LocationForegroundService::class.java.getDeclaredMethod(
            "loadConfigFromIntent", Intent::class.java
        )
        method.isAccessible = true
        method.invoke(service, intent)
    }

    @Test
    fun `loadConfigFromIntent masks endpoint URL when logging config`() {
        mockkObject(ServiceConfig.Companion)
        try {
            every { ServiceConfig.fromDatabase(any()) } returns ServiceConfig(
                endpoint = "https://example.com/api?token=secret123"
            )
            every { AppLogger.maskSensitiveUrlValues(any()) } returns "https://example.com/api?token=secr***"

            val messages = mutableListOf<String>()
            every { AppLogger.d(any(), capture(messages)) } just Runs

            invokeLoadConfigFromIntent(null)

            val configLine = messages.firstOrNull { it.startsWith("Config loaded:") }
            assertNotNull("expected a 'Config loaded' log line", configLine)
            verify { AppLogger.maskSensitiveUrlValues("https://example.com/api?token=secret123") }
            assertTrue("endpoint must be the masked value", configLine!!.contains("endpoint=https://example.com/api?token=secr***"))
            assertFalse("raw credential must not be logged", configLine.contains("secret123"))
        } finally {
            unmockkObject(ServiceConfig.Companion)
        }
    }

    private val homeGeofence = geofence("Home", 52.50, 13.40, 150.0)
    private val officeGeofence = geofence("Office", 48.14, 11.58, 200.0)
    private val parkGeofence = geofence("Park", 52.51, 13.35, 100.0)
}
