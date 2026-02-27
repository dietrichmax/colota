/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
 
package com.Colota.bridge

import android.content.Intent
import com.Colota.BuildConfig
import com.Colota.data.DatabaseHelper
import com.Colota.data.GeofenceHelper
import com.Colota.data.ProfileHelper
import com.Colota.service.LocationForegroundService
import com.Colota.service.ProfileConstants
import com.Colota.service.ServiceConfig
import com.Colota.service.getDoubleOrNull
import com.Colota.service.getIntOrNull
import com.Colota.service.getStringOrNull
import com.Colota.service.getBooleanOrNull
import com.Colota.sync.NetworkManager
import com.Colota.sync.PayloadBuilder
import com.Colota.util.DeviceInfoHelper
import com.Colota.util.FileOperations
import com.Colota.util.AppLogger
import com.Colota.util.SecureStorageHelper
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.Colota.location.LocationProviderFactory
import org.json.JSONObject
import kotlinx.coroutines.*
import java.lang.ref.WeakReference

/**
 * React Native bridge module for managing the Location Service.
 * Acts as the middleware between the JS UI and the Native Foreground Service/Database.
 */
class LocationServiceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), 
    LifecycleEventListener { 

    private val payloadBuilder = PayloadBuilder()
    private val dbHelper = DatabaseHelper.getInstance(reactContext)
    private val fileOps = FileOperations(reactContext)
    private val deviceInfo = DeviceInfoHelper(reactContext)
    private val geofenceHelper = GeofenceHelper(reactContext)
    private val profileHelper = ProfileHelper(reactContext)
    private val secureStorage = SecureStorageHelper.getInstance(reactContext)
    private val networkManager = NetworkManager(reactContext)

    private val moduleScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    init {
        reactContextRef = WeakReference(reactContext)
        reactContext.addLifecycleEventListener(this)
    }

    companion object {
        private const val TAG = "LocationServiceModule"

        private var reactContextRef: WeakReference<ReactApplicationContext> = WeakReference(null)
        
        @Volatile
        private var isAppInForeground: Boolean = true

        @Volatile
        private var activeProfileName: String? = null
        
        /** Skips when app is backgrounded to avoid unnecessary bridge overhead. */
        @JvmStatic
        fun sendLocationEvent(location: android.location.Location, battery: Int, batteryStatus: Int): Boolean {
            if (!isAppInForeground) return false
            
            val context = reactContextRef.get() ?: return false
            if (!context.hasActiveCatalystInstance()) return false

            return try {
                val params = Arguments.createMap().apply {
                    putDouble("latitude", location.latitude)
                    putDouble("longitude", location.longitude)
                    putDouble("accuracy", location.accuracy.toDouble())
                    
                    if (location.hasAltitude()) {
                        putDouble("altitude", location.altitude)
                    } else {
                        putNull("altitude")
                    }
                    
                    if (location.hasSpeed()) {
                        putDouble("speed", location.speed.toDouble())
                    } else {
                        putNull("speed")
                    }
                    putDouble("bearing", if (location.hasBearing()) location.bearing.toDouble() else 0.0)
                    putDouble("timestamp", location.time.toDouble())
                    putInt("battery", battery) 
                    putInt("batteryStatus", batteryStatus)
                }
                
                context
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onLocationUpdate", params)
                true
            } catch (e: Exception) {
                AppLogger.e(TAG, "Failed to send location event", e)
                false
            }
        }

        /** Fires when service stops for non-user reasons (OOM kill, system cleanup). */
        @JvmStatic
        fun sendTrackingStoppedEvent(reason: String): Boolean {
            val context = reactContextRef.get() ?: return false
            if (!context.hasActiveCatalystInstance()) return false

            return try {
                val params = Arguments.createMap().apply {
                    putString("reason", reason)
                }
                context
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onTrackingStopped", params)
                true
            } catch (e: Exception) {
                AppLogger.e(TAG, "Failed to send tracking stopped event", e)
                false
            }
        }

        /** Only fires after 3+ consecutive sync failures — see SyncManager.startPeriodicSync(). */
        @JvmStatic
        fun sendSyncErrorEvent(message: String, queuedCount: Int): Boolean {
            val context = reactContextRef.get() ?: return false
            if (!context.hasActiveCatalystInstance()) return false

            return try {
                val params = Arguments.createMap().apply {
                    putString("message", message)
                    putInt("queuedCount", queuedCount)
                }
                context
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onSyncError", params)
                true
            } catch (e: Exception) {
                AppLogger.e(TAG, "Failed to send sync error event", e)
                false
            }
        }

        /** Emits profile switch events to JS when a tracking profile activates/deactivates. */
        @JvmStatic
        fun sendProfileSwitchEvent(profileName: String?, profileId: Int?): Boolean {
            activeProfileName = profileName
            val context = reactContextRef.get() ?: return false
            if (!context.hasActiveCatalystInstance()) return false

            return try {
                val params = Arguments.createMap().apply {
                    if (profileName != null) putString("profileName", profileName)
                    else putNull("profileName")
                    if (profileId != null) putInt("profileId", profileId)
                    else putNull("profileId")
                    putBoolean("isDefault", profileName == null)
                }
                context
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onProfileSwitch", params)
                true
            } catch (e: Exception) {
                AppLogger.e(TAG, "Failed to send profile switch event", e)
                false
            }
        }

        /** Emits sync progress during manual flush so JS can show "5/127 synced". */
        @JvmStatic
        fun sendSyncProgressEvent(sent: Int, failed: Int, total: Int): Boolean {
            val context = reactContextRef.get() ?: return false
            if (!context.hasActiveCatalystInstance()) return false

            return try {
                val params = Arguments.createMap().apply {
                    putInt("sent", sent)
                    putInt("failed", failed)
                    putInt("total", total)
                }
                context
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onSyncProgress", params)
                true
            } catch (e: Exception) {
                AppLogger.e(TAG, "Failed to send sync progress event", e)
                false
            }
        }

        /** Emits pause zone entry/exit events for the JS geofence UI. */
        @JvmStatic
        fun sendPauseZoneEvent(entered: Boolean, zoneName: String?): Boolean {
            val context = reactContextRef.get() ?: return false
            if (!context.hasActiveCatalystInstance()) return false
            
            return try {
                val params = Arguments.createMap().apply {
                    putBoolean("entered", entered)
                    putString("zoneName", zoneName)
                }
                context
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onPauseZoneChange", params)
                true
            } catch (e: Exception) {
                AppLogger.e(TAG, "Failed to send pause zone event", e)
                false
            }
        }
    }

    override fun getName(): String = "LocationServiceModule"

    override fun onHostResume() {
        isAppInForeground = true
    }

    override fun onHostPause() {
        isAppInForeground = false
    }

    override fun onHostDestroy() {
        isAppInForeground = false
    }

    override fun invalidate() {
        moduleScope.cancel()
        reactContextRef.clear()
        super.invalidate()
    }


    /** Runs on IO thread and resolves/rejects the JS promise. */
    private fun executeAsync(promise: Promise, operation: suspend () -> Any?) {
        moduleScope.launch {
            try {
                val result = withContext(Dispatchers.IO) { operation() }
                promise.resolve(result)
            } catch (e: Exception) {
                AppLogger.e(TAG, "Database operation failed", e)
                promise.reject("DB_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun startService(config: ReadableMap, promise: Promise) {
        AppLogger.d(TAG, "Starting Service with config")

        val serviceConfig = ServiceConfig.fromReadableMap(config, dbHelper)
        val serviceIntent = Intent(reactApplicationContext, LocationForegroundService::class.java)
        serviceConfig.toIntent(serviceIntent)

        try {
            reactApplicationContext.startForegroundService(serviceIntent)
            moduleScope.launch(Dispatchers.IO) {
                dbHelper.saveSetting("tracking_enabled", "true")
            }
            promise.resolve(null)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to start service", e)
            promise.reject("START_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun stopService() {
        AppLogger.d(TAG, "Stopping Service via UI")

        val intent = Intent(reactApplicationContext, LocationForegroundService::class.java)
        reactApplicationContext.stopService(intent)

        moduleScope.launch(Dispatchers.IO) {
            dbHelper.saveSetting("tracking_enabled", "false")
        }
    }

    @ReactMethod
    fun getDatabaseSize(promise: Promise) =
        executeAsync(promise) { dbHelper.getDatabaseSizeMB() }

    @ReactMethod
    fun getStats(promise: Promise) = executeAsync(promise) {
        val (queued, total, today) = dbHelper.getStats()
        
        Arguments.createMap().apply {
            putInt("queued", queued)
            putInt("sent", total - queued)
            putInt("total", total)
            putInt("today", today)
            putDouble("databaseSizeMB", dbHelper.getDatabaseSizeMB())
        }
    }

    @ReactMethod
    fun getTableData(tableName: String, limit: Int, offset: Int, promise: Promise) = 
        executeAsync(promise) {
            val rawData = dbHelper.getTableData(tableName, limit, offset)
            Arguments.createArray().apply {
                rawData.forEach { row -> pushMap(Arguments.makeNativeMap(row)) }
            }
        }

    @ReactMethod
    fun getLocationsByDateRange(startTimestamp: Double, endTimestamp: Double, promise: Promise) =
        executeAsync(promise) {
            val rawData = dbHelper.getLocationsByDateRange(startTimestamp.toLong(), endTimestamp.toLong())
            Arguments.createArray().apply {
                rawData.forEach { row -> pushMap(Arguments.makeNativeMap(row)) }
            }
        }

    @ReactMethod
    fun getDaysWithData(startTimestamp: Double, endTimestamp: Double, promise: Promise) =
        executeAsync(promise) {
            val days = dbHelper.getDaysWithData(startTimestamp.toLong(), endTimestamp.toLong())
            Arguments.createArray().apply {
                days.forEach { pushString(it) }
            }
        }

    @ReactMethod
    fun getDailyStats(startTimestamp: Double, endTimestamp: Double, promise: Promise) =
        executeAsync(promise) {
            val stats = dbHelper.getDailyStats(startTimestamp.toLong(), endTimestamp.toLong())
            Arguments.createArray().apply {
                stats.forEach { row -> pushMap(Arguments.makeNativeMap(row)) }
            }
        }

    @ReactMethod
    fun insertDummyData(promise: Promise) {
        if (!BuildConfig.DEBUG) {
            promise.reject("ERR_NOT_DEBUG", "insertDummyData is only available in debug builds")
            return
        }
        executeAsync(promise) {
        val now = System.currentTimeMillis() / 1000
        var count = 0

        // Realistic scenario: Home (Friedrichshain) → Supermarket → Gym → Home
        // All locations follow real Berlin streets for plausible GPS tracks.

        // Home: Boxhagener Platz area, Friedrichshain
        // Supermarket: REWE on Warschauer Str (~1.2 km south)
        // Gym: FitX Ostkreuz (~1.5 km south-east of supermarket)

        // Trip 1: Home → Supermarket (driving, ~12 min)
        val trip1 = arrayOf(
            //             lat         lon       alt  speed  acc
            doubleArrayOf(52.51420, 13.45830, 38.0, 0.2, 4.0),   // parked at home
            doubleArrayOf(52.51390, 13.45780, 37.0, 3.5, 5.0),   // pulling out
            doubleArrayOf(52.51310, 13.45650, 36.0, 8.2, 4.0),   // Grünberger Str
            doubleArrayOf(52.51220, 13.45490, 35.0, 11.5, 3.5),  // heading south
            doubleArrayOf(52.51120, 13.45340, 35.0, 12.8, 3.0),  // Revaler Str
            doubleArrayOf(52.50980, 13.45220, 34.0, 10.1, 4.0),  // turning onto Warschauer
            doubleArrayOf(52.50870, 13.45100, 34.0, 8.7, 3.5),   // Warschauer Str south
            doubleArrayOf(52.50760, 13.44950, 33.0, 11.3, 3.0),  // passing S-Bahn bridge
            doubleArrayOf(52.50650, 13.44820, 33.0, 9.4, 4.0),   // Stralauer Allee
            doubleArrayOf(52.50560, 13.44710, 33.0, 6.2, 4.5),   // slowing down
            doubleArrayOf(52.50490, 13.44650, 32.0, 2.1, 5.0),   // arriving
            doubleArrayOf(52.50460, 13.44630, 32.0, 0.3, 4.0)    // parked at supermarket
        )

        // Trip 2: Supermarket → Gym (driving, ~8 min)
        val trip2 = arrayOf(
            doubleArrayOf(52.50460, 13.44630, 32.0, 0.5, 4.0),   // leaving supermarket
            doubleArrayOf(52.50430, 13.44700, 32.0, 5.8, 4.5),   // pulling out east
            doubleArrayOf(52.50380, 13.44890, 33.0, 10.2, 3.5),  // Stralauer Allee east
            doubleArrayOf(52.50340, 13.45120, 33.0, 12.5, 3.0),  // along the Spree
            doubleArrayOf(52.50310, 13.45380, 34.0, 11.8, 3.5),  // heading east
            doubleArrayOf(52.50270, 13.45640, 34.0, 9.6, 4.0),   // Modersohnstr area
            doubleArrayOf(52.50230, 13.45900, 35.0, 8.3, 4.0),   // near Ostkreuz
            doubleArrayOf(52.50180, 13.46100, 35.0, 5.1, 4.5),   // slowing for turn
            doubleArrayOf(52.50150, 13.46250, 35.0, 2.4, 5.0),   // arriving at gym
            doubleArrayOf(52.50140, 13.46280, 35.0, 0.2, 4.0)    // parked at gym
        )

        // Trip 3: Gym → Home (driving, ~14 min, slightly different route)
        val trip3 = arrayOf(
            doubleArrayOf(52.50140, 13.46280, 35.0, 0.4, 4.0),   // leaving gym
            doubleArrayOf(52.50190, 13.46180, 35.0, 4.2, 4.5),   // pulling out
            doubleArrayOf(52.50280, 13.45980, 34.0, 9.7, 3.5),   // Sonntagstr north
            doubleArrayOf(52.50390, 13.45820, 34.0, 11.4, 3.0),  // heading north-west
            doubleArrayOf(52.50510, 13.45700, 33.0, 12.1, 3.5),  // Simplonstr
            doubleArrayOf(52.50630, 13.45590, 33.0, 10.5, 4.0),  // crossing rail tracks
            doubleArrayOf(52.50740, 13.45480, 34.0, 8.9, 3.5),   // Warschauer north
            doubleArrayOf(52.50860, 13.45360, 34.0, 11.0, 3.0),  // RAW-Gelände area
            doubleArrayOf(52.50970, 13.45280, 35.0, 9.3, 4.0),   // Revaler Str
            doubleArrayOf(52.51080, 13.45370, 36.0, 10.8, 3.5),  // turning onto Grünberger
            doubleArrayOf(52.51190, 13.45490, 37.0, 8.2, 4.0),   // Grünberger Str north
            doubleArrayOf(52.51290, 13.45620, 37.0, 6.5, 4.5),   // approaching home
            doubleArrayOf(52.51370, 13.45740, 38.0, 3.1, 5.0),   // slowing down
            doubleArrayOf(52.51420, 13.45830, 38.0, 0.2, 4.0)    // back home
        )

        // Generate data for the past 7 days with slight daily variation
        for (dayOffset in 6 downTo 0) {
            val dayMidnight = now - (now % 86400) - (dayOffset * 86400L)
            val battery = 92 - (dayOffset * 3)
            // Small daily jitter so tracks aren't perfectly identical
            val jitterLat = (dayOffset * 0.00003) - 0.00009
            val jitterLon = (dayOffset * 0.00002) - 0.00006

            // Trip 1: Home → Supermarket, depart 09:30, ~30s between points
            val t1Start = dayMidnight + 9 * 3600 + 1800
            for ((i, wp) in trip1.withIndex()) {
                val ts = t1Start + (i * 30L)
                if (ts > now) break
                dbHelper.saveLocation(
                    wp[0] + jitterLat, wp[1] + jitterLon,
                    wp[4], wp[2].toInt(), wp[3],
                    null, battery - i, 1, ts
                )
                count++
            }

            // Gap: 45 min at supermarket (triggers trip segmentation at 15-min threshold)

            // Trip 2: Supermarket → Gym, depart 10:20, ~30s between points
            val t2Start = dayMidnight + 10 * 3600 + 1200
            for ((i, wp) in trip2.withIndex()) {
                val ts = t2Start + (i * 30L)
                if (ts > now) break
                dbHelper.saveLocation(
                    wp[0] + jitterLat, wp[1] + jitterLon,
                    wp[4], wp[2].toInt(), wp[3],
                    null, battery - 15 - i, 2, ts
                )
                count++
            }

            // Gap: 1h 30min at gym

            // Trip 3: Gym → Home, depart 12:00, ~30s between points
            val t3Start = dayMidnight + 12 * 3600
            for ((i, wp) in trip3.withIndex()) {
                val ts = t3Start + (i * 30L)
                if (ts > now) break
                dbHelper.saveLocation(
                    wp[0] + jitterLat, wp[1] + jitterLon,
                    wp[4], wp[2].toInt(), wp[3],
                    null, battery - 30 - i, 1, ts
                )
                count++
            }

            // Skip afternoon trip on some days for variety
            if (dayOffset % 2 == 0) continue

            // Trip 4 (some days): Quick evening walk, depart 18:00
            // Short loop around Boxhagener Platz (~10 min walk)
            val walkTrip = arrayOf(
                doubleArrayOf(52.51420, 13.45830, 38.0, 1.2, 6.0),
                doubleArrayOf(52.51450, 13.45900, 38.0, 1.4, 5.5),
                doubleArrayOf(52.51480, 13.45970, 38.0, 1.3, 5.0),
                doubleArrayOf(52.51500, 13.46050, 38.0, 1.5, 5.5),
                doubleArrayOf(52.51480, 13.46130, 38.0, 1.4, 6.0),
                doubleArrayOf(52.51450, 13.46080, 38.0, 1.3, 5.5),
                doubleArrayOf(52.51430, 13.45970, 38.0, 1.2, 5.0),
                doubleArrayOf(52.51420, 13.45830, 38.0, 0.3, 6.0)
            )
            val t4Start = dayMidnight + 18 * 3600
            for ((i, wp) in walkTrip.withIndex()) {
                val ts = t4Start + (i * 75L)
                if (ts > now) break
                dbHelper.saveLocation(
                    wp[0] + jitterLat, wp[1] + jitterLon,
                    wp[4], wp[2].toInt(), wp[3],
                    null, battery - 45 - i, 1, ts
                )
                count++
            }
        }
        count
    }
    }

    @ReactMethod
    fun manualFlush(promise: Promise) {
        try {
            startServiceWithAction(LocationForegroundService.ACTION_MANUAL_FLUSH)
            promise.resolve(true)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Manual flush failed", e)
            promise.reject("FLUSH_ERROR", e.message, e)
        }
    }

    @ReactMethod 
    fun clearSentHistory(promise: Promise) = executeAsync(promise) { 
        val deleted = dbHelper.clearSentHistory()
        moduleScope.launch(Dispatchers.IO) {  dbHelper.vacuum() }
        deleted
    }
    
    @ReactMethod
    fun clearQueue(promise: Promise) = executeAsync(promise) {
        val deleted = dbHelper.clearQueue()
        refreshNotificationIfTracking()
        moduleScope.launch(Dispatchers.IO) {  dbHelper.vacuum() }
        deleted
    }
    
    @ReactMethod
    fun clearAllLocations(promise: Promise) = executeAsync(promise) {
        val deleted = dbHelper.clearAllLocations()
        refreshNotificationIfTracking()
        moduleScope.launch(Dispatchers.IO) {  dbHelper.vacuum() }
        deleted
    }
    
    @ReactMethod
    fun deleteOlderThan(days: Int, promise: Promise) = executeAsync(promise) {
        val deleted = dbHelper.deleteOlderThan(days)
        refreshNotificationIfTracking()
        moduleScope.launch(Dispatchers.IO) {  dbHelper.vacuum() }
        deleted
    }
    
    @ReactMethod
    fun vacuumDatabase(promise: Promise) = executeAsync(promise) { 
        dbHelper.vacuum()
        true 
    }

    private fun triggerZoneRecheck() {
        try {
            startServiceWithAction(LocationForegroundService.ACTION_RECHECK_ZONE)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to trigger zone recheck", e)
        }
    }

    private fun refreshNotificationIfTracking() {
        val isTracking = dbHelper.getSetting("tracking_enabled", "false") == "true"
        if (isTracking) {
            try {
                startServiceWithAction(LocationForegroundService.ACTION_REFRESH_NOTIFICATION)
            } catch (e: Exception) {
                AppLogger.w(TAG, "Notification refresh skipped: service not running")
            }
        }
    }

    /**
    * Creates a geofence and invalidates cache to ensure the 
    * Foreground Service recognizes the change immediately.
    */
    @ReactMethod
    fun createGeofence(
        name: String, 
        lat: Double, 
        lon: Double, 
        radius: Double, 
        pause: Boolean, 
        promise: Promise
    ) = executeAsync(promise) { 
        val result = geofenceHelper.insertGeofence(name, lat, lon, radius, pause)
        if (result > 0) {
            geofenceHelper.invalidateCache()
            triggerZoneRecheck()
        }
        result
    }

    /**
    * Fetches all geofences for the UI.
    * Does not invalidate cache as this is a read-only operation.
    */
    @ReactMethod
    fun getGeofences(promise: Promise) = executeAsync(promise) { 
        geofenceHelper.getGeofencesAsArray() 
    }

    @ReactMethod
    fun updateGeofence(
        id: Int, 
        name: String?, 
        lat: Double?, 
        lon: Double?, 
        radius: Double?, 
        enabled: Boolean?, 
        pause: Boolean?, 
        promise: Promise
    ) = executeAsync(promise) { 
        val result = geofenceHelper.updateGeofence(id, name, lat, lon, radius, enabled, pause)
        if (result) {
            geofenceHelper.invalidateCache() 
            triggerZoneRecheck()
        }
        result
    }

    /**
    * Deletes a geofence and invalidates cache to ensure the 
    * Foreground Service recognizes the change immediately.
    */
   @ReactMethod
    fun deleteGeofence(id: Int, promise: Promise) = executeAsync(promise) { 
        val result = geofenceHelper.deleteGeofence(id)
        if (result) {
            geofenceHelper.invalidateCache()
            triggerZoneRecheck()
        }
        result
    }

    @ReactMethod
    fun checkCurrentPauseZone(promise: Promise) {
        val provider = LocationProviderFactory.create(reactApplicationContext)

        try {
            provider.getLastLocation(
                onSuccess = { loc ->
                    if (loc == null) {
                        promise.resolve(null)
                    } else {
                        executeAsync(promise) {
                            geofenceHelper.getPauseZone(loc)
                        }
                    }
                },
                onFailure = { e ->
                    AppLogger.e(TAG, "Failed to get location for pause zone check", e)
                    promise.resolve(null)
                }
            )
        } catch (e: SecurityException) {
            AppLogger.e(TAG, "Location permission not granted", e)
            promise.resolve(null)
        }
    }

    // ========================================================================
    // TRACKING PROFILES
    // ========================================================================

    @ReactMethod
    fun getProfiles(promise: Promise) = executeAsync(promise) {
        profileHelper.getProfilesAsArray()
    }

    @ReactMethod
    fun createProfile(config: ReadableMap, promise: Promise) = executeAsync(promise) {
        val id = profileHelper.insertProfile(
            name = (config.getString("name") ?: "").trim(),
            intervalMs = config.getDouble("intervalMs").toLong(),
            minUpdateDistance = config.getDouble("minUpdateDistance").toFloat(),
            syncIntervalSeconds = config.getInt("syncIntervalSeconds"),
            priority = config.getInt("priority"),
            conditionType = config.getString("conditionType") ?: ProfileConstants.CONDITION_CHARGING,
            speedThreshold = if (config.hasKey("speedThreshold") && !config.isNull("speedThreshold"))
                config.getDouble("speedThreshold").toFloat() else null,
            deactivationDelaySeconds = config.getInt("deactivationDelaySeconds")
        )
        if (id > 0) {
            profileHelper.invalidateCache()
            triggerProfileRecheck()
        }
        id
    }

    @ReactMethod
    fun updateProfile(config: ReadableMap, promise: Promise) = executeAsync(promise) {
        val result = profileHelper.updateProfile(
            id = config.getInt("id"),
            name = config.getStringOrNull("name")?.trim(),
            intervalMs = config.getDoubleOrNull("intervalMs")?.toLong(),
            minUpdateDistance = config.getDoubleOrNull("minUpdateDistance")?.toFloat(),
            syncIntervalSeconds = config.getIntOrNull("syncIntervalSeconds"),
            priority = config.getIntOrNull("priority"),
            conditionType = config.getStringOrNull("conditionType"),
            speedThreshold = if (config.hasKey("speedThreshold") && !config.isNull("speedThreshold"))
                config.getDouble("speedThreshold").toFloat() else null,
            hasSpeedThreshold = config.hasKey("speedThreshold"),
            deactivationDelaySeconds = config.getIntOrNull("deactivationDelaySeconds"),
            enabled = config.getBooleanOrNull("enabled")
        )
        if (result) {
            profileHelper.invalidateCache()
            triggerProfileRecheck()
        }
        result
    }

    @ReactMethod
    fun deleteProfile(id: Int, promise: Promise) = executeAsync(promise) {
        val result = profileHelper.deleteProfile(id)
        if (result) {
            profileHelper.invalidateCache()
            triggerProfileRecheck()
        }
        result
    }

    @ReactMethod
    fun getActiveProfile(promise: Promise) {
        promise.resolve(activeProfileName)
    }

    @ReactMethod
    fun recheckProfiles(promise: Promise) {
        try {
            triggerProfileRecheck()
            promise.resolve(true)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Profile recheck failed", e)
            promise.reject("RECHECK_ERROR", e.message, e)
        }
    }

    private fun triggerProfileRecheck() {
        val isTracking = dbHelper.getSetting("tracking_enabled", "false") == "true"
        if (isTracking) {
            try {
                startServiceWithAction(LocationForegroundService.ACTION_RECHECK_PROFILES)
            } catch (e: Exception) {
                AppLogger.w(TAG, "Profile recheck skipped: service not running")
            }
        }
    }

    @ReactMethod
    fun recheckZoneSettings(promise: Promise) {
        triggerZoneRecheck() 
        promise.resolve(null)
    }

    @ReactMethod
    fun forceExitZone(promise: Promise) {
        try {
            startServiceWithAction(LocationForegroundService.ACTION_FORCE_EXIT_ZONE)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("FORCE_EXIT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun saveSetting(key: String, value: String, promise: Promise) =
        executeAsync(promise) {
            dbHelper.saveSetting(key, value)
            if (key == "debug_mode_enabled") {
                AppLogger.enabled = value.toBoolean()
            }
            true
        }

    @ReactMethod
    fun getSetting(key: String, default: String?, promise: Promise) = 
        executeAsync(promise) { 
            dbHelper.getSetting(key, default) 
        }

    @ReactMethod
    fun getAllSettings(promise: Promise) = executeAsync(promise) {
        val settingsMap = dbHelper.getAllSettings()
        Arguments.createMap().apply {
            settingsMap.forEach { (k, v) -> putString(k, v) }
        }
    }

    @ReactMethod
    fun isNetworkAvailable(promise: Promise) {
        promise.resolve(networkManager.isNetworkAvailable())
    }

    @ReactMethod
    fun getMostRecentLocation(promise: Promise) = executeAsync(promise) {
        dbHelper.getRawMostRecentLocation()?.let { data ->
            Arguments.makeNativeMap(data)
        }
    }

    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        promise.resolve(deviceInfo.isIgnoringBatteryOptimizations())
    }

    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        try {
            val result = deviceInfo.requestIgnoreBatteryOptimizations()
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message, e)
        }
    }

    private fun startServiceWithAction(action: String) {
        try {
            val intent = Intent(reactApplicationContext, LocationForegroundService::class.java).apply {
                this.action = action
            }
            
            reactApplicationContext.startForegroundService(intent)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to start service with action: $action", e)
            throw e
        }
    }

    @ReactMethod
    fun getDeviceInfo(promise: Promise) {
        try {
            promise.resolve(deviceInfo.getDeviceInfo())
        } catch (e: Exception) {
            promise.reject("DEVICE_INFO_ERROR", e.message)
        }
    }

    @ReactMethod
    fun writeFile(fileName: String, content: String, promise: Promise) = 
        executeAsync(promise) { fileOps.writeFile(fileName, content) }


    @ReactMethod
    fun shareFile(filePath: String, mimeType: String, title: String, promise: Promise) = 
        executeAsync(promise) { fileOps.shareFile(filePath, mimeType, title) }

    
    @ReactMethod
    fun copyToClipboard(text: String, label: String, promise: Promise) {
        moduleScope.launch {
            try {
                withContext(Dispatchers.Main) { fileOps.copyToClipboard(text, label) }
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("CLIPBOARD_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun deleteFile(filePath: String, promise: Promise) =
        executeAsync(promise) { fileOps.deleteFile(filePath) }

    @ReactMethod
    fun getCacheDirectory(promise: Promise) =
        executeAsync(promise) { fileOps.getCacheDirectory() }

    @ReactMethod
    fun getAllAuthConfig(promise: Promise) = executeAsync(promise) {
        Arguments.createMap().apply {
            putString("authType", secureStorage.getString(SecureStorageHelper.KEY_AUTH_TYPE, "none"))
            putString("username", secureStorage.getString(SecureStorageHelper.KEY_USERNAME, ""))
            putString("password", secureStorage.getString(SecureStorageHelper.KEY_PASSWORD, ""))
            putString("bearerToken", secureStorage.getString(SecureStorageHelper.KEY_BEARER_TOKEN, ""))
            putString("customHeaders", secureStorage.getString(SecureStorageHelper.KEY_CUSTOM_HEADERS, "{}"))
        }
    }

    @ReactMethod
    fun saveAuthConfig(config: ReadableMap, promise: Promise) = executeAsync(promise) {
        config.getString("authType")?.let {
            secureStorage.putString(SecureStorageHelper.KEY_AUTH_TYPE, it)
        }
        config.getString("username")?.let {
            secureStorage.putString(SecureStorageHelper.KEY_USERNAME, it)
        }
        config.getString("password")?.let {
            secureStorage.putString(SecureStorageHelper.KEY_PASSWORD, it)
        }
        config.getString("bearerToken")?.let {
            secureStorage.putString(SecureStorageHelper.KEY_BEARER_TOKEN, it)
        }
        config.getString("customHeaders")?.let {
            secureStorage.putString(SecureStorageHelper.KEY_CUSTOM_HEADERS, it)
        }
        true
    }

    @ReactMethod
    fun getAuthHeaders(promise: Promise) = executeAsync(promise) {
        val headers = secureStorage.getAuthHeaders()
        Arguments.createMap().apply {
            headers.forEach { (k, v) -> putString(k, v) }
        }
    }

    @ReactMethod
    fun getNativeLogs(promise: Promise) = executeAsync(promise) {
        val pid = android.os.Process.myPid()
        val process = Runtime.getRuntime().exec(arrayOf("logcat", "-d", "-v", "threadtime", "--pid=$pid"))
        val lines = process.inputStream.bufferedReader().readLines()
        process.waitFor(10, java.util.concurrent.TimeUnit.SECONDS)
        Arguments.createArray().apply {
            lines.filter { "Colota." in it }.forEach { pushString(it) }
        }
    }
}

