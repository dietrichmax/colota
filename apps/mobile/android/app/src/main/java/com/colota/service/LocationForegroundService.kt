/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.app.*
import android.content.BroadcastReceiver
import android.content.Context
import android.content.IntentFilter
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import androidx.core.content.ContextCompat
import com.Colota.BuildConfig
import com.Colota.bridge.LocationServiceModule
import com.Colota.util.AppLogger
import com.Colota.data.DatabaseHelper
import com.Colota.data.GeofenceHelper
import com.Colota.data.ProfileHelper
import com.Colota.data.SettingsKeys
import com.Colota.sync.ApiFormat
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
import kotlin.coroutines.resume
import java.util.Locale

/** Foreground service for continuous GPS tracking and location syncing. */
class LocationForegroundService : Service() {

    private lateinit var locationProvider: LocationProvider
    private lateinit var notificationManager: NotificationManager
    private lateinit var notificationHelper: NotificationHelper
    private lateinit var dbHelper: DatabaseHelper
    @Volatile private var payloadFieldMap: Map<String, String> = emptyMap()
    @Volatile private var payloadCustomFields: Map<String, String> = emptyMap()
    private lateinit var deviceInfoHelper: DeviceInfoHelper
    private lateinit var networkManager: NetworkManager
    private lateinit var geofenceHelper: GeofenceHelper
    private lateinit var secureStorage: SecureStorageHelper
    private lateinit var syncManager: SyncManager
    private lateinit var profileHelper: ProfileHelper
    private lateinit var profileManager: ProfileManager
    private lateinit var conditionMonitor: ConditionMonitor

    // ── Service infrastructure ──
    @Volatile private var serviceScope: CoroutineScope? = null
    @Volatile private var locationUpdateCallback: LocationUpdateCallback? = null
    @Volatile private var locationRestartJob: Job? = null
    @Volatile private var trackingHeartbeatJob: Job? = null
    @Volatile private var lastFixAtMs: Long = 0L
    @Volatile private var motionDetector: MotionStateDetector? = null
    @Volatile private var lastKnownLocation: Location? = null

    /** Debounces the burst of PROVIDERS_CHANGED broadcasts when system Location toggles (one per provider). */
    @Volatile private var lastBroadcastLocationEnabled: Boolean = true

    private val locationProvidersReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != LocationManager.PROVIDERS_CHANGED_ACTION) return
            val current = deviceInfoHelper.isLocationEnabled()
            if (current == lastBroadcastLocationEnabled) return
            lastBroadcastLocationEnabled = current
            AppLogger.d(TAG, "Location providers changed: enabled=$current")
            LocationServiceModule.sendLocationStateEvent(current)
            refreshNotificationForCurrentState()
        }
    }

    /** Whether the currently-registered location request bypasses the OS-level distance filter. */
    @Volatile private var lastRequestedBypassOsFilter: Boolean = false

    /**
     * Pause-zone state. Threading contract:
     * - Mutated ONLY on the Main thread. Call sites: onStartCommand, enter/exitPauseZone,
     *   activateWifiPause, unregisterWifiPause, clearMotionlessPauseState, onMotionStateChange,
     *   and the bodies of Main-dispatched coroutines (registerWifiPause's NetworkCallback uses
     *   Main Looper; wifiResumeJob switches to Dispatchers.Main before mutating).
     * - Read from any thread (location callbacks, notification builder, heartbeat IO coroutine).
     *   @Volatile exists for reader visibility, not mutation safety. Do NOT mutate off-Main.
     */
    @Volatile private var insidePauseZone = false
    @Volatile private var currentZoneName: String? = null
    @Volatile private var currentZoneGeofence: GeofenceHelper.Geofence? = null
    @Volatile private var pendingPauseZone: GeofenceHelper.Geofence? = null
    @Volatile private var entryDelayJob: Job? = null
    @Volatile private var heartbeatJob: Job? = null

    // WiFi pause sub-state (same Main-only mutation contract as above)
    @Volatile private var isWifiPaused = false
    @Volatile private var wifiCallback: ConnectivityManager.NetworkCallback? = null
    @Volatile private var wifiResumeJob: Job? = null
    // Main-only reads + writes (no cross-thread reads), so @Volatile is unnecessary here
    private var unmeteredNetworkCount = 0

    // Motionless pause sub-state (same Main-only mutation contract as above)
    @Volatile private var isMotionlessPaused = false

    @Volatile private lateinit var config: ServiceConfig

    companion object {
        private const val TAG = "LocationService"
        /** Multiplier applied to the tracking interval for the geofence entry delay. */
        private const val ENTRY_DELAY_MULTIPLIER = 3.5
        /** Debounce before resuming GPS after unmetered network is lost (ms). */
        private const val WIFI_RESUME_DEBOUNCE_MS = 2_000L
        /** Cadence at which the tracking heartbeat logs time-since-last-fix for diagnostics. */
        private const val TRACKING_HEARTBEAT_INTERVAL_MS = 5 * 60_000L
        const val ACTION_MANUAL_FLUSH = "com.Colota.ACTION_MANUAL_FLUSH"
        const val ACTION_RECHECK_ZONE = "com.Colota.RECHECK_PAUSE_ZONE"
        const val ACTION_REFRESH_NOTIFICATION = "com.Colota.REFRESH_NOTIFICATION"
        const val ACTION_RECHECK_PROFILES = "com.Colota.RECHECK_PROFILES"
        /** Debug-only: directly inject a MotionState transition. `--es state STATIONARY|MOVING`. */
        const val ACTION_DEBUG_FORCE_MOTION = "com.Colota.DEBUG_FORCE_MOTION"

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
        deviceInfoHelper = DeviceInfoHelper(this)
        lastBroadcastLocationEnabled = deviceInfoHelper.isLocationEnabled()
        networkManager = NetworkManager(this)
        geofenceHelper = GeofenceHelper(this)
        secureStorage = SecureStorageHelper.getInstance(this)
        syncManager = SyncManager(dbHelper, networkManager, serviceScope!!)
        profileHelper = ProfileHelper(this)
        profileManager = ProfileManager(
            profileHelper, serviceScope!!,
            onConfigSwitch = { config ->
                applyProfileConfig(config.interval, config.distance, config.syncInterval)
            },
            onStationaryChanged = ::handleStationaryChanged
        )
        conditionMonitor = ConditionMonitor(this, profileManager)

        notificationHelper = NotificationHelper(this, notificationManager)
        notificationHelper.createChannel()

        motionDetector = RawSensorMotionDetector(this) {
            currentZoneGeofence?.motionlessTimeoutMinutes
                ?.let { it.coerceAtLeast(0) * 60_000L }
                ?: RawSensorMotionDetector.DEFAULT_STATIONARY_DWELL_MS
        }

        registerLocationProvidersReceiver()
        registerDebugMotionReceiver()

        AppLogger.d(TAG, "Service created - provider: ${locationProvider.javaClass.simpleName}, motionSensor=${motionDetector?.isAvailable}")
    }

    private fun registerLocationProvidersReceiver() {
        val filter = IntentFilter(LocationManager.PROVIDERS_CHANGED_ACTION)
        ContextCompat.registerReceiver(this, locationProvidersReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    private fun unregisterLocationProvidersReceiver() {
        unregisterReceiver(locationProvidersReceiver)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!::dbHelper.isInitialized) {
            dbHelper = DatabaseHelper.getInstance(this)
        }

        val savedSettings = dbHelper.getAllSettings()
        val shouldBeTracking = savedSettings[SettingsKeys.TRACKING_ENABLED]?.toBoolean() ?: false

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
            val savedZone = savedSettings[SettingsKeys.PAUSE_ZONE_NAME]
            if (!savedZone.isNullOrBlank()) {
                insidePauseZone = true
                currentZoneName = savedZone
                val restoredGeofence = geofenceHelper.getGeofenceByName(savedZone)
                currentZoneGeofence = restoredGeofence
                if (restoredGeofence == null) {
                    AppLogger.w(TAG, "Restored pause zone state: $savedZone (geofence not found in DB - heartbeat/wifi/motionless settings unavailable)")
                } else {
                    AppLogger.d(TAG, "Restored pause zone state: $savedZone (heartbeat=${restoredGeofence.heartbeatEnabled}, wifi=${restoredGeofence.pauseOnWifi}, motionless=${restoredGeofence.pauseOnMotionless})")
                }
                if (restoredGeofence?.pauseOnWifi == true) {
                    // Also sets isWifiPaused synchronously if currently on unmetered network,
                    // so setupLocationUpdates() won't start GPS before onAvailable fires.
                    registerWifiPause()
                }
                if (savedSettings[SettingsKeys.PAUSE_ZONE_MOTIONLESS_ACTIVE]?.toBoolean() == true) {
                    isMotionlessPaused = true
                    AppLogger.d(TAG, "Restored motionless pause state")
                }
                if (restoredGeofence?.heartbeatEnabled == true) {
                    startHeartbeat(restoredGeofence.heartbeatIntervalMinutes)
                    AppLogger.d(TAG, "Restored heartbeat: ${restoredGeofence.heartbeatIntervalMinutes}min")
                }
                ensureMotionDetectorRunning()
            }
        }

        // Must call startForeground within 5s
        val initialStatus = notificationHelper.getInitialStatus(
            insidePauseZone, currentZoneName, lastKnownLocation
        )
        val initialTitle = notificationHelper.buildTitle(
            if (::profileManager.isInitialized) profileManager.getActiveProfileName() else null
        )
        notificationManager.cancel(NotificationHelper.STOPPED_NOTIFICATION_ID)
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
            dbHelper.saveSetting(SettingsKeys.TRACKING_ENABLED, "true")
        }

        when (action) {
            ACTION_REFRESH_NOTIFICATION -> handleRefreshNotification()
            ACTION_RECHECK_ZONE -> handleZoneRecheckAction()
            ACTION_RECHECK_PROFILES -> handleRecheckProfiles()
            ACTION_MANUAL_FLUSH -> handleManualFlush()
            else -> handleStart()
        }

        return START_STICKY
    }

    private fun handleRefreshNotification() {
        syncManager.invalidateQueueCache()
        val loc = lastKnownLocation
        updateNotification(
            lat = loc?.latitude,
            lon = loc?.longitude,
            forceUpdate = true
        )
    }

    private fun handleRecheckProfiles() {
        profileManager.invalidateProfiles()
        conditionMonitor.start()
        profileManager.evaluate()
        // evaluate() may have triggered a profile switch, which already restarts the
        // location request. Compare what is currently registered with what is now needed;
        // only restart when they differ (eg user enabled a speed profile while no profile
        // matches yet, so evaluate() didn't switch anything).
        if (isLocationUpdatesRegistered() && needsLocationStreamForProfiles() != lastRequestedBypassOsFilter) {
            stopLocationUpdates()
            setupLocationUpdates()
        }
    }

    private fun handleManualFlush() {
        serviceScope?.launch {
            syncManager.manualFlush()
        }
    }

    private fun handleStart() {
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
                syncManager.isSyncAllowed()) {
                syncManager.manualFlush()
            }
        }
    }

    override fun onDestroy() {
        AppLogger.d(TAG, "Service destroyed")

        motionDetector?.stop()
        entryDelayJob?.cancel()
        entryDelayJob = null
        pendingPauseZone = null
        unregisterWifiPause()
        cancelHeartbeat()
        unregisterLocationProvidersReceiver()
        unregisterDebugMotionReceiver()
        conditionMonitor.stop()
        stopLocationUpdates()
        syncManager.stopPeriodicSync()
        networkManager.destroy()

        serviceScope?.cancel()
        serviceScope = null

        notificationManager.cancel(NotificationHelper.NOTIFICATION_ID)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun setupLocationUpdates() {
        if (isWifiPaused || isMotionlessPaused) return  // GPS intentionally stopped by a zone pause hold

        val callback = object : LocationUpdateCallback {
            override fun onLocationUpdate(location: Location) {
                lastFixAtMs = SystemClock.elapsedRealtime()
                handleLocationUpdate(location)
            }
        }
        locationUpdateCallback = callback
        lastFixAtMs = SystemClock.elapsedRealtime()

        if (deviceInfoHelper.isBatteryCritical(threshold = 5)) {
            val (level, _) = deviceInfoHelper.getCachedBatteryStatus()
            AppLogger.d(TAG, "Battery critical ($level%) and unplugged - stopping service")
            stopForegroundServiceWithReason("Battery below 5% - tracking paused")
            return
        }

        val bypassOsFilter = needsLocationStreamForProfiles()
        val osMinDistance = if (bypassOsFilter) 0f else config.minUpdateDistance
        
        AppLogger.d(TAG, "Requesting location updates: interval=${config.interval}ms, distance=${config.minUpdateDistance}m, osFilter=${osMinDistance}m")

        try {
            locationProvider.requestLocationUpdates(
                intervalMs = config.interval,
                minDistanceMeters = osMinDistance,
                looper = Looper.getMainLooper(),
                callback = callback
            )
            lastRequestedBypassOsFilter = bypassOsFilter

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

            startTrackingHeartbeatLogger()
        } catch (e: SecurityException) {
            AppLogger.e(TAG, "Location permission missing", e)
            stopForegroundServiceWithReason("Location permission missing")
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to start location updates", e)
            stopForegroundServiceWithReason("Location provider error")
        }
    }

    private fun stopLocationUpdates() {
        cancelTrackingHeartbeatLogger()
        locationUpdateCallback?.let { locationProvider.removeLocationUpdates(it) }
        locationUpdateCallback = null
    }

    /**
     * True when at least one enabled profile's condition depends on the location stream
     * (speed or stationary). When true, [setupLocationUpdates] passes 0m to the OS provider
     * so fixes keep arriving within the configured movement threshold; the software-side
     * filter in [handleLocationUpdate] still enforces it before DB writes and sync.
     */
    private fun needsLocationStreamForProfiles(): Boolean =
        profileManager.getNeededConditionTypes().any { it in ProfileConstants.LOCATION_DEPENDENT_CONDITIONS }

    private fun isLocationUpdatesRegistered(): Boolean = locationUpdateCallback != null

    /**
     * Diagnostic-only periodic logger. Records "time since last GPS fix" every 5 minutes
     * to the activity log so silent stalls (eg stale FLP binding after long uptime) become
     * visible in user-exported logs. Does not take any recovery action - data only.
     */
    private fun startTrackingHeartbeatLogger() {
        trackingHeartbeatJob?.cancel()
        val scope = serviceScope ?: return
        trackingHeartbeatJob = scope.launch {
            while (isActive) {
                delay(TRACKING_HEARTBEAT_INTERVAL_MS)
                if (isWifiPaused || isMotionlessPaused) continue
                if (locationUpdateCallback == null) continue
                val sinceLastFix = SystemClock.elapsedRealtime() - lastFixAtMs
                AppLogger.i(TAG, "Tracking alive: ${sinceLastFix / 1000}s since last fix")
            }
        }
    }

    private fun cancelTrackingHeartbeatLogger() {
        trackingHeartbeatJob?.cancel()
        trackingHeartbeatJob = null
    }

    private fun handleZoneRecheckAction() {
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


    private fun recheckZoneWithLocation(location: Location) {
        val zone = geofenceHelper.getPauseZone(location)

        // Already inside this zone - refresh settings in case they changed via editor
        if (zone != null && insidePauseZone && zone.name == currentZoneName) {
            applyZoneSettingsIfChanged(zone)
            updateNotification(
                lat = location.latitude,
                lon = location.longitude,
                forceUpdate = true
            )
            val reason = when {
                isWifiPaused -> "wifi"
                isMotionlessPaused -> "motionless"
                else -> null
            }
            LocationServiceModule.sendPauseZoneEvent(true, currentZoneName, reason)
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
    private fun applyZoneSettingsIfChanged(zone: GeofenceHelper.Geofence) {
        val heartbeatChanged = currentZoneGeofence?.heartbeatIntervalMinutes != zone.heartbeatIntervalMinutes
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

        if (!zone.pauseOnMotionless && isMotionlessPaused) {
            clearMotionlessPauseState()
            maybeResumeGps()
        }
        ensureMotionDetectorRunning()

        if (zone.heartbeatEnabled && (heartbeatJob == null || heartbeatChanged)) {
            startHeartbeat(zone.heartbeatIntervalMinutes)
        } else if (!zone.heartbeatEnabled) {
            cancelHeartbeat()
        }
    }

    /**
     * Applies zone entry/exit state transitions common to both live location updates
     * and manual zone rechecks. Returns the anchor [Job] if a zone exit was triggered.
     */
    private fun applyZoneTransition(zone: GeofenceHelper.Geofence?): Job? {
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
    private fun applySpeedFallback(location: Location) {
        if (location.hasSpeed()) return

        val prev = lastKnownLocation ?: return

        val timeDeltaMs = location.time - prev.time
        if (timeDeltaMs < 1000 || timeDeltaMs > 60_000) return

        val distanceMeters = prev.distanceTo(location)
        val calculatedSpeed = distanceMeters / (timeDeltaMs / 1000.0f)

        if (calculatedSpeed > 278f) return  // ~1000 km/h, reject GPS jitter

        location.speed = calculatedSpeed
    }

    private fun handleLocationUpdate(location: Location) {
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

        // Software-side distance filter. Enforces config.minUpdateDistance for DB/sync
        // regardless of the OS filter (which passes 0m to when a location-dependent
        // profile is enabled). Bypassed during entry delay so arrival points get logged.
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
            stopForegroundServiceWithReason("Battery below 5% - tracking paused")
            return
        }

        val timestampSec = location.time / 1000

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

            val payload = PayloadBuilder.buildLocationPayload(location, timestampSec, battery, batteryStatus, payloadFieldMap, payloadCustomFields, config.apiFormat)

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
    private fun startEntryDelay(geofence: GeofenceHelper.Geofence) {
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

        refreshNotificationForCurrentState()
    }

    private fun enterPauseZone(geofence: GeofenceHelper.Geofence) {
        insidePauseZone = true
        currentZoneName = geofence.name
        currentZoneGeofence = geofence
        dbHelper.saveSetting(SettingsKeys.PAUSE_ZONE_NAME, geofence.name)

        refreshNotificationForCurrentState()
        LocationServiceModule.sendPauseZoneEvent(true, geofence.name)

        startZoneHolds(geofence)

        profileManager.clearSpeedBuffer()

        // Flush any queued points so the backend shows the arrival position
        if (syncManager.isSyncAllowed()) {
            serviceScope?.launch { syncManager.manualFlush() }
        }

        AppLogger.d(TAG, "Entered pause zone: ${geofence.name} (heartbeat=${geofence.heartbeatEnabled}, wifi=${geofence.pauseOnWifi}, motionless=${geofence.pauseOnMotionless})")
    }


    private fun exitPauseZone(): Job? {
        val exitedGeofence = currentZoneGeofence
        val exitedName = currentZoneName
        val wasWifiPaused = isWifiPaused
        val wasMotionlessPaused = isMotionlessPaused

        insidePauseZone = false
        currentZoneName = null
        currentZoneGeofence = null
        dbHelper.saveSetting(SettingsKeys.PAUSE_ZONE_NAME, "")

        stopZoneHolds()

        val anchorJob = exitedGeofence?.let { saveAnchorPoint(it) }

        // Resume GPS if it was stopped by any zone pause hold
        if (wasWifiPaused || wasMotionlessPaused) setupLocationUpdates()

        refreshNotificationForCurrentState()
        LocationServiceModule.sendPauseZoneEvent(false, exitedName)
        AppLogger.d(TAG, "Exited pause zone: $exitedName")

        return anchorJob
    }

    /**
     * Starts any pause-zone holds (WiFi, motionless, heartbeat) that the zone has enabled.
     * Must stay mirrored with [stopZoneHolds] - when adding a new hold, update both.
     */
    private fun startZoneHolds(zone: GeofenceHelper.Geofence) {
        if (zone.pauseOnWifi) registerWifiPause()
        if (zone.heartbeatEnabled) startHeartbeat(zone.heartbeatIntervalMinutes)
        ensureMotionDetectorRunning()
    }

    /**
     * Stops all pause-zone holds. Safe to call when a hold was never started (each sub-stop is idempotent).
     * Must stay mirrored with [startZoneHolds].
     */
    private fun stopZoneHolds() {
        unregisterWifiPause()
        clearMotionlessPauseState()
        cancelHeartbeat()
        ensureMotionDetectorRunning()
    }

    // ── WiFi pause ────────────────────────────────────────────────────────

    /** Stops GPS and updates state when an unmetered network becomes active. */
    private fun activateWifiPause() {
        isWifiPaused = true
        dbHelper.saveSetting(SettingsKeys.PAUSE_ZONE_WIFI_ACTIVE, "true")
        stopLocationUpdates()
        refreshNotificationForCurrentState()
        LocationServiceModule.sendPauseZoneEvent(true, currentZoneName, "wifi")
        AppLogger.i(TAG, "Unmetered network available - WiFi pause active")
    }

    /**
     * Starts monitoring unmetered network availability for a [pauseOnWifi] zone.
     * Checks current connectivity synchronously on registration since [NetworkCallback.onAvailable]
     * is posted to the main looper and fires too late to block [setupLocationUpdates].
     */
    private fun registerWifiPause() {
        unregisterWifiPause() // clean up any stale callback

        val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager

        // Check current connectivity synchronously - onAvailable fires after this call stack.
        val caps = cm.activeNetwork?.let { cm.getNetworkCapabilities(it) }
        if (caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == true) {
            activateWifiPause()
        }

        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
            .build()

        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                wifiResumeJob?.cancel()
                wifiResumeJob = null
                unmeteredNetworkCount++
                if (!isWifiPaused) {
                    activateWifiPause()
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
                            dbHelper.saveSetting(SettingsKeys.PAUSE_ZONE_WIFI_ACTIVE, "false")
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
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to register network callback", e)
        }
    }

    private fun unregisterWifiPause() {
        wifiResumeJob?.cancel()
        wifiResumeJob = null
        unmeteredNetworkCount = 0
        isWifiPaused = false
        dbHelper.saveSetting(SettingsKeys.PAUSE_ZONE_WIFI_ACTIVE, "false")
        val cb = wifiCallback ?: return
        wifiCallback = null
        try {
            val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
            cm.unregisterNetworkCallback(cb)
        } catch (_: Exception) {}
    }

    // ── Motionless pause ──────────────────────────────────────────────────

    private fun clearMotionlessPauseState() {
        isMotionlessPaused = false
        dbHelper.saveSetting(SettingsKeys.PAUSE_ZONE_MOTIONLESS_ACTIVE, "false")
    }

    /**
     * Starts a heartbeat that sends a location update to the server at a relaxed
     * interval while paused in a geofence zone. Fires one send immediately so the
     * backend sees zone entry without waiting a full interval.
     */
    private fun startHeartbeat(intervalMinutes: Int) {
        cancelHeartbeat()
        AppLogger.i(TAG, "Heartbeat started: ${intervalMinutes}min interval")
        heartbeatJob = serviceScope?.launch {
            sendHeartbeatLocation()
            while (isActive) {
                delay(intervalMinutes * 60_000L)
                sendHeartbeatLocation()
            }
        }
    }

    private fun cancelHeartbeat() {
        if (heartbeatJob == null) return
        heartbeatJob?.cancel()
        heartbeatJob = null
        AppLogger.i(TAG, "Heartbeat cancelled")
    }

    private suspend fun sendHeartbeatLocation() {
        if (config.endpoint.isBlank()) {
            AppLogger.d(TAG, "Heartbeat skipped: no endpoint")
            return
        }

        val zone = currentZoneGeofence
        if (zone == null) {
            AppLogger.d(TAG, "Heartbeat skipped: no current zone")
            return
        }

        if (!syncManager.isSyncAllowed()) {
            AppLogger.d(TAG, "Heartbeat skipped: sync condition not met")
            return
        }

        val location = Location("geofence").apply {
            latitude = zone.lat
            longitude = zone.lon
            accuracy = 0f
            time = System.currentTimeMillis()
        }
        val (battery, batteryStatus) = deviceInfoHelper.getCachedBatteryStatus()
        val timestampSec = location.time / 1000

        val payload = PayloadBuilder.buildLocationPayload(location, timestampSec, battery, batteryStatus, payloadFieldMap, payloadCustomFields, config.apiFormat)

        val sent = networkManager.sendToEndpoint(
            payload, config.endpoint, secureStorage.getAuthHeaders(),
            config.httpMethod, config.apiFormat
        )

        if (sent) {
            // Only persist to DB on successful send
            val locationId = dbHelper.saveLocation(
                latitude = location.latitude,
                longitude = location.longitude,
                accuracy = location.accuracy.toDouble(),
                altitude = if (location.hasAltitude()) location.altitude.toInt() else null,
                speed = 0.0,
                bearing = 0.0,
                battery = battery,
                battery_status = batteryStatus,
                timestamp = timestampSec,
                endpoint = config.endpoint
            )
            dbHelper.markLocationsSent(listOf(locationId))
            LocationServiceModule.sendLocationEvent(location, battery, batteryStatus)
            AppLogger.i(TAG, "Heartbeat sent for zone '${zone.name}'")
        } else {
            AppLogger.d(TAG, "Heartbeat failed: server unreachable, will retry next cycle")
        }
    }

    /**
     * Resumes GPS only if no pause holds are active.
     * Use this instead of calling [setupLocationUpdates] directly in WiFi/motionless resume paths.
     */
    private fun maybeResumeGps() {
        val geofence = currentZoneGeofence ?: run { setupLocationUpdates(); refreshNotificationForCurrentState(); return }
        val wifiHold = geofence.pauseOnWifi && isWifiPaused
        val motionHold = geofence.pauseOnMotionless && isMotionlessPaused
        if (!wifiHold && !motionHold) {
            AppLogger.i(TAG, "GPS resumed - all pause holds cleared")
            setupLocationUpdates()
            refreshNotificationForCurrentState()
        } else {
            AppLogger.i(TAG, "GPS still held: wifi=$wifiHold motionless=$motionHold")
        }
    }

    /** Logs a synthetic location at the geofence center on zone exit to give the departing trip a clean start point. */
    private fun saveAnchorPoint(geofence: GeofenceHelper.Geofence): Job? {
        if (!::config.isInitialized) {
            AppLogger.w(TAG, "Config not yet initialized, skipping anchor point for '${geofence.name}'")
            return null
        }

        val lastFix = lastKnownLocation
        val anchorTimeMs = if (lastFix != null) lastFix.time - 1000 else System.currentTimeMillis()
        val anchorTimeSec = anchorTimeMs / 1000

        val (battery, batteryStatus) = deviceInfoHelper.getCachedBatteryStatus()

        val syntheticLocation = Location("geofence").apply {
            latitude = geofence.lat
            longitude = geofence.lon
            accuracy = 0f
            time = anchorTimeMs
        }

        return serviceScope?.launch {
            val locationId = dbHelper.saveLocation(
                latitude = geofence.lat,
                longitude = geofence.lon,
                accuracy = 0.0,
                altitude = null,
                speed = null,
                bearing = null,
                battery = battery,
                battery_status = batteryStatus,
                timestamp = anchorTimeSec,
                endpoint = config.endpoint
            )

            val payload = PayloadBuilder.buildLocationPayload(syntheticLocation, anchorTimeSec, battery, batteryStatus, payloadFieldMap, payloadCustomFields, config.apiFormat)

            syncManager.queueAndSend(locationId, payload)

            AppLogger.d(TAG, "Anchor point saved at geofence '${geofence.name}' center")
        }
    }

    /**
     * Forces a notification refresh using the current pause/zone state and last known location.
     * Call after any pause-state change (enter/exit zone, wifi/motionless activate/clear, profile swap).
     *
     * Contract: this reads [insidePauseZone], [currentZoneName], and [lastKnownLocation] directly.
     * Callers MUST mutate those fields (and persist pause-state settings when relevant)
     * BEFORE invoking this — order is state → DB → refresh. Refreshing before the state
     * is written will render a stale notification.
     */
    private fun refreshNotificationForCurrentState() {
        val loc = lastKnownLocation
        updateNotification(lat = loc?.latitude, lon = loc?.longitude, forceUpdate = true)
    }

    private fun updateNotification(
        lat: Double? = null,
        lon: Double? = null,
        forceUpdate: Boolean = false
    ) {
        val offline = ::config.isInitialized && config.isOfflineMode
        notificationHelper.update(
            lat = lat,
            lon = lon,
            isPaused = insidePauseZone,
            zoneName = currentZoneName,
            queuedCount = if (offline) 0 else syncManager.getCachedQueuedCount(),
            lastSyncTime = if (offline) 0L else syncManager.lastSuccessfulSyncTime,
            activeProfileName = profileManager.getActiveProfileName(),
            forceUpdate = forceUpdate,
            isOfflineMode = offline,
            isStationary = profileManager.isStationary,
            isWifiPaused = isWifiPaused,
            isMotionlessPaused = isMotionlessPaused,
            locationEnabled = deviceInfoHelper.isLocationEnabled()
        )
    }

    private fun stopForegroundServiceWithReason(reason: String) {
        AppLogger.i(TAG, "Stopping: $reason")

        // Reset profile indicator in JS UI
        if (profileManager.getActiveProfileName() != null) {
            LocationServiceModule.sendProfileSwitchEvent(null, null)
        }

        LocationServiceModule.sendTrackingStoppedEvent(reason)
        dbHelper.saveSetting(SettingsKeys.TRACKING_ENABLED, "false")
        dbHelper.saveSetting(SettingsKeys.PAUSE_ZONE_NAME, "")
        dbHelper.saveSetting(SettingsKeys.PAUSE_ZONE_WIFI_ACTIVE, "false")
        dbHelper.saveSetting(SettingsKeys.PAUSE_ZONE_MOTIONLESS_ACTIVE, "false")

        stopForeground(Service.STOP_FOREGROUND_DETACH)

        notificationManager.notify(
            NotificationHelper.STOPPED_NOTIFICATION_ID,
            notificationHelper.buildStoppedNotification(reason)
        )

        stopLocationUpdates()
        stopSelf()
    }

    /**
     * STATIONARY: pause GPS if inside a `pauseOnMotionless` zone.
     * MOVING: clear motionless pause and notify the profile manager.
     */
    private fun onMotionStateChange(state: MotionState) {
        when (state) {
            MotionState.STATIONARY -> {
                if (insidePauseZone && currentZoneGeofence?.pauseOnMotionless == true && !isMotionlessPaused) {
                    isMotionlessPaused = true
                    dbHelper.saveSetting(SettingsKeys.PAUSE_ZONE_MOTIONLESS_ACTIVE, "true")
                    stopLocationUpdates()
                    refreshNotificationForCurrentState()
                    LocationServiceModule.sendPauseZoneEvent(true, currentZoneName, "motionless")
                    AppLogger.i(TAG, "Motion detector reports STATIONARY in pause zone - GPS paused")
                }
            }
            MotionState.MOVING -> {
                if (isMotionlessPaused) {
                    clearMotionlessPauseState()
                    maybeResumeGps()
                    LocationServiceModule.sendPauseZoneEvent(true, currentZoneName, if (isWifiPaused) "wifi" else null)
                    AppLogger.i(TAG, "Motion detector reports MOVING in pause zone - motionless hold cleared")
                }
                profileManager.onMotionDetected()
                ensureMotionDetectorRunning()
            }
        }
    }

    /** Runs the detector when motionless pause is enabled inside the current zone or the profile is stationary. */
    private fun ensureMotionDetectorRunning() {
        val detector = motionDetector ?: return
        val needForZone = insidePauseZone && currentZoneGeofence?.pauseOnMotionless == true
        val needForProfile = profileManager.isStationary
        if (needForZone || needForProfile) {
            detector.start(::onMotionStateChange)
        } else {
            detector.stop()
        }
    }

    private fun handleStationaryChanged(stationary: Boolean) {
        ensureMotionDetectorRunning()
    }

    // ── Debug-only motion injection (BuildConfig.DEBUG) ───────────────────

    private val debugMotionReceiver = if (BuildConfig.DEBUG) object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != ACTION_DEBUG_FORCE_MOTION) return
            val raw = intent.getStringExtra("state") ?: run {
                AppLogger.w(TAG, "DEBUG_FORCE_MOTION: missing 'state' extra")
                return
            }
            val state = try {
                MotionState.valueOf(raw)
            } catch (_: IllegalArgumentException) {
                AppLogger.w(TAG, "DEBUG_FORCE_MOTION: invalid state '$raw' (expected STATIONARY|MOVING)")
                return
            }
            (motionDetector as? RawSensorMotionDetector)?.forceState(state)
            AppLogger.d(TAG, "DEBUG_FORCE_MOTION -> $state")
        }
    } else null

    private fun registerDebugMotionReceiver() {
        val receiver = debugMotionReceiver ?: return
        ContextCompat.registerReceiver(
            this, receiver, IntentFilter(ACTION_DEBUG_FORCE_MOTION), ContextCompat.RECEIVER_NOT_EXPORTED
        )
    }

    private fun unregisterDebugMotionReceiver() {
        val receiver = debugMotionReceiver ?: return
        try { unregisterReceiver(receiver) } catch (_: IllegalArgumentException) {}
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

        refreshNotificationForCurrentState()

        AppLogger.i(TAG, "Profile config applied: ${profileManager.getActiveProfileName() ?: "default"} - interval=${interval}ms, distance=${distance}m, sync=${syncInterval}s")
    }

    private fun pushConfigToSyncManager() {
        // Instant mode bypasses the queue and posts one flat payload, which 4xxs
        // forever against /api/v1/overland/batches. Defensive net under the UI guard.
        val effectiveFormat = if (config.syncIntervalSeconds == 0 && config.apiFormat == ApiFormat.OVERLAND_BATCH) {
            AppLogger.w(TAG, "Batch mode incompatible with instant sync (interval=0); downgrading to single-point")
            ApiFormat.FIELD_MAPPED
        } else {
            config.apiFormat
        }

        syncManager.updateConfig(
            endpoint = config.endpoint,
            syncIntervalSeconds = config.syncIntervalSeconds,
            retryIntervalSeconds = config.retryIntervalSeconds,
            isOfflineMode = config.isOfflineMode,
            syncCondition = config.syncCondition,
            syncSsid = config.syncSsid,
            authHeaders = secureStorage.getAuthHeaders(),
            httpMethod = config.httpMethod,
            apiFormat = effectiveFormat,
            overlandBatchSize = config.overlandBatchSize
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

        val parsedFieldMap = PayloadBuilder.parseFieldMap(config.fieldMap) ?: emptyMap()
        val parsedCustomFields = PayloadBuilder.parseCustomFields(config.customFields) ?: emptyMap()
        payloadFieldMap = parsedFieldMap
        payloadCustomFields = parsedCustomFields

        AppLogger.d(TAG, buildString {
            append("Config loaded: interval=${config.interval}ms, distance=${config.minUpdateDistance}m, accuracy=${config.accuracyThreshold}m")
            append(", endpoint=${if (config.endpoint.isBlank()) "NOT CONFIGURED" else config.endpoint}")
            append(", offline=${config.isOfflineMode}, sync=${if (config.syncIntervalSeconds == 0) "instant" else "${config.syncIntervalSeconds}s"}")
            if (parsedFieldMap.isNotEmpty()) append(", fieldMap=${parsedFieldMap.size} mappings")
        })
    }
}