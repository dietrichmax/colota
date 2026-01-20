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
    private lateinit var dbHelper: LocationDatabaseHelper
    private lateinit var locationUtils: LocationUtils
    
    // Properly manage scope lifecycle to prevent memory leak
    private var serviceScope: CoroutineScope? = null
    
    // --- State & Jobs ---
    private var locationCallback: LocationCallback? = null
    private var syncJob: Job? = null
    private var lastSyncTime: Long = 0
    private var syncInitialized = false
    private var insideSilentZone = false
    private var currentZoneName: String? = null
    private var lastNotificationText: String? = null
    
    // Notification throttling
    private var lastNotificationTime: Long = 0
    private val NOTIFICATION_THROTTLE_MS = 5000L // Max 1 per 5 seconds
    
    // DB query caching
    private var cachedQueuedCount: Int = 0
    private var lastQueueCountCheck: Long = 0
    private val QUEUE_COUNT_CACHE_MS = 3000L
    
    // Location caching
    private var lastKnownLocation: android.location.Location? = null
    
    // Battery check throttling
    private var cachedBatteryLevel: Int = 100
    private var cachedBatteryStatus: Int = 0
    private var lastBatteryCheck: Long = 0
    private val BATTERY_CHECK_INTERVAL_MS = 30000L

    // --- Configuration (GPS settings) ---
    private var interval: Long = 0L
    private var minUpdateDistance: Float = 0f
    private var endpoint: String = ""
    private var fieldMap: Map<String, String>? = null
    private var maxRetries: Int = 0
    private var consecutiveFailures = 0
    private var syncIntervalSeconds: Int = -1
    private var retryIntervalSeconds: Int = 0
    private var filterInaccurateLocations: Boolean = false
    private var accuracyThreshold: Float = 0f
    private var isOfflineMode: Boolean = false

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
        dbHelper = LocationDatabaseHelper.getInstance(this)
        locationUtils = LocationUtils(this)

        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!::dbHelper.isInitialized) {
            dbHelper = LocationDatabaseHelper.getInstance(this)
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
                if (endpoint.isNotBlank()) {
                    serviceScope?.launch {
                        syncQueue(endpoint)
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

                        if (syncIntervalSeconds > 0) {
                            startSyncJob()
                        }
                    }
                    
                    if (syncIntervalSeconds == 0 && endpoint.isNotBlank()) {
                        syncQueue(endpoint)
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

        // Use cached battery status
        val (batteryLevel, batteryStatus) = getCachedBatteryStatus()
        
        // Priority logic
        val priority = when {
            batteryLevel < 5 && batteryStatus == 1 -> { 
                stopForegroundServiceWithReason("Battery critical")
                return
            }
            else -> Priority.PRIORITY_HIGH_ACCURACY
        }

        // Request parameters
        val locationRequest = LocationRequest.Builder(priority, interval * 2)
            .setMinUpdateIntervalMillis(interval)
            .setMinUpdateDistanceMeters(minUpdateDistance)
            .setMaxUpdateDelayMillis(interval * 2)
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
                    locationUtils.getSilentZone(it)?.let { zoneName ->
                        enterSilentZone(GeofenceInfo(-1, zoneName))
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
        val cachedLoc = lastKnownLocation
        val now = System.currentTimeMillis()
        
        if (cachedLoc != null && (now - cachedLoc.time) < 60000) {
            recheckZoneWithLocation(cachedLoc)
        } else {
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
        val zoneName = locationUtils.getSilentZone(location)

        when {
            // Just entered a new zone or changed zones
            zoneName != null && (!insideSilentZone || zoneName != currentZoneName) -> {
                enterSilentZone(GeofenceInfo(-1, zoneName))
            }
            
            // Just exited (zone was deleted or moved out)
            zoneName == null && insideSilentZone -> {
                exitSilentZone()
                updateNotification(location.latitude, location.longitude)
            }

            // Still in the same zone 
            zoneName != null && insideSilentZone && zoneName == currentZoneName -> {
                // Don't change state, just ensure notification shows current coords
                updateNotification(lat = location.latitude, lon = location.longitude)
            }

            // Standard movement (No zone) - make sure we show coords
            else -> {
                updateNotification(location.latitude, location.longitude)
            }
        }
    }

    // ========================================
    // DATA PROCESSING (GPS QUALITY)
    // ========================================

    private fun handleLocationUpdate(location: android.location.Location) {
        // Early returns for filtering
        if (filterInaccurateLocations && location.accuracy > accuracyThreshold) {
            return
        }
            
        // Cache location
        lastKnownLocation = location

        // Silent Zone Logic
        val zoneName = locationUtils.getSilentZone(location)
        when {
            zoneName != null && !insideSilentZone -> enterSilentZone(GeofenceInfo(-1, zoneName))
            zoneName == null && insideSilentZone -> exitSilentZone()
            zoneName != null && insideSilentZone -> return // Still in zone, skip
        }

        // Use cached battery
        val (battery, batteryStatus) = getCachedBatteryStatus()
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
            endpoint = endpoint
        )

        // Send to React Native
        LocationServiceModule.sendLocationEvent(location)

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
            queueAndSend(locationId, payload, endpoint)
        }
        
        // Update notification (throttled)
        updateNotificationThrottled(location.latitude, location.longitude)
    }

    private fun enterSilentZone(zone: GeofenceInfo) {
        insideSilentZone = true
        currentZoneName = zone.name
        
        // Use last known location if available
        lastKnownLocation?.let { loc ->
            updateNotification(
                lat = loc.latitude, 
                lon = loc.longitude, 
                pausedInZone = true, 
                zoneName = zone.name
            )
        } ?: run {
            // No location yet, show paused status only
            updateNotification(pausedInZone = true, zoneName = zone.name)
        }
        
        LocationServiceModule.sendSilentZoneEvent(true, zone.name)
    }


    private fun exitSilentZone() {
        insideSilentZone = false
        val exited = currentZoneName
        currentZoneName = null
        
        // Use last known location if available, otherwise show "Searching GPS"
        lastKnownLocation?.let { loc ->
            updateNotification(loc.latitude, loc.longitude)
        } ?: run {
            // If no location, show "Searching GPS..." instead of staying paused
            updateNotification()
        }
        
        LocationServiceModule.sendSilentZoneEvent(false, exited)
        if (BuildConfig.DEBUG) Log.d(TAG, "Exited zone: $exited")
    }

    // ========================================
    // BATTERY OPTIMIZATIONS (New Methods)
    // ========================================

    /**
     * Cached battery status.
     */
    private fun getCachedBatteryStatus(): Pair<Int, Int> {
        val now = System.currentTimeMillis()
        
        if (now - lastBatteryCheck > BATTERY_CHECK_INTERVAL_MS) {
            val (level, batteryStatus) = locationUtils.getBatteryStatus()
            cachedBatteryLevel = level
            cachedBatteryStatus = batteryStatus  // Now stores Int instead of Boolean
            lastBatteryCheck = now
        }
        
        return Pair(cachedBatteryLevel, cachedBatteryStatus)
    }

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

    /**
     * Notification updates.
     */
    private fun updateNotificationThrottled(
        lat: Double? = null,
        lon: Double? = null,
        pausedInZone: Boolean = false,
        zoneName: String? = null
    ) {
        val now = System.currentTimeMillis()
        
        // Always update immediately for zone changes 
        val isZoneChange = pausedInZone != insideSilentZone || zoneName != currentZoneName
        
        if (!isZoneChange && (now - lastNotificationTime) < NOTIFICATION_THROTTLE_MS) {
            return 
        }
        
        lastNotificationTime = now
        updateNotification(lat, lon, pausedInZone, zoneName)
    }

    // ========================================
    // SYNCING & NETWORKING
    // ========================================

    private fun startSyncJob() {
        syncJob = serviceScope?.launch {
            while (isActive) {
                val baseDelay = calculateNextSyncDelay()
                delay(baseDelay * 1000L)

                if (isOfflineMode || !locationUtils.isNetworkAvailable()) {
                    continue
                }

                // Use cached queue count
                if (endpoint.isNotBlank() && getCachedQueuedCount() > 0) {
                    try {
                        val success = performSyncAndCheckSuccess(endpoint)
                        
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
        
        return countAfter < countBefore || countAfter == 0
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
    * Batch fetching - processes ALL queued items until empty.
    */
    private suspend fun syncQueue(endpoint: String) = coroutineScope {
        var totalProcessed = 0
        var batchNumber = 1
        
        while (isActive) { 
            val queued = dbHelper.getQueuedLocations(50)
            if (queued.isEmpty()) {
                if (BuildConfig.DEBUG && totalProcessed > 0) {
                    Log.d(TAG, "Sync complete: $totalProcessed items processed in $batchNumber batches")
                }
                break
            }

            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Processing batch $batchNumber: ${queued.size} items")
            }

            for (chunk in queued.chunked(10)) {
                val successfulIds = mutableListOf<Long>()
                val permanentlyFailedIds = mutableListOf<Long>()

                // Separate retriable from permanently failed
                val (retriable, exceeded) = chunk.partition { it.retryCount < maxRetries }
                
                // Mark exceeded items for removal
                permanentlyFailedIds.addAll(exceeded.map { it.queueId })
                if (BuildConfig.DEBUG && exceeded.isNotEmpty()) {
                    Log.w(TAG, "Removing ${exceeded.size} items that exceeded $maxRetries retries")
                }

                // Attempt only retriable items
                val results = retriable.map { item ->
                    async {
                        val success = locationUtils.sendToEndpoint(
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
                        if (item.retryCount + 1 >= maxRetries) {
                            permanentlyFailedIds.add(queueId)
                            if (BuildConfig.DEBUG) {
                                Log.w(TAG, "Item $queueId reached max retries after this attempt")
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
            
            // Safety check: prevent infinite loops
            if (batchNumber > 100) {
                Log.e(TAG, "Sync aborted: exceeded 100 batches (potential infinite loop)")
                break
            }
        }
        
        // Invalidate cache after all syncing is done
        lastQueueCountCheck = 0
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
        if (endpoint.isBlank() || isOfflineMode) {
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Queued location $locationId - ${if (isOfflineMode) "offline mode" else "no endpoint"}")
            }
            return  // Item stays in queue with retry_count = 0
        }

        // Immediate send mode (syncInterval = 0)
        if (syncIntervalSeconds == 0) {
            val success = locationUtils.sendToEndpoint(payload, endpoint)
            
            if (success) {
                dbHelper.removeFromQueueByLocationId(locationId)
                lastQueueCountCheck = 0
            } else {
                // Increment retry count using the queue ID we got from insert
                dbHelper.incrementRetryCount(queueId, "Send failed")
            }
        }
        // If syncInterval > 0, the periodic sync job will handle it
    }

    private fun calculateNextSyncDelay(): Long {
        if (syncIntervalSeconds <= 0) {
            return if (getCachedQueuedCount() > 0) {
                retryIntervalSeconds.toLong()
            } else {
                30L
            }
        }

        val now = System.currentTimeMillis()
        if (!syncInitialized) {
            lastSyncTime = now
            syncInitialized = true
            return syncIntervalSeconds.toLong()
        }

        val elapsedSeconds = (now - lastSyncTime) / 1000
        val remaining = syncIntervalSeconds - elapsedSeconds
        
        return if (remaining <= 0) {
            lastSyncTime = now
            syncIntervalSeconds.toLong()
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

    private fun updateNotification(
        lat: Double? = null,
        lon: Double? = null,
        pausedInZone: Boolean = false,
        zoneName: String? = null
    ) {
        // Use cached queue count
        val queuedCount = getCachedQueuedCount()
        
        val isCurrentlyPaused = pausedInZone || insideSilentZone
        val activeZone = zoneName ?: currentZoneName

        val statusText = when {
            isCurrentlyPaused -> "Paused: ${activeZone ?: "Unknown"}"
            lat != null && lon != null -> {
                val coords = "%.5f, %.5f".format(lat, lon)
                if (queuedCount > 0) "$coords ($queuedCount pending)" else "$coords (Synced)"
            }
            else -> "Searching GPS..."
        }

        // Only update if changed
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

    private fun loadConfigFromIntent(intent: Intent?) {
        intent?.let {
            val extras = it.extras ?: Bundle()
            
            val keys = listOf(
                "endpoint", "interval", "minUpdateDistance", "syncInterval",
                "maxRetries", "accuracyThreshold", "filterInaccurateLocations",
                "retryInterval", "isOfflineMode"
            )
            
            for (key in keys) {
                if (intent.hasExtra(key)) {
                    val rawValue = extras.get(key)
                    val value = rawValue?.toString()?.removeSuffix(".0")
                    
                    if (value != null) {
                        dbHelper.saveSetting(key, value)
                    }
                }
            }

            if (it.hasExtra("fieldMap")) {
                val mapStr = it.getStringExtra("fieldMap")
                if (!mapStr.isNullOrBlank()) {
                    dbHelper.saveSetting("fieldMap", mapStr)
                }
            }
        }

        val saved = dbHelper.getAllSettings()
        
        endpoint = saved["endpoint"] ?: ""
        interval = saved["interval"]?.toLongOrNull() ?: 1000L
        minUpdateDistance = saved["minUpdateDistance"]?.toFloatOrNull() ?: 0f
        syncIntervalSeconds = saved["syncInterval"]?.toIntOrNull() ?: 0
        maxRetries = saved["maxRetries"]?.toIntOrNull() ?: 5
        accuracyThreshold = saved["accuracyThreshold"]?.toFloatOrNull() ?: 50.0f
        filterInaccurateLocations = saved["filterInaccurateLocations"]?.toBoolean() ?: true
        retryIntervalSeconds = saved["retryInterval"]?.toIntOrNull() ?: 300
        isOfflineMode = saved["isOfflineMode"]?.toBoolean() ?: false
        
        saved["fieldMap"]?.let {
            if (it.isNotBlank()) fieldMap = locationUtils.parseFieldMap(it)
        }

        if (BuildConfig.DEBUG) {
            Log.d(TAG, """
                Config: interval=${interval/1000}s, sync=${syncIntervalSeconds}s, 
                endpoint=${if(endpoint.isBlank()) "none" else "set"}
            """.trimIndent())
        }
    }
}