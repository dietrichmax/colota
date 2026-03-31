/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.app.*
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import com.Colota.bridge.LocationServiceModule
import com.Colota.util.AppLogger
import com.Colota.data.DatabaseHelper
import com.Colota.data.GeofenceHelper
import com.Colota.data.ProfileHelper
import com.Colota.sync.NetworkManager
import com.Colota.sync.PayloadBuilder
import com.Colota.sync.SyncManager
import com.Colota.util.DeviceInfoHelper
import com.Colota.util.SecureStorageHelper
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.*
import androidx.core.app.ServiceCompat
import com.Colota.location.LocationProvider
import com.Colota.location.LocationProviderFactory
import com.Colota.location.LocationUpdateCallback
import kotlinx.coroutines.*
import java.util.Locale

/** Foreground service for continuous GPS tracking and location syncing. */
class LocationForegroundService : Service() {

    private lateinit var locationProvider: LocationProvider
    private lateinit var notificationManager: NotificationManager
    private lateinit var notificationHelper: NotificationHelper
    private lateinit var dbHelper: DatabaseHelper
    private lateinit var payloadBuilder: PayloadBuilder
    private lateinit var deviceInfoHelper: DeviceInfoHelper
    private lateinit var networkManager: NetworkManager
    private lateinit var geofenceHelper: GeofenceHelper
    private lateinit var secureStorage: SecureStorageHelper
    private lateinit var syncManager: SyncManager
    private lateinit var profileHelper: ProfileHelper
    private lateinit var profileManager: ProfileManager
    private lateinit var conditionMonitor: ConditionMonitor

    @Volatile private var serviceScope: CoroutineScope? = null
    @Volatile private var locationUpdateCallback: LocationUpdateCallback? = null
    @Volatile private var locationRestartJob: Job? = null
    @Volatile private var motionDetector: MotionDetector? = null
    @Volatile private var insidePauseZone = false
    @Volatile private var isWifiPaused = false
    // Accessed exclusively on the main thread - @Volatile not needed and would be misleading
    private var unmeteredNetworkCount = 0
    @Volatile private var wifiCallback: ConnectivityManager.NetworkCallback? = null
    @Volatile private var wifiResumeJob: Job? = null
    @Volatile private var isMotionlessPaused = false
    @Volatile private var motionlessJob: Job? = null
    @Volatile private var currentZoneName: String? = null
    @Volatile private var currentZoneGeofence: GeofenceHelper.CachedGeofence? = null
    @Volatile private var lastKnownLocation: android.location.Location? = null
    @Volatile private var entryDelayJob: Job? = null
    @Volatile private var pendingPauseZone: GeofenceHelper.CachedGeofence? = null

    @Volatile private lateinit var config: ServiceConfig
    @Volatile private var fieldMap: Map<String, String>? = null
    @Volatile private var customFields: Map<String, String>? = null

    companion object {
        private const val TAG = "LocationService"
        /** Multiplier applied to the tracking interval for the geofence entry delay. */
        private const val ENTRY_DELAY_MULTIPLIER = 3.5
        /** Debounce before resuming GPS after unmetered network is lost (ms). */
        private const val WIFI_RESUME_DEBOUNCE_MS = 15_000L
        const val ACTION_MANUAL_FLUSH = "com.Colota.ACTION_MANUAL_FLUSH"
        const val ACTION_RECHECK_ZONE = "com.Colota.RECHECK_PAUSE_ZONE"
        const val ACTION_REFRESH_NOTIFICATION = "com.Colota.REFRESH_NOTIFICATION"
        const val ACTION_RECHECK_PROFILES = "com.Colota.RECHECK_PROFILES"

        /** Actions that skip config reload and preserve current notification state. */
        private val LIGHTWEIGHT_ACTIONS = setOf(
            ACTION_MANUAL_FLUSH,
            ACTION_RECHECK_ZONE,
            ACTION_REFRESH_NOTIFICATION,
            ACTION_RECHECK_PROFILES
        )
    }

    override fun onCreate() {
        super.onCreate()

        serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

        locationProvider = LocationProviderFactory.create(this)
        notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        dbHelper = DatabaseHelper.getInstance(this)
        payloadBuilder = PayloadBuilder()
        deviceInfoHelper = DeviceInfoHelper(this)
        networkManager = NetworkManager(this)
        geofenceHelper = GeofenceHelper(this)
        secureStorage = SecureStorageHelper.getInstance(this)
        syncManager = SyncManager(dbHelper, networkManager, serviceScope!!)
        profileHelper = ProfileHelper(this)
        profileManager = ProfileManager(
            profileHelper, serviceScope!!,
            onConfigSwitch = { interval, distance, syncInterval, _, _ ->
                applyProfileConfig(interval, distance, syncInterval)
            },
            onStationaryChanged = ::handleStationaryChanged
        )
        conditionMonitor = ConditionMonitor(this, profileManager)

        notificationHelper = NotificationHelper(this, notificationManager)
        notificationHelper.createChannel()

        motionDetector = MotionDetector(this) { onMotionDetected() }

        AppLogger.d(TAG, "Service created - provider: ${locationProvider.javaClass.simpleName}, motionSensor=${motionDetector?.isAvailable}")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!::dbHelper.isInitialized) {
            dbHelper = DatabaseHelper.getInstance(this)
        }

        val savedSettings = dbHelper.getAllSettings()
        val shouldBeTracking = savedSettings["tracking_enabled"]?.toBoolean() ?: false

        // intent == null: Android restarted the service after OOM kill
        if (intent == null && !shouldBeTracking) {
            AppLogger.d(TAG, "System restart prevented")
            stopSelf()
            return START_NOT_STICKY
        }

        val action = intent?.action
        val isLightweight = action in LIGHTWEIGHT_ACTIONS

        AppLogger.d(TAG, "onStartCommand: action=${action ?: "START"}, lightweight=$isLightweight")

        // Skip config reload for lightweight actions, but if the service was
        // killed and restarted by one, load from DB so SyncManager has an endpoint.
        if (!isLightweight) {
            loadConfigFromIntent(intent)
        } else if (!::config.isInitialized) {
            loadConfigFromIntent(null)
        }

        // Restore pause zone state so a restart without a cached location fix doesn't incorrectly resume tracking
        if (!insidePauseZone) {
            val savedZone = savedSettings["pause_zone_name"]
            if (!savedZone.isNullOrBlank()) {
                insidePauseZone = true
                currentZoneName = savedZone
                val restoredGeofence = geofenceHelper.getGeofenceByName(savedZone)
                currentZoneGeofence = restoredGeofence
                AppLogger.d(TAG, "Restored pause zone state: $savedZone")
                if (restoredGeofence?.pauseOnWifi == true) {
                    // registerWifiPause() also sets isWifiPaused if currently on unmetered network,
                    // which prevents setupLocationUpdates() from starting GPS unnecessarily.
                    registerWifiPause()
                }
                if (savedSettings["pause_zone_motionless_active"]?.toBoolean() == true) {
                    isMotionlessPaused = true
                    motionDetector?.arm()
                    AppLogger.d(TAG, "Restored motionless pause state")
                }
            }
        }

        // Must call startForeground within 5s
        val initialStatus = notificationHelper.getInitialStatus(
            insidePauseZone, currentZoneName, lastKnownLocation
        )
        val initialTitle = notificationHelper.buildTitle(
            if (::profileManager.isInitialized) profileManager.getActiveProfileName() else null
        )
        try {
            ServiceCompat.startForeground(
                this,
                NotificationHelper.NOTIFICATION_ID,
                notificationHelper.buildTrackingNotification(initialTitle, initialStatus),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            )
        } catch (e: Exception) {
            AppLogger.e(TAG, "Cannot start foreground service - background start restricted", e)
            stopSelf()
            return START_NOT_STICKY
        }

        if (!isLightweight) {
            dbHelper.saveSetting("tracking_enabled", "true")
        }

        when (action) {
            ACTION_REFRESH_NOTIFICATION -> {
                syncManager.invalidateQueueCache()
                val loc = lastKnownLocation
                updateNotification(
                    lat = loc?.latitude,
                    lon = loc?.longitude,
                    forceUpdate = true
                )
                return START_STICKY
            }
            ACTION_RECHECK_ZONE -> {
                handleZoneRecheckAction()
                return START_STICKY
            }
            ACTION_RECHECK_PROFILES -> {
                profileManager.invalidateProfiles()
                conditionMonitor.start()
                profileManager.evaluate()
                return START_STICKY
            }
            ACTION_MANUAL_FLUSH -> {
                serviceScope?.launch {
                    syncManager.manualFlush()
                }
                return START_STICKY
            }
            else -> {
                locationRestartJob?.cancel()
                locationRestartJob = serviceScope?.launch {
                    withContext(Dispatchers.Main) {
                        stopLocationUpdates()
                        syncManager.stopPeriodicSync()

                        setupLocationUpdates()
                        syncManager.startPeriodicSync()

                        // Start after setup so profile evaluations don't race
                        // with setupLocationUpdates above
                        conditionMonitor.start()
                    }

                    if (!config.isOfflineMode && config.syncIntervalSeconds == 0 && config.endpoint.isNotBlank() &&
                        !(config.isWifiOnlySync && !networkManager.isUnmeteredConnection())) {
                        syncManager.manualFlush()
                    }
                }
            }
        }

        return START_STICKY
    }

    override fun onDestroy() {
        AppLogger.d(TAG, "Service destroyed")

        motionDetector?.disarm()
        entryDelayJob?.cancel()
        entryDelayJob = null
        pendingPauseZone = null
        unregisterWifiPause()
        cancelMotionlessCountdown()
        conditionMonitor.stop()
        stopLocationUpdates()
        syncManager.stopPeriodicSync()

        serviceScope?.cancel()
        serviceScope = null

        notificationManager.cancel(NotificationHelper.NOTIFICATION_ID)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun setupLocationUpdates() {
        if (isWifiPaused || isMotionlessPaused) return  // GPS intentionally stopped by a zone pause hold

        val callback = object : LocationUpdateCallback {
            override fun onLocationUpdate(location: android.location.Location) {
                handleLocationUpdate(location)
            }
        }
        locationUpdateCallback = callback

        if (deviceInfoHelper.isBatteryCritical(threshold = 5)) {
            val (level, _) = deviceInfoHelper.getCachedBatteryStatus()
            AppLogger.d(TAG, "Battery critical ($level%) and unplugged - stopping service")
            stopForegroundServiceWithReason("Battery critical")
            return
        }

        AppLogger.d(TAG, "Requesting location updates: interval=${config.interval}ms, distance=${config.minUpdateDistance}m")

        try {
            locationProvider.requestLocationUpdates(
                intervalMs = config.interval,
                minDistanceMeters = config.minUpdateDistance,
                looper = Looper.getMainLooper(),
                callback = callback
            )

            locationProvider.getLastLocation(
                onSuccess = { location ->
                    location?.let {
                        lastKnownLocation = it
                        geofenceHelper.getPauseZone(it)?.let { zone ->
                            enterPauseZone(zone)
                        } ?: run {
                            updateNotification(it.latitude, it.longitude, forceUpdate = true)
                        }
                    }
                },
                onFailure = { /* initial location unavailable, updates will arrive */ }
            )
        } catch (e: SecurityException) {
            AppLogger.e(TAG, "Location permission missing", e)
            stopForegroundServiceWithReason("Location permission missing")
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to start location updates", e)
            stopForegroundServiceWithReason("Location provider error")
        }
    }

    private fun stopLocationUpdates() {
        locationUpdateCallback?.let { locationProvider.removeLocationUpdates(it) }
        locationUpdateCallback = null
    }

    private fun handleZoneRecheckAction() {
        geofenceHelper.invalidateCache()

        val cachedLoc = lastKnownLocation
        val now = System.currentTimeMillis()

        if (cachedLoc != null && (now - cachedLoc.time) < 60_000) {
            recheckZoneWithLocation(cachedLoc)
        } else {
            locationProvider.getLastLocation(
                onSuccess = { location ->
                    if (location != null) {
                        lastKnownLocation = location
                        recheckZoneWithLocation(location)
                    } else {
                        if (insidePauseZone) {
                            AppLogger.d(TAG, "No location for recheck, forcing exit from zone")
                            exitPauseZone()
                        }
                    }
                },
                onFailure = { e ->
                    AppLogger.e(TAG, "Recheck error", e)
                    if (insidePauseZone) {
                        exitPauseZone()
                    }
                }
            )
        }
    }


    private fun recheckZoneWithLocation(location: android.location.Location) {
        val zone = geofenceHelper.getPauseZone(location)

        // Already inside this zone - refresh settings in case they changed via editor
        if (zone != null && insidePauseZone && zone.name == currentZoneName) {
            applyZoneSettingsIfChanged(zone)
            updateNotification(
                lat = location.latitude,
                lon = location.longitude,
                pausedInZone = true,
                zoneName = currentZoneName,
                forceUpdate = true
            )
            return
        }

        applyZoneTransition(zone)

        if (zone == null && !insidePauseZone && pendingPauseZone == null) {
            updateNotification(
                location.latitude,
                location.longitude,
                forceUpdate = true
            )
        }
    }

    /**
     * Re-applies WiFi/motionless pause settings from a freshly loaded zone object.
     * Called on RECHECK when already inside the zone so editor changes take effect immediately.
     */
    private fun applyZoneSettingsIfChanged(zone: GeofenceHelper.CachedGeofence) {
        val timeoutChanged = currentZoneGeofence?.motionlessTimeoutMinutes != zone.motionlessTimeoutMinutes
        currentZoneGeofence = zone

        if (zone.pauseOnWifi && wifiCallback == null) {
            registerWifiPause()
        } else if (!zone.pauseOnWifi) {
            if (isWifiPaused) {
                isWifiPaused = false
                maybeResumeGps()
            }
            unregisterWifiPause()
        }

        if (zone.pauseOnMotionless && !isMotionlessPaused && (motionlessJob == null || timeoutChanged)) {
            if (timeoutChanged) cancelMotionlessCountdown()
            startMotionlessCountdown(zone.motionlessTimeoutMinutes)
        } else if (!zone.pauseOnMotionless) {
            cancelMotionlessCountdown()
            if (isMotionlessPaused) {
                clearMotionlessPauseState()
                maybeResumeGps()
            }
        }
    }

    /**
     * Applies zone entry/exit state transitions common to both live location updates
     * and manual zone rechecks. Returns the anchor [Job] if a zone exit was triggered.
     */
    private fun applyZoneTransition(zone: GeofenceHelper.CachedGeofence?): Job? {
        return when {
            zone != null && (!insidePauseZone || zone.name != currentZoneName) -> {
                if (pendingPauseZone?.name != zone.name) startEntryDelay(zone)
                null
            }
            zone == null && pendingPauseZone != null -> { cancelEntryDelay(); null }
            zone == null && insidePauseZone -> exitPauseZone()
            else -> null
        }
    }

    /** Derives speed from consecutive GPS points when the device doesn't report it. */
    private fun applySpeedFallback(location: android.location.Location) {
        if (location.hasSpeed()) return

        val prev = lastKnownLocation ?: return

        val timeDeltaMs = location.time - prev.time
        if (timeDeltaMs < 1000 || timeDeltaMs > 60_000) return

        val distanceMeters = prev.distanceTo(location)
        val calculatedSpeed = distanceMeters / (timeDeltaMs / 1000.0f)

        if (calculatedSpeed > 278f) return  // ~1000 km/h, reject GPS jitter

        location.speed = calculatedSpeed
    }

    private fun handleLocationUpdate(location: android.location.Location) {
        if (config.filterInaccurateLocations && location.accuracy > config.accuracyThreshold) {
            AppLogger.d(TAG, "Location filtered: accuracy ${location.accuracy}m > threshold ${config.accuracyThreshold}m")
            return
        }

        // Deduplicate: FLP can redeliver the same fix to a newly registered listener
        val prev = lastKnownLocation
        if (prev != null && location.time == prev.time
            && location.latitude == prev.latitude
            && location.longitude == prev.longitude) {
            AppLogger.d(TAG, "Duplicate location skipped (same timestamp and coords)")
            return
        }

        applySpeedFallback(location)

        // Before distance filter so stationary locations still update the speed buffer
        profileManager.onLocationUpdate(location)

        // Software-side distance filter (FLP bypasses the OS-level distance filter for some fixes)
        // Bypassed during geofence entry delay so stationary arrival points are logged
        if (pendingPauseZone == null && config.minUpdateDistance > 0f && prev != null) {
            val distance = prev.distanceTo(location)
            if (distance < config.minUpdateDistance) {
                AppLogger.d(TAG, "Location filtered: distance ${String.format(Locale.US, "%.1f", distance)}m < threshold ${config.minUpdateDistance}m")
                return
            }
        }

        AppLogger.d(TAG, "Location received: acc=${location.accuracy}m provider=${location.provider}")

        lastKnownLocation = location

        val zone = geofenceHelper.getPauseZone(location)
        if (zone != null && insidePauseZone && zone.name == currentZoneName) {
            // Send position to UI so the map stays current while paused
            val (bat, batStatus) = deviceInfoHelper.getCachedBatteryStatus()
            LocationServiceModule.sendLocationEvent(location, bat, batStatus)
            return
        }
        val anchorJob = applyZoneTransition(zone)

        val (battery, batteryStatus) = deviceInfoHelper.getCachedBatteryStatus()

        if (deviceInfoHelper.isBatteryCritical()) {
            AppLogger.d(TAG, "Battery critical ($battery%) during tracking - stopping")
            stopForegroundServiceWithReason("Battery critical")
            return
        }

        val timestampSec = location.time / 1000
        val currentFieldMap = fieldMap ?: emptyMap()

        serviceScope?.launch {
            anchorJob?.join()
            val locationId = dbHelper.saveLocation(
                latitude = location.latitude,
                longitude = location.longitude,
                accuracy = location.accuracy.toDouble(),
                altitude = if (location.hasAltitude()) location.altitude.toInt() else null,
                speed = if (location.hasSpeed()) location.speed.toDouble() else null,
                bearing = if (location.hasBearing()) location.bearing.toDouble() else 0.0,
                battery = battery,
                battery_status = batteryStatus,
                timestamp = timestampSec,
                endpoint = config.endpoint
            )

            LocationServiceModule.sendLocationEvent(location, battery, batteryStatus)

            val payload = payloadBuilder.buildPayload(
                location,
                battery,
                batteryStatus,
                // emptyMap() keeps internal field names (lat/lon/vel/bear/...) so buildTraccarJsonPayload can read them directly
                if (config.apiFormat == NetworkManager.FORMAT_TRACCAR_JSON) emptyMap() else currentFieldMap,
                timestampSec,
                customFields
            )

            syncManager.queueAndSend(locationId, payload)

            withContext(Dispatchers.Main) {
                updateNotification(location.latitude, location.longitude)
            }
        }
    }

    /**
     * Starts a delay of 3.5 tracking intervals before pausing GPS on geofence entry.
     * Real GPS locations continue to be logged during the delay, giving backends
     * like GeoPulse enough arrival points for reliable trip detection.
     * If the device exits the zone before the delay completes, the delay is cancelled.
     */
    private fun startEntryDelay(geofence: GeofenceHelper.CachedGeofence) {
        entryDelayJob?.cancel()
        pendingPauseZone = geofence

        val scope = serviceScope ?: run {
            AppLogger.w(TAG, "Cannot start entry delay for '${geofence.name}' - service scope is null")
            pendingPauseZone = null
            return
        }

        val delayMs = (config.interval * ENTRY_DELAY_MULTIPLIER).toLong()
        AppLogger.d(TAG, "Geofence entry delay started for '${geofence.name}': ${delayMs}ms (${delayMs / 1000.0}s)")

        entryDelayJob = scope.launch {
            delay(delayMs)
            withContext(Dispatchers.Main) {
                if (pendingPauseZone?.name == geofence.name) {
                    pendingPauseZone = null
                    enterPauseZone(geofence)
                }
            }
        }
    }

    private fun cancelEntryDelay() {
        entryDelayJob?.cancel()
        entryDelayJob = null
        val zone = pendingPauseZone
        pendingPauseZone = null
        AppLogger.d(TAG, "Entry delay cancelled - left zone '${zone?.name}' before delay completed")

        val loc = lastKnownLocation
        updateNotification(lat = loc?.latitude, lon = loc?.longitude, forceUpdate = true)
    }

    private fun enterPauseZone(geofence: GeofenceHelper.CachedGeofence) {
        insidePauseZone = true
        currentZoneName = geofence.name
        currentZoneGeofence = geofence
        dbHelper.saveSetting("pause_zone_name", geofence.name)

        val loc = lastKnownLocation
        updateNotification(
            lat = loc?.latitude,
            lon = loc?.longitude,
            pausedInZone = true,
            zoneName = geofence.name,
            forceUpdate = true
        )

        LocationServiceModule.sendPauseZoneEvent(true, geofence.name)

        if (geofence.pauseOnWifi) registerWifiPause()
        if (geofence.pauseOnMotionless) startMotionlessCountdown(geofence.motionlessTimeoutMinutes)

        profileManager.clearSpeedBuffer()

        AppLogger.d(TAG, "Entered pause zone: ${geofence.name}")
    }


    private fun exitPauseZone(): Job? {
        val exitedGeofence = currentZoneGeofence
        val exitedName = currentZoneName

        insidePauseZone = false
        currentZoneName = null
        currentZoneGeofence = null
        dbHelper.saveSetting("pause_zone_name", "")
        val wasWifiPaused = isWifiPaused
        val wasMotionlessPaused = isMotionlessPaused
        isWifiPaused = false
        unregisterWifiPause()
        cancelMotionlessCountdown()
        clearMotionlessPauseState()

        val anchorJob = exitedGeofence?.let { saveAnchorPoint(it) }

        // Resume GPS if it was stopped by any zone pause hold
        if (wasWifiPaused || wasMotionlessPaused) setupLocationUpdates()

        val loc = lastKnownLocation
        updateNotification(lat = loc?.latitude, lon = loc?.longitude, forceUpdate = true)

        LocationServiceModule.sendPauseZoneEvent(false, exitedName)
        AppLogger.d(TAG, "Exited pause zone: $exitedName")

        return anchorJob
    }

    // ── WiFi pause ────────────────────────────────────────────────────────

    /**
     * Registers a [ConnectivityManager.NetworkCallback] to monitor unmetered network
     * availability (WiFi/Ethernet) while inside a pause zone with [pauseOnWifi] enabled.
     * GPS is stopped immediately if already on an unmetered network, and resumed
     * (after a [WIFI_RESUME_DEBOUNCE_MS] debounce) when the network is lost.
     *
     * Must only be called from the main thread. Callbacks are delivered on the main thread.
     */
    private fun registerWifiPause() {
        unregisterWifiPause() // clean up any stale callback

        val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
            .build()

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                wifiResumeJob?.cancel()
                wifiResumeJob = null
                unmeteredNetworkCount++
                if (!isWifiPaused) {
                    isWifiPaused = true
                    stopLocationUpdates()
                    updateNotification(forceUpdate = true)
                    LocationServiceModule.sendPauseZoneEvent(true, currentZoneName, "wifi")
                    AppLogger.i(TAG, "Unmetered network available - WiFi pause active (networks=$unmeteredNetworkCount)")
                }
            }

            override fun onLost(network: Network) {
                unmeteredNetworkCount = maxOf(0, unmeteredNetworkCount - 1)
                if (!isWifiPaused || unmeteredNetworkCount > 0) return
                AppLogger.i(TAG, "Unmetered network lost - resuming GPS in ${WIFI_RESUME_DEBOUNCE_MS / 1000}s")
                wifiResumeJob?.cancel()
                wifiResumeJob = serviceScope?.launch {
                    delay(WIFI_RESUME_DEBOUNCE_MS)
                    withContext(Dispatchers.Main) {
                        if (isWifiPaused && unmeteredNetworkCount == 0) {
                            isWifiPaused = false
                            maybeResumeGps()
                            LocationServiceModule.sendPauseZoneEvent(true, currentZoneName, if (isMotionlessPaused) "motionless" else null)
                            AppLogger.i(TAG, "GPS resumed after unmetered network lost")
                        }
                    }
                }
            }
        }

        try {
            cm.registerNetworkCallback(request, callback, Handler(Looper.getMainLooper()))
            wifiCallback = callback
            // onAvailable fires immediately for already-active networks, so no manual initial check needed
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to register network callback", e)
        }
    }

    private fun unregisterWifiPause() {
        wifiResumeJob?.cancel()
        wifiResumeJob = null
        unmeteredNetworkCount = 0
        val cb = wifiCallback ?: return
        wifiCallback = null
        try {
            val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
            cm.unregisterNetworkCallback(cb)
        } catch (_: Exception) {}
    }

    // ── Motionless pause ──────────────────────────────────────────────────

    /**
     * Starts the motionless timeout countdown for a zone with [pauseOnMotionless] enabled.
     * When the countdown completes without significant motion, GPS is stopped and the
     * motion sensor is armed to resume it when the device moves again.
     */
    private fun startMotionlessCountdown(timeoutMinutes: Int) {
        motionlessJob?.cancel()
        motionlessJob = serviceScope?.launch {
            delay(timeoutMinutes * 60_000L)
            withContext(Dispatchers.Main) {
                motionlessJob = null
                if (insidePauseZone && !isMotionlessPaused) {
                    isMotionlessPaused = true
                    dbHelper.saveSetting("pause_zone_motionless_active", "true")
                    stopLocationUpdates()
                    motionDetector?.arm()
                    updateNotification(forceUpdate = true)
                    LocationServiceModule.sendPauseZoneEvent(true, currentZoneName, "motionless")
                    AppLogger.i(TAG, "Motionless timeout reached - GPS paused, motion sensor armed")
                }
            }
        }
    }

    private fun cancelMotionlessCountdown() {
        motionlessJob?.cancel()
        motionlessJob = null
    }

    private fun clearMotionlessPauseState() {
        isMotionlessPaused = false
        dbHelper.saveSetting("pause_zone_motionless_active", "false")
        if (!profileManager.isStationary) motionDetector?.disarm()
    }

    /**
     * Resumes GPS after motion is detected in a motionless-paused zone.
     * Re-arms the countdown so the zone can pause again if device becomes stationary again.
     */
    private fun resumeFromMotionlessPause() {
        clearMotionlessPauseState()
        val geofence = currentZoneGeofence
        maybeResumeGps()
        LocationServiceModule.sendPauseZoneEvent(true, currentZoneName, if (isWifiPaused) "wifi" else null)
        // Restart countdown so the zone can pause again if device becomes stationary
        if (geofence?.pauseOnMotionless == true) {
            startMotionlessCountdown(geofence.motionlessTimeoutMinutes)
        }
        AppLogger.i(TAG, "Motion detected in pause zone - motionless hold cleared")
    }

    /**
     * Resumes GPS only if no pause holds are active.
     * Use this instead of calling [setupLocationUpdates] directly in WiFi/motionless resume paths.
     */
    private fun maybeResumeGps() {
        val geofence = currentZoneGeofence ?: run { setupLocationUpdates(); updateNotification(forceUpdate = true); return }
        val wifiHold = geofence.pauseOnWifi && isWifiPaused
        val motionHold = geofence.pauseOnMotionless && isMotionlessPaused
        if (!wifiHold && !motionHold) {
            AppLogger.i(TAG, "GPS resumed - all pause holds cleared")
            setupLocationUpdates()
            updateNotification(forceUpdate = true)
        } else {
            AppLogger.i(TAG, "GPS still held: wifi=$wifiHold motionless=$motionHold")
        }
    }

    /** Logs a synthetic location at the geofence center on zone exit to give the departing trip a clean start point. */
    private fun saveAnchorPoint(geofence: GeofenceHelper.CachedGeofence): Job? {
        if (!::config.isInitialized) {
            AppLogger.w(TAG, "Config not yet initialized, skipping anchor point for '${geofence.name}'")
            return null
        }

        val lastFix = lastKnownLocation
        val anchorTimeMs = if (lastFix != null) lastFix.time - 1000 else System.currentTimeMillis()
        val anchorTimeSec = anchorTimeMs / 1000

        val (battery, batteryStatus) = deviceInfoHelper.getCachedBatteryStatus()
        val currentFieldMap = fieldMap ?: emptyMap()

        val syntheticLocation = android.location.Location("geofence").apply {
            latitude = geofence.lat
            longitude = geofence.lon
            accuracy = geofence.radius.toFloat()
            time = anchorTimeMs
        }

        return serviceScope?.launch {
            val locationId = dbHelper.saveLocation(
                latitude = geofence.lat,
                longitude = geofence.lon,
                accuracy = geofence.radius,
                altitude = null,
                speed = null,
                bearing = null,
                battery = battery,
                battery_status = batteryStatus,
                timestamp = anchorTimeSec,
                endpoint = config.endpoint
            )

            val payload = payloadBuilder.buildPayload(
                syntheticLocation,
                battery,
                batteryStatus,
                // emptyMap() keeps internal field names (lat/lon/vel/bear/...) so buildTraccarJsonPayload can read them directly
                if (config.apiFormat == NetworkManager.FORMAT_TRACCAR_JSON) emptyMap() else currentFieldMap,
                anchorTimeSec,
                customFields
            )

            syncManager.queueAndSend(locationId, payload)

            AppLogger.d(TAG, "Anchor point saved at geofence '${geofence.name}' center")
        }
    }

    private fun updateNotification(
        lat: Double? = null,
        lon: Double? = null,
        pausedInZone: Boolean = false,
        zoneName: String? = null,
        forceUpdate: Boolean = false
    ) {
        val isCurrentlyPaused = pausedInZone || insidePauseZone
        val activeZone = zoneName ?: currentZoneName

        val offline = ::config.isInitialized && config.isOfflineMode
        notificationHelper.update(
            lat = lat,
            lon = lon,
            isPaused = isCurrentlyPaused,
            zoneName = activeZone,
            queuedCount = if (offline) 0 else syncManager.getCachedQueuedCount(),
            lastSyncTime = if (offline) 0L else syncManager.lastSuccessfulSyncTime,
            activeProfileName = profileManager.getActiveProfileName(),
            forceUpdate = forceUpdate,
            isOfflineMode = offline,
            isStationary = profileManager.isStationary,
            isWifiPaused = isWifiPaused,
            isMotionlessPaused = isMotionlessPaused
        )
    }

    private fun stopForegroundServiceWithReason(reason: String) {
        AppLogger.i(TAG, "Stopping: $reason")

        // Reset profile indicator in JS UI
        if (profileManager.getActiveProfileName() != null) {
            LocationServiceModule.sendProfileSwitchEvent(null, null)
        }

        LocationServiceModule.sendTrackingStoppedEvent(reason)
        dbHelper.saveSetting("tracking_enabled", "false")
        dbHelper.saveSetting("pause_zone_name", "")
        dbHelper.saveSetting("pause_zone_motionless_active", "false")

        stopForeground(Service.STOP_FOREGROUND_DETACH)

        notificationManager.notify(
            NotificationHelper.NOTIFICATION_ID,
            notificationHelper.buildStoppedNotification(reason)
        )

        stopLocationUpdates()
        stopSelf()
    }

    /** Called by MotionDetector when the device starts moving again. */
    private fun onMotionDetected() {
        if (isMotionlessPaused) {
            resumeFromMotionlessPause()
        }
        profileManager.onMotionDetected()
    }

    /** Arms or disarms the motion sensor when the stationary profile state changes. */
    private fun handleStationaryChanged(stationary: Boolean) {
        if (stationary) {
            motionDetector?.arm()
        } else if (!isMotionlessPaused) {
            motionDetector?.disarm()
        }
    }

    // ── Profile hot-swap ────────────────────────────────────────────────

    /** Hot-swaps GPS interval and sync config on profile change. */
    private fun applyProfileConfig(interval: Long, distance: Float, syncInterval: Int) {
        config = config.copy(
            interval = interval,
            minUpdateDistance = distance,
            syncIntervalSeconds = syncInterval
        )

        pushConfigToSyncManager()

        // Synchronous restart on Main thread to avoid duplicate locations from
        // the old listener firing during an async coroutine window.
        locationRestartJob?.cancel()
        locationRestartJob = null
        if (pendingPauseZone != null) cancelEntryDelay()
        stopLocationUpdates()
        setupLocationUpdates()

        val loc = lastKnownLocation
        updateNotification(lat = loc?.latitude, lon = loc?.longitude, forceUpdate = true)

        AppLogger.i(TAG, "Profile config applied: ${profileManager.getActiveProfileName() ?: "default"} - interval=${interval}ms, distance=${distance}m, sync=${syncInterval}s")
    }

    private fun pushConfigToSyncManager() {
        syncManager.updateConfig(
            endpoint = config.endpoint,
            syncIntervalSeconds = config.syncIntervalSeconds,
            retryIntervalSeconds = config.retryIntervalSeconds,
            maxRetries = config.maxRetries,
            isOfflineMode = config.isOfflineMode,
            isWifiOnlySync = config.isWifiOnlySync,
            authHeaders = secureStorage.getAuthHeaders(),
            httpMethod = config.httpMethod,
            apiFormat = config.apiFormat
        )
    }

    private fun loadConfigFromIntent(intent: Intent?) {
        config = if (intent != null) {
            ServiceConfig.fromIntent(intent, dbHelper)
        } else {
            ServiceConfig.fromDatabase(dbHelper)
        }

        pushConfigToSyncManager()

        // Defaults for ProfileManager to revert to when no profile matches
        profileManager.defaultInterval = config.interval
        profileManager.defaultDistance = config.minUpdateDistance
        profileManager.defaultSyncInterval = config.syncIntervalSeconds

        config.fieldMap?.let {
            if (it.isNotBlank()) fieldMap = payloadBuilder.parseFieldMap(it)
        }

        config.customFields?.let {
            if (it.isNotBlank()) customFields = payloadBuilder.parseCustomFields(it)
        }

        AppLogger.d(TAG, buildString {
            append("Config loaded: interval=${config.interval}ms, distance=${config.minUpdateDistance}m, accuracy=${config.accuracyThreshold}m")
            append(", endpoint=${if (config.endpoint.isBlank()) "NOT CONFIGURED" else config.endpoint}")
            append(", offline=${config.isOfflineMode}, sync=${if (config.syncIntervalSeconds == 0) "instant" else "${config.syncIntervalSeconds}s"}")
            if (!fieldMap.isNullOrEmpty()) append(", fieldMap=${fieldMap!!.size} mappings")
        })
    }
}