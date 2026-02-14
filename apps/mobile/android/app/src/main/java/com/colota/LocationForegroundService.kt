/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
 
package com.Colota

import android.app.*
import android.content.Intent
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.*
import kotlinx.coroutines.*
import org.json.JSONObject

/**
 * Foreground Service for continuous background location tracking.
 */
class LocationForegroundService : Service() {

    // --- Core Components ---
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var notificationManager: NotificationManager
    private lateinit var dbHelper: DatabaseHelper
    private lateinit var locationUtils: LocationUtils
    private lateinit var deviceInfoHelper: DeviceInfoHelper
    private lateinit var networkManager: NetworkManager
    private lateinit var geofenceHelper: GeofenceHelper
    private lateinit var secureStorage: SecureStorageHelper
    private lateinit var syncManager: SyncManager
    
    // Properly manage scope lifecycle to prevent memory leak
    private var serviceScope: CoroutineScope? = null
    
    // --- State ---
    private var locationCallback: LocationCallback? = null
    private var insideSilentZone = false
    private var currentZoneName: String? = null
    private var lastNotificationText: String? = null
    
    // Notification throttling
    private var lastNotificationTime: Long = 0
    private val NOTIFICATION_THROTTLE_MS = 10000L // Max 1 per 5 seconds
    
    // Location caching
    private var lastKnownLocation: android.location.Location? = null
    private var lastNotificationCoords: Pair<Double, Double>? = null 

    // --- Configuration (use ServiceConfig) ---
    private lateinit var config: ServiceConfig
    private var fieldMap: Map<String, String>? = null
    private var customFields: Map<String, String>? = null

    private val CHANNEL_ID = "location_service_channel"
    private val NOTIFICATION_ID = 1

    companion object {
        private const val TAG = "LocationService"
        const val ACTION_MANUAL_FLUSH = "com.Colota.ACTION_MANUAL_FLUSH"
        const val ACTION_RECHECK_ZONE = "com.Colota.RECHECK_SILENT_ZONE"
        const val ACTION_FORCE_EXIT_ZONE = "com.Colota.FORCE_EXIT_ZONE"
    }

    data class GeofenceInfo(val id: Int, val name: String)

    // ========================================
    // SERVICE LIFECYCLE
    // ========================================

    override fun onCreate() {
        super.onCreate()
        
        // Create scope once in onCreate
        serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        dbHelper = DatabaseHelper.getInstance(this)
        locationUtils = LocationUtils()
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
                if (insideSilentZone) {
                    if (BuildConfig.DEBUG) {
                        Log.d(TAG, "Force exit from zone: $currentZoneName")
                    }
                    exitSilentZone()
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
                    withContext(Dispatchers.Main) {
                        stopLocationUpdates()
                        syncManager.stopPeriodicSync()

                        setupLocationUpdates()

                        if (config.syncIntervalSeconds > 0) {
                            syncManager.startPeriodicSync()
                        }
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
        
        // Properly cancel scope to prevent memory leak
        serviceScope?.cancel()
        serviceScope = null
        
        notificationManager.cancel(NOTIFICATION_ID)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ========================================
    // LOCATION UPDATES (GPS QUALITY)
    // ========================================

    private fun setupLocationUpdates() {
        locationCallback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.locations.forEach { handleLocationUpdate(it) }
            }
        }

        // Check if battery is critically low using DeviceInfoHelper
        if (deviceInfoHelper.isBatteryCritical(threshold = 5)) {
            val (level, _) = deviceInfoHelper.getCachedBatteryStatus()
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Battery critical ($level%) and unplugged - stopping service")
            }
            stopForegroundServiceWithReason("Battery critical")
            return // Exit early - don't setup location updates
        }

        // Battery is OK or charging - use high accuracy
        val priority = Priority.PRIORITY_HIGH_ACCURACY

        // Request parameters
        val locationRequest = LocationRequest.Builder(priority, config.interval * 2)
            .setMinUpdateIntervalMillis(config.interval)
            .setMinUpdateDistanceMeters(config.minUpdateDistance)
            .setMaxUpdateDelayMillis(config.interval * 2)
            .build()

        try {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback!!,
                Looper.getMainLooper()
            )
            
            fusedLocationClient.lastLocation.addOnSuccessListener { location ->
                location?.let {
                    lastKnownLocation = it
                    
                    // Check if starting in a pause zone
                    geofenceHelper.getSilentZone(it)?.let { zoneName ->
                        enterSilentZone(GeofenceInfo(-1, zoneName))
                    } ?: run {
                        // Not in zone - show coordinates immediately
                        updateNotification(it.latitude, it.longitude, forceUpdate = true)
                    }
                }
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "Location permission missing", e)
            stopSelf()
        }
    }

    private fun stopLocationUpdates() {
        locationCallback?.let { fusedLocationClient.removeLocationUpdates(it) }
        locationCallback = null
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
            fusedLocationClient.lastLocation.addOnSuccessListener { location ->
                location?.let {
                    lastKnownLocation = it
                    recheckZoneWithLocation(it)
                } ?: run {
                    // No location available - if in zone, exit it
                    if (insideSilentZone) {
                        if (BuildConfig.DEBUG) {
                            Log.d(TAG, "No location for recheck, forcing exit from zone")
                        }
                        exitSilentZone()
                    }
                }
            }.addOnFailureListener { e ->
                Log.e(TAG, "Recheck error", e)
                // On error, also exit zone if in one
                if (insideSilentZone) {
                    exitSilentZone()
                }
            }
        }
    }

    
    private fun recheckZoneWithLocation(location: android.location.Location) {
        val zoneName = geofenceHelper.getSilentZone(location)

        when {
            // Just entered a pause zone or changed zones
            zoneName != null && (!insideSilentZone || zoneName != currentZoneName) -> {
                enterSilentZone(GeofenceInfo(-1, zoneName))
            }
            
            // Just exited pause zone
            zoneName == null && insideSilentZone -> {
                exitSilentZone()
            }

            // Still in the same pause zone - update coords but keep paused status
            zoneName != null && insideSilentZone && zoneName == currentZoneName -> {
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

    // ========================================
    // DATA PROCESSING (GPS QUALITY)
    // ========================================

    private fun handleLocationUpdate(location: android.location.Location) {
        // Early returns for filtering
        if (config.filterInaccurateLocations && location.accuracy > config.accuracyThreshold) {
            return
        }
            
        // Cache location
        lastKnownLocation = location

        // Silent Zone Logic - CHECK IF IT'S A PAUSE ZONE
        val zoneName = geofenceHelper.getSilentZone(location)
        
        when {
            zoneName != null && !insideSilentZone -> {
                // Entering a pause zone
                enterSilentZone(GeofenceInfo(-1, zoneName))
                return // Don't record location in pause zone
            }
            zoneName == null && insideSilentZone -> {
                // Exiting pause zone
                exitSilentZone()
            }
            zoneName != null && insideSilentZone -> {
                // Still in pause zone, skip recording
                return
            }
        }

        // Use cached battery from DeviceInfoHelper
        val (battery, batteryStatus) = deviceInfoHelper.getCachedBatteryStatus()
        val timestampSec = location.time / 1000

        // Save to database
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

        // Send to React Native
        LocationServiceModule.sendLocationEvent(location, battery, batteryStatus)

        // Build payload once
        val currentFieldMap = fieldMap ?: emptyMap()
        val payload = locationUtils.buildPayload(
            location,
            battery,
            batteryStatus,
            currentFieldMap,
            timestampSec,
            customFields
        )
        
        // Queue and optionally send
        serviceScope?.launch {
            syncManager.queueAndSend(locationId, payload)
        }
        
        // Update notification (throttled)
        updateNotification(location.latitude, location.longitude)
    }

    private fun enterSilentZone(zone: GeofenceInfo) {
        insideSilentZone = true
        currentZoneName = zone.name
        
        // Always show paused status when entering a silent zone
        lastKnownLocation?.let { loc ->
            updateNotification(
                lat = loc.latitude, 
                lon = loc.longitude, 
                pausedInZone = true,
                zoneName = zone.name,
                forceUpdate = true
            )
        } ?: run {
            updateNotification(
                pausedInZone = true, 
                zoneName = zone.name,
                forceUpdate = true
            )
        }
        
        LocationServiceModule.sendSilentZoneEvent(true, zone.name)
        
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "Entered pause zone: ${zone.name}")
        }
    }


    private fun exitSilentZone() {
        insideSilentZone = false
        val exited = currentZoneName
        currentZoneName = null
        
        // Show coordinates when exiting pause zone
        lastKnownLocation?.let { loc ->
            updateNotification(
                loc.latitude, 
                loc.longitude,
                forceUpdate = true  // ← Force immediate update on zone exit
            )
        } ?: run {
            updateNotification(forceUpdate = true)
        }
        
        LocationServiceModule.sendSilentZoneEvent(false, exited)
        if (BuildConfig.DEBUG) Log.d(TAG, "Exited pause zone: $exited")
    }

    // ========================================
    // UI & NOTIFICATIONS
    // ========================================

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

    /**
     * Format time since last sync in human-readable format.
     */
    private fun getTimeSinceLastSync(): String {
        val lastSuccessfulSyncTime = syncManager.lastSuccessfulSyncTime
        if (lastSuccessfulSyncTime == 0L) {
            return "Never synced"
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
    * Smart notification updates with throttling and distance checking.
    * Only updates when:
    * - Zone status changes (immediate)
    * - Moved >10 meters
    * - Time throttle passed (10s)
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
        val isZoneChange = pausedInZone != insideSilentZone || zoneName != currentZoneName
        
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
        
        // Update last notification time and coordinates
        lastNotificationTime = now
        if (lat != null && lon != null) {
            lastNotificationCoords = Pair(lat, lon)
        }
        
        // Build notification text
        val queuedCount = syncManager.getCachedQueuedCount()
        val isCurrentlyPaused = pausedInZone || insideSilentZone
        val activeZone = zoneName ?: currentZoneName

        val statusText = when {
            isCurrentlyPaused -> "Paused: ${activeZone ?: "Unknown"}"
            lat != null && lon != null -> {
                val coords = "%.5f, %.5f".format(lat, lon)
                if (queuedCount > 0) {
                    "$coords (Last sync: ${getTimeSinceLastSync()})"
                } else {
                    "$coords (Synced)"
                }
            }
            else -> "Searching GPS..."
        }

        // Only update if text changed
        val cacheKey = "$statusText-$queuedCount"
        if (cacheKey != lastNotificationText) {
            lastNotificationText = cacheKey
            notificationManager.notify(NOTIFICATION_ID, buildNotification(statusText))
        }
    }

    private fun startForegroundServiceWithNotification() {
        val initialStatus = if (insideSilentZone) {
            "Paused: ${currentZoneName ?: "Unknown"}"
        } else {
            "Initializing..."
        }

        val notification = buildNotification(initialStatus)
        startForeground(NOTIFICATION_ID, notification)
        
        updateNotification()
    }

    private fun stopForegroundServiceWithReason(reason: String) {
        if (BuildConfig.DEBUG) {
            Log.i(TAG, "Stopping: $reason")
        }

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

        locationCallback?.let { fusedLocationClient.removeLocationUpdates(it) }
        stopSelf()
    }

    // ========================================
    // CONFIGURATION HANDLING
    // ========================================

    /**
     * Use ServiceConfig for cleaner configuration management.
     */
    private fun loadConfigFromIntent(intent: Intent?) {
        // Load config using ServiceConfig utility
        config = if (intent != null) {
            ServiceConfig.fromIntent(intent, dbHelper)
        } else {
            ServiceConfig.fromDatabase(dbHelper)
        }

        // Configure sync manager with current settings
        syncManager.updateConfig(
            endpoint = config.endpoint,
            syncIntervalSeconds = config.syncIntervalSeconds,
            retryIntervalSeconds = config.retryIntervalSeconds,
            maxRetries = config.maxRetries,
            isOfflineMode = config.isOfflineMode,
            authHeaders = secureStorage.getAuthHeaders()
        )

        // Parse fieldMap separately (remains as Map for payload building)
        config.fieldMap?.let {
            if (it.isNotBlank()) fieldMap = locationUtils.parseFieldMap(it)
        }

        // Parse customFields (static key-value pairs added to every payload)
        config.customFields?.let {
            if (it.isNotBlank()) customFields = locationUtils.parseCustomFields(it)
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
                ║  Silent Zone:            ${if(insideSilentZone) "⏸️  PAUSED in '$currentZoneName'" else "✓ Not in zone"}
                ║  Battery Level:          $batteryStatusStr
                ║  Queued Locations:       ${syncManager.getCachedQueuedCount()} items
                ║  Last Sync:              ${getTimeSinceLastSync()}
                ║  Last Location:          ${if(lastKnownLocation != null) "%.5f, %.5f".format(lastKnownLocation!!.latitude, lastKnownLocation!!.longitude) else "N/A"}
                ╚════════════════════════════════════════════════════════════════╝
            """.trimIndent())
        }
    }
}