/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.app.*
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
    @Volatile private var stationaryJob: Job? = null
    @Volatile private var isStationary = false
    @Volatile private var motionDetector: MotionDetector? = null
    @Volatile private var insidePauseZone = false
    @Volatile private var currentZoneName: String? = null
    @Volatile private var currentZoneGeofence: GeofenceHelper.CachedGeofence? = null
    @Volatile private var lastKnownLocation: android.location.Location? = null

    @Volatile private lateinit var config: ServiceConfig
    @Volatile private var fieldMap: Map<String, String>? = null
    @Volatile private var customFields: Map<String, String>? = null

    companion object {
        private const val TAG = "LocationService"
        /** Speed threshold below which the device is considered stationary (m/s). ~1 km/h */
        private const val STATIONARY_SPEED_THRESHOLD = 0.3f
        /** How long speed must stay below threshold before pausing GPS (ms). */
        private const val STATIONARY_TIMEOUT_MS = 60_000L
        const val ACTION_MANUAL_FLUSH = "com.Colota.ACTION_MANUAL_FLUSH"
        const val ACTION_RECHECK_ZONE = "com.Colota.RECHECK_PAUSE_ZONE"
        const val ACTION_FORCE_EXIT_ZONE = "com.Colota.FORCE_EXIT_ZONE"
        const val ACTION_REFRESH_NOTIFICATION = "com.Colota.REFRESH_NOTIFICATION"
        const val ACTION_RECHECK_PROFILES = "com.Colota.RECHECK_PROFILES"

        /** Actions that skip config reload and preserve current notification state. */
        private val LIGHTWEIGHT_ACTIONS = setOf(
            ACTION_MANUAL_FLUSH,
            ACTION_RECHECK_ZONE,
            ACTION_FORCE_EXIT_ZONE,
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
        profileManager = ProfileManager(profileHelper, serviceScope!!) { interval, distance, syncInterval, _, _ ->
            applyProfileConfig(interval, distance, syncInterval)
        }
        conditionMonitor = ConditionMonitor(this, profileManager)

        notificationHelper = NotificationHelper(this, notificationManager)
        notificationHelper.createChannel()

        motionDetector = MotionDetector(this) { onMotionDetected() }

        AppLogger.enabled = dbHelper.getSetting("debug_mode_enabled")?.toBoolean() ?: false
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

        // Restore pause zone state so restarts don't trigger duplicate anchor points
        if (!insidePauseZone) {
            val savedZone = savedSettings["pause_zone_name"]
            if (!savedZone.isNullOrBlank()) {
                insidePauseZone = true
                currentZoneName = savedZone
                AppLogger.d(TAG, "Restored pause zone state: $savedZone")
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
            ACTION_FORCE_EXIT_ZONE -> {
                if (insidePauseZone) {
                    AppLogger.d(TAG, "Force exit from zone: $currentZoneName")
                    exitPauseZone()
                    lastKnownLocation?.let { recheckZoneWithLocation(it) }
                }
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
        stationaryJob?.cancel()
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

        when {
            zone != null && (!insidePauseZone || zone.name != currentZoneName) -> {
                enterPauseZone(zone)
            }
            zone == null && insidePauseZone -> {
                exitPauseZone()
            }
            // Same zone - refresh notification coords
            zone != null && insidePauseZone && zone.name == currentZoneName -> {
                updateNotification(
                    lat = location.latitude,
                    lon = location.longitude,
                    pausedInZone = true,
                    zoneName = currentZoneName,
                    forceUpdate = true
                )
            }

            else -> {
                updateNotification(
                    location.latitude,
                    location.longitude,
                    forceUpdate = true
                )
            }
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

        // Evaluated before the distance filter so stationary detection works regardless
        // of movement threshold - the distance filter is for recording quality, not motion state.
        evaluateStationaryState(location)

        // Software-side distance filter (FLP bypasses the OS-level distance filter for some fixes)
        if (config.minUpdateDistance > 0f && prev != null) {
            val distance = prev.distanceTo(location)
            if (distance < config.minUpdateDistance) {
                AppLogger.d(TAG, "Location filtered: distance ${String.format(Locale.US, "%.1f", distance)}m < threshold ${config.minUpdateDistance}m")
                return
            }
        }

        AppLogger.d(TAG, "Location received: ${String.format(Locale.US, "%.5f, %.5f", location.latitude, location.longitude)} acc=${location.accuracy}m provider=${location.provider}")

        // After accuracy filter so bad GPS doesn't pollute speed average
        profileManager.onLocationUpdate(location)

        lastKnownLocation = location

        val zone = geofenceHelper.getPauseZone(location)
        var anchorJob: Job? = null
        when {
            zone != null && (!insidePauseZone || zone.name != currentZoneName) -> {
                enterPauseZone(zone)
                return
            }
            zone == null && insidePauseZone -> anchorJob = exitPauseZone()
            zone != null && insidePauseZone -> return
        }

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
                currentFieldMap,
                timestampSec,
                customFields
            )

            syncManager.queueAndSend(locationId, payload)

            withContext(Dispatchers.Main) {
                updateNotification(location.latitude, location.longitude)
            }
        }
    }

    private fun enterPauseZone(geofence: GeofenceHelper.CachedGeofence) {
        if (!insidePauseZone) {
            saveAnchorPoint(geofence)
        }

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

        AppLogger.d(TAG, "Entered pause zone: ${geofence.name}")
    }


    private fun exitPauseZone(): Job? {
        val exitedGeofence = currentZoneGeofence
        val exitedName = currentZoneName

        insidePauseZone = false
        currentZoneName = null
        currentZoneGeofence = null
        dbHelper.saveSetting("pause_zone_name", "")

        val anchorJob = exitedGeofence?.let { saveAnchorPoint(it) }

        val loc = lastKnownLocation
        updateNotification(lat = loc?.latitude, lon = loc?.longitude, forceUpdate = true)

        LocationServiceModule.sendPauseZoneEvent(false, exitedName)
        AppLogger.d(TAG, "Exited pause zone: $exitedName")

        return anchorJob
    }

    /** Logs a synthetic location at the geofence center for clean track start/end points. */
    private fun saveAnchorPoint(geofence: GeofenceHelper.CachedGeofence): Job? {
        if (!::config.isInitialized) {
            AppLogger.w(TAG, "Config not yet initialized, skipping anchor point for '${geofence.name}'")
            return null
        }

        val (battery, batteryStatus) = deviceInfoHelper.getCachedBatteryStatus()
        val nowMs = System.currentTimeMillis()
        val timestampSec = nowMs / 1000
        val currentFieldMap = fieldMap ?: emptyMap()

        val syntheticLocation = android.location.Location("geofence").apply {
            latitude = geofence.lat
            longitude = geofence.lon
            accuracy = geofence.radius.toFloat()
            time = nowMs
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
                timestamp = timestampSec,
                endpoint = config.endpoint
            )

            val payload = payloadBuilder.buildPayload(
                syntheticLocation,
                battery,
                batteryStatus,
                currentFieldMap,
                timestampSec,
                customFields
            )

            syncManager.queueAndSend(locationId, payload)

            AppLogger.d(TAG, "Anchor point saved at geofence '${geofence.name}' center (${geofence.lat}, ${geofence.lon})")
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
            isStationary = isStationary
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

        stopForeground(Service.STOP_FOREGROUND_DETACH)

        notificationManager.notify(
            NotificationHelper.NOTIFICATION_ID,
            notificationHelper.buildStoppedNotification(reason)
        )

        stopLocationUpdates()
        stopSelf()
    }

    // ── Stationary detection ──────────────────────────────────────────────

    /**
     * Called from handleLocationUpdate to evaluate whether the device has
     * become stationary. If speed stays below [STATIONARY_SPEED_THRESHOLD]
     * for [STATIONARY_TIMEOUT_MS], active GPS is paused and the significant
     * motion sensor is armed to wake it back up.
     */
    private fun evaluateStationaryState(location: android.location.Location) {
        if (!config.pauseWhenStationary || motionDetector?.isAvailable != true) return

        // Treat missing speed as 0 (stationary) - network/fused providers often omit speed
        val speed = if (location.hasSpeed()) location.speed else 0f

        if (speed >= STATIONARY_SPEED_THRESHOLD) {
            // Moving - cancel any pending stationary timer
            stationaryJob?.cancel()
            stationaryJob = null
            if (isStationary) {
                resumeFromStationary()
            }
            return
        }

        // Speed below threshold - start countdown if not already running
        if (!isStationary && stationaryJob?.isActive != true) {
            stationaryJob = serviceScope?.launch {
                delay(STATIONARY_TIMEOUT_MS)
                withContext(Dispatchers.Main) {
                    enterStationary()
                }
            }
        }
    }

    private fun enterStationary() {
        if (isStationary) return
        isStationary = true

        AppLogger.i(TAG, "Device stationary - pausing active GPS, arming motion sensor")

        // Stop active GPS but keep the service running
        locationUpdateCallback?.let { locationProvider.removeLocationUpdates(it) }
        locationUpdateCallback = null

        motionDetector?.arm()

        val loc = lastKnownLocation
        updateNotification(
            lat = loc?.latitude,
            lon = loc?.longitude,
            forceUpdate = true
        )
    }

    /** Called by MotionDetector when the device starts moving again. */
    private fun onMotionDetected() {
        if (!isStationary) return
        AppLogger.i(TAG, "Motion detected - resuming active GPS")
        resumeFromStationary()
    }

    private fun resumeFromStationary() {
        isStationary = false
        stationaryJob?.cancel()
        stationaryJob = null
        motionDetector?.disarm()

        // Restart active GPS with current config
        setupLocationUpdates()

        val loc = lastKnownLocation
        updateNotification(
            lat = loc?.latitude,
            lon = loc?.longitude,
            forceUpdate = true
        )
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

        // Resume from stationary if a profile switch happens (e.g. charging)
        if (isStationary) {
            resumeFromStationary()
            return
        }

        // Synchronous restart on Main thread to avoid duplicate locations from
        // the old listener firing during an async coroutine window.
        locationRestartJob?.cancel()
        locationRestartJob = null
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
            httpMethod = config.httpMethod
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

        if (AppLogger.enabled) {
            val batteryStatusStr = deviceInfoHelper.getBatteryStatusString()

            AppLogger.d(TAG, """
                ╔════════════════════════════════════════════════════════════════╗
                ║              COLOTA LOCATION SERVICE CONFIGURATION              ║
                ╠════════════════════════════════════════════════════════════════╣
                ║ GPS TRACKING                                                    ║
                ╟────────────────────────────────────────────────────────────────╢
                ║  Update Interval:        ${config.interval}ms (${config.interval/1000.0}s)
                ║  Min Update Distance:    ${config.minUpdateDistance}m
                ║  Accuracy Threshold:     ${config.accuracyThreshold}m
                ║  Filter Inaccurate:      ${config.filterInaccurateLocations}
                ╟────────────────────────────────────────────────────────────────╢
                ║ NETWORK & SYNC                                                  ║
                ╟────────────────────────────────────────────────────────────────╢
                ║  Endpoint:               ${if(config.endpoint.isBlank()) "⚠️  NOT CONFIGURED" else "✓ ${config.endpoint}"}
                ║  Offline Mode:           ${if(config.isOfflineMode) "✓ ENABLED" else "✗ Disabled"}
                ║  Sync Mode:              ${if(config.syncIntervalSeconds == 0) "⚡ INSTANT SEND" else "🕐 PERIODIC (${config.syncIntervalSeconds}s)"}
                ║  Retry Interval:         ${config.retryIntervalSeconds}s
                ║  Max Retry Attempts:     ${config.maxRetries}
                ╟────────────────────────────────────────────────────────────────╢
                ║ PERFORMANCE OPTIMIZATION                                        ║
                ╟────────────────────────────────────────────────────────────────╢
                ║  Battery Check Cache:    60s (managed by DeviceInfoHelper)
                ║  Notification Throttle:  ${NotificationHelper.THROTTLE_MS/1000}s
                ╟────────────────────────────────────────────────────────────────╢
                ║ FIELD MAPPING                                                   ║
                ╟────────────────────────────────────────────────────────────────╢
                ║  Custom Fields:          ${if(fieldMap != null && fieldMap!!.isNotEmpty()) "✓ YES (${fieldMap!!.size} mappings)" else "✗ Using Defaults"}
                ${if(fieldMap != null && fieldMap!!.isNotEmpty()) {
                    fieldMap!!.entries.joinToString("\n") {
                        "║    ${it.key.padEnd(20)} → ${it.value}"
                    }
                } else ""}
                ╟────────────────────────────────────────────────────────────────╢
                ║ CURRENT SERVICE STATE                                           ║
                ╟────────────────────────────────────────────────────────────────╢
                ║  Tracking Status:        ✓ ACTIVE
                ║  Pause Zone:            ${if(insidePauseZone) "⏸️  PAUSED in '$currentZoneName'" else "✓ Not in zone"}
                ║  Battery Level:          $batteryStatusStr
                ║  Queued Locations:       ${syncManager.getCachedQueuedCount()} items
                ║  Last Sync:              ${notificationHelper.formatTimeSinceSync(syncManager.lastSuccessfulSyncTime)}
                ║  Last Location:          ${if(lastKnownLocation != null) String.format(Locale.US, "%.5f, %.5f", lastKnownLocation!!.latitude, lastKnownLocation!!.longitude) else "N/A"}
                ╚════════════════════════════════════════════════════════════════╝
            """.trimIndent())
        }
    }
}