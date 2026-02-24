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
import com.Colota.util.SecureStorageHelper
import android.os.Build
import android.util.Log
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
                Log.e(TAG, "Failed to send location event", e)
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
                Log.e(TAG, "Failed to send tracking stopped event", e)
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
                Log.e(TAG, "Failed to send sync error event", e)
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
                Log.e(TAG, "Failed to send profile switch event", e)
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
                Log.e(TAG, "Failed to send sync progress event", e)
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
                Log.e(TAG, "Failed to send pause zone event", e)
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
                Log.e(TAG, "Database operation failed", e)
                promise.reject("DB_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun startService(config: ReadableMap, promise: Promise) {
        Log.d(TAG, "Starting Service with config")

        val serviceConfig = ServiceConfig.fromReadableMap(config, dbHelper)
        val serviceIntent = Intent(reactApplicationContext, LocationForegroundService::class.java)
        serviceConfig.toIntent(serviceIntent)

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(serviceIntent)
            } else {
                reactApplicationContext.startService(serviceIntent)
            }
            moduleScope.launch(Dispatchers.IO) {
                dbHelper.saveSetting("tracking_enabled", "true")
            }
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start service", e)
            promise.reject("START_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun stopService() {
        Log.d(TAG, "Stopping Service via UI")

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
    fun manualFlush(promise: Promise) {
        try {
            startServiceWithAction(LocationForegroundService.ACTION_MANUAL_FLUSH)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Manual flush failed", e)
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
            Log.e(TAG, "Failed to trigger zone recheck", e)
        }
    }

    private fun refreshNotificationIfTracking() {
        val isTracking = dbHelper.getSetting("tracking_enabled", "false") == "true"
        if (isTracking) {
            try {
                startServiceWithAction(LocationForegroundService.ACTION_REFRESH_NOTIFICATION)
            } catch (e: Exception) {
                Log.w(TAG, "Notification refresh skipped: service not running", e)
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
                    Log.e(TAG, "Failed to get location for pause zone check", e)
                    promise.resolve(null)
                }
            )
        } catch (e: SecurityException) {
            Log.e(TAG, "Location permission not granted", e)
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
            Log.e(TAG, "Profile recheck failed", e)
            promise.reject("RECHECK_ERROR", e.message, e)
        }
    }

    private fun triggerProfileRecheck() {
        val isTracking = dbHelper.getSetting("tracking_enabled", "false") == "true"
        if (isTracking) {
            try {
                startServiceWithAction(LocationForegroundService.ACTION_RECHECK_PROFILES)
            } catch (e: Exception) {
                Log.w(TAG, "Profile recheck skipped: service not running", e)
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
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(intent)
            } else {
                reactApplicationContext.startService(intent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start service with action: $action", e)
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
}

