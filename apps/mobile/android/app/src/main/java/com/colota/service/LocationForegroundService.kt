/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
 
package com.Colota.service

import android.app.*
import com.Colota.BuildConfig
import com.Colota.MainActivity
import com.Colota.R
import com.Colota.bridge.LocationServiceModule
import com.Colota.data.DatabaseHelper
import com.Colota.data.GeofenceHelper
import com.Colota.sync.NetworkManager
import com.Colota.sync.PayloadBuilder
import com.Colota.sync.SyncManager
import com.Colota.util.DeviceInfoHelper
import com.Colota.util.SecureStorageHelper
import android.content.Intent
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import com.Colota.location.LocationProvider
import com.Colota.location.LocationProviderFactory
import com.Colota.location.LocationUpdateCallback
import kotlinx.coroutines.*
import org.json.JSONObject

/**
 * Foreground Service for continuous background location tracking.
 */
class LocationForegroundService : Service() {

    private lateinit var locationProvider: LocationProvider
    private lateinit var notificationManager: NotificationManager
    private lateinit var dbHelper: DatabaseHelper
    private lateinit var payloadBuilder: PayloadBuilder
    private lateinit var deviceInfoHelper: DeviceInfoHelper
    private lateinit var networkManager: NetworkManager
    private lateinit var geofenceHelper: GeofenceHelper
    private lateinit var secureStorage: SecureStorageHelper
    private lateinit var syncManager: SyncManager
    
    @Volatile private var serviceScope: CoroutineScope? = null
    @Volatile private var locationUpdateCallback: LocationUpdateCallback? = null
    private var insidePauseZone = false
    private var currentZoneName: String? = null
    private var lastNotificationText: String? = null

    private var lastNotificationTime: Long = 0
    private val NOTIFICATION_THROTTLE_MS = 10000L
    @Volatile private var lastKnownLocation: android.location.Location? = null
    private var lastNotificationCoords: Pair<Double, Double>? = null

    private lateinit var config: ServiceConfig
    private var fieldMap: Map<String, String>? = null
    private var customFields: Map<String, String>? = null

    private val CHANNEL_ID = "location_service_channel"
    private val NOTIFICATION_ID = 1

    companion object {
        private const val TAG = "LocationService"
        const val ACTION_MANUAL_FLUSH = "com.Colota.ACTION_MANUAL_FLUSH"
        const val ACTION_RECHECK_ZONE = "com.Colota.RECHECK_PAUSE_ZONE"
        const val ACTION_FORCE_EXIT_ZONE = "com.Colota.FORCE_EXIT_ZONE"
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

        createNotificationChannel()
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

        loadConfigFromIntent(intent)
        startForegroundServiceWithNotification()

        val action = intent?.action
        
        if (action != ACTION_RECHECK_ZONE && action != ACTION_MANUAL_FLUSH && action != ACTION_FORCE_EXIT_ZONE) {
            dbHelper.saveSetting("tracking_enabled", "true")
        }

        when (action) {
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
            }
        }

        return START_STICKY
    }

    override fun onDestroy() {
        stopLocationUpdates()
        syncManager.stopPeriodicSync()
        
        serviceScope?.cancel()
        serviceScope = null
        
        notificationManager.cancel(NOTIFICATION_ID)
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

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Location Tracking",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows active tracking status and sync queue"
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(statusText: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Colota Tracking")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setSilent(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun getTimeSinceLastSync(): String {
        val lastSuccessfulSyncTime = syncManager.lastSuccessfulSyncTime
        if (lastSuccessfulSyncTime == 0L) {
            return "Never"
        }
        
        val elapsedMs = System.currentTimeMillis() - lastSuccessfulSyncTime
        val elapsedMinutes = (elapsedMs / 60000).toInt()
        
        return when {
            elapsedMinutes < 1 -> "Just now"
            elapsedMinutes == 1 -> "1 min ago"
            elapsedMinutes < 60 -> "$elapsedMinutes min ago"
            elapsedMinutes < 120 -> "1h ago"
            else -> "${elapsedMinutes / 60} h ago"
        }
    }

    /**
     * Throttled notification updates. Skips unless forceUpdate, zone change,
     * or both 10s elapsed AND moved >2m. Deduplicates via text comparison.
     */
    private fun updateNotification(
        lat: Double? = null,
        lon: Double? = null,
        pausedInZone: Boolean = false,
        zoneName: String? = null,
        forceUpdate: Boolean = false
    ) {
        val now = System.currentTimeMillis()
        val lastCoords = lastNotificationCoords
        
        // Check if this is a zone change (always update immediately)
        val isZoneChange = pausedInZone != insidePauseZone || zoneName != currentZoneName
        
        // Apply smart filtering unless forced or zone change
        if (!forceUpdate && !isZoneChange && lat != null && lon != null) {
            // Throttle: don't update more than once per 10 seconds
            if ((now - lastNotificationTime) < NOTIFICATION_THROTTLE_MS) {
                return
            }
            
            // Distance check: only update if moved >2 meters
            if (lastCoords != null) {
                val distance = FloatArray(1)
                android.location.Location.distanceBetween(
                    lastCoords.first, lastCoords.second,
                    lat, lon,
                    distance
                )
                
                // Skip if moved <2m
                if (distance[0] < 2) {
                    return
                }
            }
        }
        
        lastNotificationTime = now
        if (lat != null && lon != null) {
            lastNotificationCoords = Pair(lat, lon)
        }
        
        val queuedCount = syncManager.getCachedQueuedCount()
        val isCurrentlyPaused = pausedInZone || insidePauseZone
        val activeZone = zoneName ?: currentZoneName

        val statusText = when {
            isCurrentlyPaused -> "Paused: ${activeZone ?: "Unknown"}"
            lat != null && lon != null -> {
                val coords = "%.5f, %.5f".format(lat, lon)
                if (queuedCount > 0 && syncManager.lastSuccessfulSyncTime > 0) {
                    "$coords (Last sync: ${getTimeSinceLastSync()})"
                } else if (queuedCount > 0) {
                    "$coords (Queued: $queuedCount)"
                } else if (syncManager.lastSuccessfulSyncTime > 0) {
                    "$coords (Synced)"
                } else {
                    coords
                }
            }
            else -> "Searching GPS..."
        }

        val cacheKey = "$statusText-$queuedCount"
        if (cacheKey != lastNotificationText) {
            lastNotificationText = cacheKey
            notificationManager.notify(NOTIFICATION_ID, buildNotification(statusText))
        }
    }

    /** Must be called within 5s of startForegroundService() per Android requirement. */
    private fun startForegroundServiceWithNotification() {
        val initialStatus = if (insidePauseZone) {
            "Paused: ${currentZoneName ?: "Unknown"}"
        } else {
            "Searching GPS..."
        }

        val notification = buildNotification(initialStatus)
        startForeground(NOTIFICATION_ID, notification)
    }

    private fun stopForegroundServiceWithReason(reason: String) {
        if (BuildConfig.DEBUG) {
            Log.i(TAG, "Stopping: $reason")
        }

        LocationServiceModule.sendTrackingStoppedEvent(reason)
        dbHelper.saveSetting("tracking_enabled", "false")

        val finalNotification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Colota: Stopped")
            .setContentText(reason)
            .setSmallIcon(android.R.drawable.ic_lock_power_off)
            .setOngoing(false)
            .setAutoCancel(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(Service.STOP_FOREGROUND_DETACH)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(false)
        }

        notificationManager.notify(NOTIFICATION_ID, finalNotification)

        locationUpdateCallback?.let { locationProvider.removeLocationUpdates(it) }
        stopSelf()
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
            authHeaders = secureStorage.getAuthHeaders(),
            httpMethod = config.httpMethod
        )

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
                ║  Notification Throttle:  ${NOTIFICATION_THROTTLE_MS/1000}s
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
                ║  Last Sync:              ${getTimeSinceLastSync()}
                ║  Last Location:          ${if(lastKnownLocation != null) "%.5f, %.5f".format(lastKnownLocation!!.latitude, lastKnownLocation!!.longitude) else "N/A"}
                ╚════════════════════════════════════════════════════════════════╝
            """.trimIndent())
        }
    }
}