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
    
    // Properly manage scope lifecycle to prevent memory leak
    private var serviceScope: CoroutineScope? = null
    
    // --- State & Jobs ---
    private var locationCallback: LocationCallback? = null
    private var syncJob: Job? = null
    private var lastSyncTime: Long = 0
    private var lastSuccessfulSyncTime: Long = 0
    private var syncInitialized = false
    private var insideSilentZone = false
    private var currentZoneName: String? = null
    private var lastNotificationText: String? = null
    
    // Notification throttling
    private var lastNotificationTime: Long = 0
    private val NOTIFICATION_THROTTLE_MS = 10000L // Max 1 per 5 seconds
    
    // DB query caching
    private var cachedQueuedCount: Int = 0
    private var lastQueueCountCheck: Long = 0
    private val QUEUE_COUNT_CACHE_MS = 5000L
    
    // Location caching
    private var lastKnownLocation: android.location.Location? = null
    private var lastNotificationCoords: Pair<Double, Double>? = null 

    // Batch limit to prevent infinite syncing
    private val MAX_BATCHES_PER_SYNC = 10 // Max 500 items per sync cycle

    // --- Configuration (use ServiceConfig) ---
    private lateinit var config: ServiceConfig
    private var fieldMap: Map<String, String>? = null
    private var consecutiveFailures = 0

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
        locationUtils = LocationUtils(this)
        deviceInfoHelper = DeviceInfoHelper(this)
        networkManager = NetworkManager(this)
        geofenceHelper = GeofenceHelper(this)

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
                if (config.endpoint.isNotBlank()) {
                    serviceScope?.launch {
                        syncQueue(config.endpoint)
                    }
                }
                return START_STICKY
            }
            else -> {
                serviceScope?.launch {
                    withContext(Dispatchers.Main) {
                        stopLocationUpdates()
                        stopSyncJob()
                        
                        syncInitialized = false
                        setupLocationUpdates()

                        if (config.syncIntervalSeconds > 0) {
                            startSyncJob()
                        }
                    }
                    
                    if (config.syncIntervalSeconds == 0 && config.endpoint.isNotBlank()) {
                        syncQueue(config.endpoint)
                    }
                }
            }
        }

        return START_STICKY
    }

    override fun onDestroy() {
        stopLocationUpdates()
        stopSyncJob()
        
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
            timestampSec
        )
        
        // Queue and optionally send (don't launch new coroutine if already in one)
        serviceScope?.launch {
            queueAndSend(locationId, payload, config.endpoint)
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
    // BATTERY OPTIMIZATIONS
    // ========================================
    // Battery-related functionality has been moved to DeviceInfoHelper.kt
    // Use deviceInfoHelper.getCachedBatteryStatus() for cached battery info
    // Use deviceInfoHelper.isBatteryCritical() to check critical battery state

    /**
     * Cached queue count.
     */
    private fun getCachedQueuedCount(): Int {
        val now = System.currentTimeMillis()
        
        if (now - lastQueueCountCheck > QUEUE_COUNT_CACHE_MS) {
            cachedQueuedCount = dbHelper.getQueuedCount()
            lastQueueCountCheck = now
        }
        
        return cachedQueuedCount
    }

    // ========================================
    // SYNCING & NETWORKING
    // ========================================

    private fun startSyncJob() {
        syncJob = serviceScope?.launch {
            while (isActive) {
                val baseDelay = calculateNextSyncDelay()
                delay(baseDelay * 1000L)

                if (config.isOfflineMode || !networkManager.isNetworkAvailable()) {
                    continue
                }

                // Use cached queue count
                if (config.endpoint.isNotBlank() && getCachedQueuedCount() > 0) {
                    try {
                        val success = performSyncAndCheckSuccess(config.endpoint)
                        
                        if (success) {
                            if (consecutiveFailures > 0 && BuildConfig.DEBUG) {
                                Log.i(TAG, "Sync restored")
                            }
                            consecutiveFailures = 0
                        } else {
                            consecutiveFailures++
                            applyBackoffDelay()
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Sync error", e)
                        consecutiveFailures++
                        delay(30000)
                    }
                }
            }
        }
    }

    private suspend fun performSyncAndCheckSuccess(endpoint: String): Boolean {
        val countBefore = dbHelper.getQueuedCount()
        syncQueue(endpoint)
        val countAfter = dbHelper.getQueuedCount()
        
        // Invalidate cache after sync
        lastQueueCountCheck = 0
        
        // Update last successful sync time if queue was reduced
        val success = countAfter < countBefore || countAfter == 0
        if (success && countAfter == 0) {
            lastSuccessfulSyncTime = System.currentTimeMillis()
        }
        
        return success
    }

    private suspend fun applyBackoffDelay() {
        val backoffSeconds = when (consecutiveFailures) {
            1 -> 30L
            2 -> 60L
            3 -> 300L
            else -> 900L
        }
        
        if (BuildConfig.DEBUG) {
            Log.w(TAG, "Backoff: ${backoffSeconds}s")
        }
        
        delay(backoffSeconds * 1000L)
    }

    private fun stopSyncJob() {
        syncJob?.cancel()
        syncJob = null
    }

    /**
     * Batch limit to prevent infinite syncing.
     * Processes max 500 items (10 batches × 50 items) per sync cycle.
     */
    private suspend fun syncQueue(endpoint: String) = coroutineScope {
        var totalProcessed = 0
        var batchNumber = 1
        
        while (isActive && batchNumber <= MAX_BATCHES_PER_SYNC) {
            val queued = dbHelper.getQueuedLocations(50)
            if (queued.isEmpty()) {
                if (BuildConfig.DEBUG && totalProcessed > 0) {
                    Log.d(TAG, "Sync complete: $totalProcessed items in $batchNumber batches")
                }
                break
            }

            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Processing batch $batchNumber/$MAX_BATCHES_PER_SYNC: ${queued.size} items")
            }

            for (chunk in queued.chunked(10)) {
                val successfulIds = mutableListOf<Long>()
                val permanentlyFailedIds = mutableListOf<Long>()

                // Separate retriable from permanently failed
                val (retriable, exceeded) = chunk.partition { it.retryCount < config.maxRetries }
                
                // Mark exceeded items for removal
                permanentlyFailedIds.addAll(exceeded.map { it.queueId })
                if (BuildConfig.DEBUG && exceeded.isNotEmpty()) {
                    Log.w(TAG, "Removing ${exceeded.size} items that exceeded ${config.maxRetries} retries")
                }

                // Attempt only retriable items
                val results = retriable.map { item ->
                    async {
                        val success = networkManager.sendToEndpoint(
                            JSONObject(item.payload),
                            endpoint
                        )
                        item.queueId to success
                    }
                }.awaitAll()

                // Process results
                results.forEach { (queueId, success) ->
                    if (success) {
                        successfulIds.add(queueId)
                    } else {
                        val item = retriable.first { it.queueId == queueId }
                        dbHelper.incrementRetryCount(queueId, "Send failed")
                        
                        // Check if this increment pushed it over the limit
                        if (item.retryCount + 1 >= config.maxRetries) {
                            permanentlyFailedIds.add(queueId)
                            if (BuildConfig.DEBUG) {
                                Log.w(TAG, "Item $queueId reached max retries")
                            }
                        }
                    }
                }

                // Remove successful and permanently failed items
                val toRemove = successfulIds + permanentlyFailedIds
                if (toRemove.isNotEmpty()) {
                    dbHelper.removeBatchFromQueue(toRemove)
                    totalProcessed += toRemove.size
                }
                
                yield()
            }
            
            batchNumber++
        }
        
        if (batchNumber > MAX_BATCHES_PER_SYNC && BuildConfig.DEBUG) {
            Log.w(TAG, "Sync paused: reached batch limit. Remaining items will sync next cycle.")
        }
        
        // Invalidate cache after all syncing is done
        lastQueueCountCheck = 0
        
        // Update last successful sync time if we processed items
        if (totalProcessed > 0) {
            lastSuccessfulSyncTime = System.currentTimeMillis()
        }
    }

    private suspend fun queueAndSend(
        locationId: Long,
        payload: JSONObject,
        endpoint: String
    ) {
        // Add to queue and get the queue ID back
        val queueId = dbHelper.addToQueue(locationId, payload.toString())
        
        // Invalidate cache
        lastQueueCountCheck = 0

        // Skip sending if offline mode or no endpoint
        if (config.endpoint.isBlank() || config.isOfflineMode) {
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Queued location $locationId - ${if (config.isOfflineMode) "offline mode" else "no endpoint"}")
            }
            return  // Item stays in queue with retry_count = 0
        }

        // Immediate send mode (syncInterval = 0)
        if (config.syncIntervalSeconds == 0) {
            Log.d(TAG, "Instant send")
            val success = networkManager.sendToEndpoint(payload, endpoint)
            
            if (success) {
                dbHelper.removeFromQueueByLocationId(locationId)
                lastQueueCountCheck = 0
                lastSuccessfulSyncTime = System.currentTimeMillis()
            } else {
                dbHelper.incrementRetryCount(queueId, "Send failed")
            }
        }
        Log.d(TAG, "Waiting for sync")
        // If syncInterval > 0, the periodic sync job will handle it
    }

    private fun calculateNextSyncDelay(): Long {
        if (config.syncIntervalSeconds <= 0) {
            return if (getCachedQueuedCount() > 0) {
                config.retryIntervalSeconds.toLong()
            } else {
                30L
            }
        }

        val now = System.currentTimeMillis()
        if (!syncInitialized) {
            lastSyncTime = now
            syncInitialized = true
            return config.syncIntervalSeconds.toLong()
        }

        val elapsedSeconds = (now - lastSyncTime) / 1000
        val remaining = config.syncIntervalSeconds - elapsedSeconds
        
        return if (remaining <= 0) {
            lastSyncTime = now
            config.syncIntervalSeconds.toLong()
        } else {
            remaining
        }
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
                
                // Skip if moved <2m AND queue count cache is still fresh
                if (distance[0] < 2 && (now - lastQueueCountCheck) < QUEUE_COUNT_CACHE_MS) {
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
        val queuedCount = getCachedQueuedCount()
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
        
        // Parse fieldMap separately (remains as Map for payload building)
        config.fieldMap?.let {
            if (it.isNotBlank()) fieldMap = locationUtils.parseFieldMap(it)
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
                ║  Max Batch Limit:        $MAX_BATCHES_PER_SYNC batches × 50 items = ${MAX_BATCHES_PER_SYNC * 50} max/cycle
                ╟────────────────────────────────────────────────────────────────╢
                ║ PERFORMANCE OPTIMIZATION                                        ║
                ╟────────────────────────────────────────────────────────────────╢
                ║  Queue Count Cache:      ${QUEUE_COUNT_CACHE_MS/1000}s
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
                ║  Queued Locations:       $cachedQueuedCount items
                ║  Last Sync:              ${getTimeSinceLastSync()}
                ║  Last Location:          ${if(lastKnownLocation != null) "%.5f, %.5f".format(lastKnownLocation!!.latitude, lastKnownLocation!!.longitude) else "N/A"}
                ╚════════════════════════════════════════════════════════════════╝
            """.trimIndent())
        }
    }
}