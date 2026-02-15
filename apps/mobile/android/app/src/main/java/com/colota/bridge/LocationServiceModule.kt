/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
 
package com.Colota.bridge

import android.content.Intent
import com.Colota.BuildConfig
import com.Colota.data.DatabaseHelper
import com.Colota.data.GeofenceHelper
import com.Colota.service.LocationForegroundService
import com.Colota.service.ServiceConfig
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
    private val secureStorage = SecureStorageHelper.getInstance(reactContext)
    private val networkManager = NetworkManager(reactContext)

    private val moduleScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    init {
        reactContextStatic = reactContext
        reactContext.addLifecycleEventListener(this)
    }

    companion object {
        private const val TAG = "LocationServiceModule"
        private var reactContextStatic: ReactApplicationContext? = null
        
        @Volatile
        private var isAppInForeground: Boolean = true
        
        /** Skips when app is backgrounded to avoid unnecessary bridge overhead. */
        @JvmStatic
        fun sendLocationEvent(location: android.location.Location, battery: Int, batteryStatus: Int): Boolean {
            if (!isAppInForeground) return false
            
            val context = reactContextStatic ?: return false
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
                    
                    putDouble("speed", location.speed.toDouble())
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
            val context = reactContextStatic ?: return false
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
            val context = reactContextStatic ?: return false
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

        /** Emits pause zone entry/exit events for the JS geofence UI. */
        @JvmStatic
        fun sendPauseZoneEvent(entered: Boolean, zoneName: String?): Boolean {
            val context = reactContextStatic ?: return false
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
        reactContextStatic = null
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
    fun startService(config: ReadableMap) {
        Log.d(TAG, "Starting Service with config")

        moduleScope.launch(Dispatchers.IO) {
            dbHelper.saveSetting("tracking_enabled", "true")
        }

        val serviceConfig = ServiceConfig.fromReadableMap(config, dbHelper)
        val serviceIntent = Intent(reactApplicationContext, LocationForegroundService::class.java)
        serviceConfig.toIntent(serviceIntent)

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(serviceIntent)
            } else {
                reactApplicationContext.startService(serviceIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start service", e)
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
        moduleScope.launch(Dispatchers.IO) {  dbHelper.vacuum() }
        deleted 
    }
    
    @ReactMethod 
    fun clearAllLocations(promise: Promise) = executeAsync(promise) { 
        val deleted = dbHelper.clearAllLocations()
        moduleScope.launch(Dispatchers.IO) {  dbHelper.vacuum() }
        deleted
    }
    
    @ReactMethod
    fun deleteOlderThan(days: Int, promise: Promise) = executeAsync(promise) { 
        val deleted = dbHelper.deleteOlderThan(days)
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
    fun getSystemVersion(promise: Promise) {
        promise.resolve(deviceInfo.getSystemVersion())
    }

    @ReactMethod
    fun getApiLevel(promise: Promise) {
        promise.resolve(deviceInfo.getApiLevel())
    }

    @ReactMethod
    fun getModel(promise: Promise) {
        promise.resolve(deviceInfo.getModel())
    }

    @ReactMethod
    fun getBrand(promise: Promise) {
        promise.resolve(deviceInfo.getBrand())
    }

    @ReactMethod
    fun getDeviceId(promise: Promise) {
        promise.resolve(deviceInfo.getDeviceId())
    }

    @ReactMethod
    fun writeFile(fileName: String, content: String, promise: Promise) = 
        executeAsync(promise) { fileOps.writeFile(fileName, content) }


    @ReactMethod
    fun shareFile(filePath: String, mimeType: String, title: String, promise: Promise) = 
        executeAsync(promise) { fileOps.shareFile(filePath, mimeType, title) }

    
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

