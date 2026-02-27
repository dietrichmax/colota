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
    @Volatile private var insidePauseZone = false
    @Volatile private var currentZoneName: String? = null
    @Volatile private var lastKnownLocation: android.location.Location? = null

    @Volatile private lateinit var config: ServiceConfig
    @Volatile private var fieldMap: Map<String, String>? = null
    @Volatile private var customFields: Map<String, String>? = null

    companion object {
        private const val TAG = "LocationService"
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

        AppLogger.enabled = dbHelper.getSetting("debug_mode_enabled")?.toBoolean() ?: false
        AppLogger.d(TAG, "Service created - provider: ${locationProvider.javaClass.simpleName}")
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

        // Must call startForeground within 5s
        val initialStatus = notificationHelper.getInitialStatus(
            insidePauseZone, currentZoneName, lastKnownLocation
        )
        val initialTitle = notificationHelper.buildTitle(
            if (::profileManager.isInitialized) profileManager.getActiveProfileName() else null
        )
        ServiceCompat.startForeground(
            this,
            NotificationHelper.NOTIFICATION_ID,
            notificationHelper.buildTrackingNotification(initialTitle, initialStatus),
            ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        )

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

                    if (config.syncIntervalSeconds == 0 && config.endpoint.isNotBlank()) {
                        syncManager.manualFlush()
                    }
                }
            }
        }

        return START_STICKY
    }

    override fun onDestroy() {
        AppLogger.d(TAG, "Service destroyed")

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
                        geofenceHelper.getPauseZone(it)?.let { zoneName ->
                            enterPauseZone(zoneName)
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
        val zoneName = geofenceHelper.getPauseZone(location)

        when {
            zoneName != null && (!insidePauseZone || zoneName != currentZoneName) -> {
                enterPauseZone(zoneName)
            }
            zoneName == null && insidePauseZone -> {
                exitPauseZone()
            }
            // Same zone - refresh notification coords
            zoneName != null && insidePauseZone && zoneName == currentZoneName -> {
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

        AppLogger.d(TAG, "Location received: ${String.format(Locale.US, "%.5f, %.5f", location.latitude, location.longitude)} acc=${location.accuracy}m provider=${location.provider}")

        applySpeedFallback(location)

        // After accuracy filter so bad GPS doesn't pollute speed average
        profileManager.onLocationUpdate(location)

        lastKnownLocation = location

        val zoneName = geofenceHelper.getPauseZone(location)
        when {
            zoneName != null && !insidePauseZone -> {
                enterPauseZone(zoneName)
                return
            }
            zoneName == null && insidePauseZone -> exitPauseZone()
            zoneName != null && insidePauseZone -> return
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

    private fun enterPauseZone(zoneName: String) {
        insidePauseZone = true
        currentZoneName = zoneName

        val loc = lastKnownLocation
        updateNotification(
            lat = loc?.latitude,
            lon = loc?.longitude,
            pausedInZone = true,
            zoneName = zoneName,
            forceUpdate = true
        )

        LocationServiceModule.sendPauseZoneEvent(true, zoneName)

        AppLogger.d(TAG, "Entered pause zone: $zoneName")
    }


    private fun exitPauseZone() {
        insidePauseZone = false
        val exited = currentZoneName
        currentZoneName = null

        val loc = lastKnownLocation
        updateNotification(lat = loc?.latitude, lon = loc?.longitude, forceUpdate = true)

        LocationServiceModule.sendPauseZoneEvent(false, exited)
        AppLogger.d(TAG, "Exited pause zone: $exited")
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

        notificationHelper.update(
            lat = lat,
            lon = lon,
            isPaused = isCurrentlyPaused,
            zoneName = activeZone,
            queuedCount = syncManager.getCachedQueuedCount(),
            lastSyncTime = syncManager.lastSuccessfulSyncTime,
            activeProfileName = profileManager.getActiveProfileName(),
            forceUpdate = forceUpdate
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

        stopForeground(Service.STOP_FOREGROUND_DETACH)

        notificationManager.notify(
            NotificationHelper.NOTIFICATION_ID,
            notificationHelper.buildStoppedNotification(reason)
        )

        stopLocationUpdates()
        stopSelf()
    }

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