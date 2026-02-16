/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.app.*
import com.Colota.BuildConfig
import com.Colota.bridge.LocationServiceModule
import com.Colota.data.DatabaseHelper
import com.Colota.data.GeofenceHelper
import com.Colota.data.ProfileHelper
import com.Colota.sync.NetworkManager
import com.Colota.sync.PayloadBuilder
import com.Colota.sync.SyncManager
import com.Colota.util.DeviceInfoHelper
import com.Colota.util.SecureStorageHelper
import android.content.Intent
import android.os.*
import android.util.Log
import com.Colota.location.LocationProvider
import com.Colota.location.LocationProviderFactory
import com.Colota.location.LocationUpdateCallback
import kotlinx.coroutines.*
import java.util.Locale

/**
 * Foreground Service for continuous background location tracking.
 */
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
    @Volatile private var insidePauseZone = false
    @Volatile private var currentZoneName: String? = null
    @Volatile private var lastKnownLocation: android.location.Location? = null

    private lateinit var config: ServiceConfig
    private var fieldMap: Map<String, String>? = null
    private var customFields: Map<String, String>? = null

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
        profileManager = ProfileManager(profileHelper, serviceScope!!) { interval, distance, syncInterval, profileName, _ ->
            applyProfileConfig(interval, distance, syncInterval, profileName)
        }
        conditionMonitor = ConditionMonitor(this, profileManager)

        notificationHelper = NotificationHelper(this, notificationManager)
        notificationHelper.createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!::dbHelper.isInitialized) {
            dbHelper = DatabaseHelper.getInstance(this)
        }

        val savedSettings = dbHelper.getAllSettings()
        val shouldBeTracking = savedSettings["tracking_enabled"]?.toBoolean() ?: false

        // intent == null: Android restarted the service after OOM kill
        if (intent == null && !shouldBeTracking) {
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "System restart prevented")
            }
            stopSelf()
            return START_NOT_STICKY
        }

        val action = intent?.action
        val isLightweight = action in LIGHTWEIGHT_ACTIONS

        // Only reload config for full starts (not lightweight actions)
        if (!isLightweight) {
            loadConfigFromIntent(intent)
        }

        // Must call startForeground within 5s — use best available status
        val initialStatus = notificationHelper.getInitialStatus(
            insidePauseZone, currentZoneName, lastKnownLocation
        )
        startForeground(
            NotificationHelper.NOTIFICATION_ID,
            notificationHelper.buildTrackingNotification(initialStatus)
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
                    if (BuildConfig.DEBUG) {
                        Log.d(TAG, "Force exit from zone: $currentZoneName")
                    }
                    exitPauseZone()
                    // Immediately recheck with current location
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
                return START_STICKY
            }
            ACTION_MANUAL_FLUSH -> {
                serviceScope?.launch {
                    syncManager.manualFlush()
                }
                return START_STICKY
            }
            else -> {
                serviceScope?.launch {
                    // FusedLocationClient requires Main looper
                    withContext(Dispatchers.Main) {
                        stopLocationUpdates()
                        syncManager.stopPeriodicSync()

                        setupLocationUpdates()
                        syncManager.startPeriodicSync()
                    }

                    if (config.syncIntervalSeconds == 0 && config.endpoint.isNotBlank()) {
                        syncManager.manualFlush()
                    }
                }

                // Start condition monitors for profile-based config switching
                conditionMonitor.start()
            }
        }

        return START_STICKY
    }

    override fun onDestroy() {
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
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Battery critical ($level%) and unplugged - stopping service")
            }
            stopForegroundServiceWithReason("Battery critical")
            return
        }

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

                        // Check if starting in a pause zone
                        geofenceHelper.getPauseZone(it)?.let { zoneName ->
                            enterPauseZone(zoneName)
                        } ?: run {
                            // Not in zone - show coordinates immediately
                            updateNotification(it.latitude, it.longitude, forceUpdate = true)
                        }
                    }
                },
                onFailure = { /* initial location unavailable, updates will arrive */ }
            )
        } catch (e: SecurityException) {
            Log.e(TAG, "Location permission missing", e)
            stopSelf()
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

        // If we have a fresh location (less than 1 min old), recheck immediately
        if (cachedLoc != null && (now - cachedLoc.time) < 60000) {
            recheckZoneWithLocation(cachedLoc)
        } else {
            // Otherwise, request the last known location from the provider
            locationProvider.getLastLocation(
                onSuccess = { location ->
                    if (location != null) {
                        lastKnownLocation = location
                        recheckZoneWithLocation(location)
                    } else {
                        // No location available - if in zone, exit it
                        if (insidePauseZone) {
                            if (BuildConfig.DEBUG) {
                                Log.d(TAG, "No location for recheck, forcing exit from zone")
                            }
                            exitPauseZone()
                        }
                    }
                },
                onFailure = { e ->
                    Log.e(TAG, "Recheck error", e)
                    // On error, also exit zone if in one
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
            // Just entered a pause zone or changed zones
            zoneName != null && (!insidePauseZone || zoneName != currentZoneName) -> {
                enterPauseZone(zoneName)
            }

            // Just exited pause zone
            zoneName == null && insidePauseZone -> {
                exitPauseZone()
            }

            // Still in the same pause zone - update coords but keep paused status
            zoneName != null && insidePauseZone && zoneName == currentZoneName -> {
                updateNotification(
                    lat = location.latitude,
                    lon = location.longitude,
                    pausedInZone = true,
                    zoneName = currentZoneName,
                    forceUpdate = true
                )
            }

            // Standard movement (no zone) - show coords
            else -> {
                updateNotification(
                    location.latitude,
                    location.longitude,
                    forceUpdate = true
                )
            }
        }
    }

    private fun handleLocationUpdate(location: android.location.Location) {
        // Feed location to profile manager for speed-based condition evaluation
        // (must run before accuracy filter so speed data is always captured)
        profileManager.onLocationUpdate(location)

        if (config.filterInaccurateLocations && location.accuracy > config.accuracyThreshold) {
            return
        }

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

        if (battery in 1..4 && batteryStatus == 1) {
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Battery critical ($battery%) during tracking - stopping")
            }
            stopForegroundServiceWithReason("Battery critical")
            return
        }

        val timestampSec = location.time / 1000
        val currentFieldMap = fieldMap ?: emptyMap()

        // DB + network on IO thread; notification dispatches back to Main
        serviceScope?.launch {
            val locationId = dbHelper.saveLocation(
                latitude = location.latitude,
                longitude = location.longitude,
                accuracy = location.accuracy.toDouble(),
                altitude = if (location.hasAltitude()) location.altitude.toInt() else null,
                speed = location.speed.toDouble(),
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

        lastKnownLocation?.let { loc ->
            updateNotification(
                lat = loc.latitude,
                lon = loc.longitude,
                pausedInZone = true,
                zoneName = zoneName,
                forceUpdate = true
            )
        } ?: run {
            updateNotification(
                pausedInZone = true,
                zoneName = zoneName,
                forceUpdate = true
            )
        }

        LocationServiceModule.sendPauseZoneEvent(true, zoneName)

        if (BuildConfig.DEBUG) {
            Log.d(TAG, "Entered pause zone: $zoneName")
        }
    }


    private fun exitPauseZone() {
        insidePauseZone = false
        val exited = currentZoneName
        currentZoneName = null

        lastKnownLocation?.let { loc ->
            updateNotification(loc.latitude, loc.longitude, forceUpdate = true)
        } ?: run {
            updateNotification(forceUpdate = true)
        }

        LocationServiceModule.sendPauseZoneEvent(false, exited)
        if (BuildConfig.DEBUG) Log.d(TAG, "Exited pause zone: $exited")
    }

    /**
     * Thin wrapper that delegates to NotificationHelper with current service state.
     */
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
            forceUpdate = forceUpdate
        )
    }

    private fun stopForegroundServiceWithReason(reason: String) {
        if (BuildConfig.DEBUG) {
            Log.i(TAG, "Stopping: $reason")
        }

        LocationServiceModule.sendTrackingStoppedEvent(reason)
        dbHelper.saveSetting("tracking_enabled", "false")

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(Service.STOP_FOREGROUND_DETACH)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(false)
        }

        notificationManager.notify(
            NotificationHelper.NOTIFICATION_ID,
            notificationHelper.buildStoppedNotification(reason)
        )

        locationUpdateCallback?.let { locationProvider.removeLocationUpdates(it) }
        stopSelf()
    }

    /**
     * Dynamically switches GPS interval and sync config when a profile activates/deactivates.
     * No full service restart — just re-requests location updates with new parameters.
     */
    private fun applyProfileConfig(interval: Long, distance: Float, syncInterval: Int, profileName: String?) {
        config = config.copy(
            interval = interval,
            minUpdateDistance = distance,
            syncIntervalSeconds = syncInterval
        )

        syncManager.updateConfig(
            endpoint = config.endpoint,
            syncIntervalSeconds = syncInterval,
            retryIntervalSeconds = config.retryIntervalSeconds,
            maxRetries = config.maxRetries,
            isOfflineMode = config.isOfflineMode,
            isWifiOnlySync = config.isWifiOnlySync,
            authHeaders = secureStorage.getAuthHeaders(),
            httpMethod = config.httpMethod
        )

        serviceScope?.launch {
            withContext(Dispatchers.Main) {
                stopLocationUpdates()
                setupLocationUpdates()
            }
        }

        if (BuildConfig.DEBUG) {
            Log.i(TAG, "Profile config applied: ${profileName ?: "default"} — interval=${interval}ms, distance=${distance}m, sync=${syncInterval}s")
        }
    }

    private fun loadConfigFromIntent(intent: Intent?) {
        config = if (intent != null) {
            ServiceConfig.fromIntent(intent, dbHelper)
        } else {
            ServiceConfig.fromDatabase(dbHelper)
        }

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

        // Store default values so ProfileManager can revert when no profile matches
        profileManager.defaultInterval = config.interval
        profileManager.defaultDistance = config.minUpdateDistance
        profileManager.defaultSyncInterval = config.syncIntervalSeconds

        config.fieldMap?.let {
            if (it.isNotBlank()) fieldMap = payloadBuilder.parseFieldMap(it)
        }

        config.customFields?.let {
            if (it.isNotBlank()) customFields = payloadBuilder.parseCustomFields(it)
        }

        if (BuildConfig.DEBUG) {
            val batteryStatusStr = deviceInfoHelper.getBatteryStatusString()

            Log.d(TAG, """
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