/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
 
package com.Colota

import android.content.Context
import android.os.PowerManager
import android.provider.Settings
import android.net.Uri
import android.content.Intent
import android.net.Network
import android.net.ConnectivityManager.NetworkCallback
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.location.LocationServices
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import org.json.JSONObject
import kotlinx.coroutines.*

/**
 * React Native bridge module for managing the Location Service.
 * Acts as the middleware between the JS UI and the Native Foreground Service/Database.
 */
class LocationServiceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), 
    LifecycleEventListener { 

    private val locationUtils = LocationUtils(reactContext)
    private val dbHelper = LocationDatabaseHelper.getInstance(reactContext)
    
    // Use a fixed thread pool instead of unlimited threads
    private val dbExecutor: ExecutorService = Executors.newFixedThreadPool(2)
    
    // Cache connectivity manager
    private val connectivityManager by lazy {
        reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
    }
    
    // Network state listener to avoid polling
    private val networkCallback = object : NetworkCallback() {
        override fun onAvailable(network: Network) {
            // Network just became available
            dbExecutor.execute {
                val queuedCount = dbHelper.getQueuedCount()
                if (queuedCount > 0) {
                    val syncInterval = dbHelper.getSetting("syncInterval", "0")?.toIntOrNull() ?: 0
                    
                    if (syncInterval == 0) {
                        if (BuildConfig.DEBUG) {
                            Log.d(TAG, "Network available, triggering manual flush for $queuedCount items")
                        }
                        val intent = Intent(
                            reactApplicationContext,
                            LocationForegroundService::class.java
                        ).apply {
                            action = "com.Colota.ACTION_MANUAL_FLUSH"
                        }
                        try {
                            reactApplicationContext.startService(intent)
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed to trigger manual flush", e)
                        }
                    } else if (BuildConfig.DEBUG) {
                        Log.d(TAG, "Network available, $queuedCount items queued for next sync interval")
                    }
                }
            }
        }
    }

    // Coroutine scope for async operations
    private val moduleScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    init {
        reactContextStatic = reactContext
        reactContext.addLifecycleEventListener(this)
        
        // Register network callback
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                connectivityManager.registerDefaultNetworkCallback(networkCallback)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to register network callback", e)
            }
        }
    }

    companion object {
        private const val TAG = "LocationServiceModule"
        private var reactContextStatic: ReactApplicationContext? = null
        
        @Volatile
        private var isAppInForeground: Boolean = true

        /**
         * Emits location updates to the React Native 'onLocationUpdate' listener.
         */
        @JvmStatic
        fun sendLocationEvent(location: android.location.Location): Boolean {
            // Check foreground state first (cheapest check)
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

        /**
         * Emits silent zone entry/exit events to the React Native 'onSilentZoneChange' listener.
         */
        @JvmStatic
        fun sendSilentZoneEvent(entered: Boolean, zoneName: String?): Boolean {
            val context = reactContextStatic ?: return false
            if (!context.hasActiveCatalystInstance()) return false
            
            return try {
                val params = Arguments.createMap().apply {
                    putBoolean("entered", entered)
                    putString("zoneName", zoneName)
                }
                context
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onSilentZoneChange", params)
                true
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send silent zone event", e)
                false
            }
        }
    }

    override fun getName(): String = "LocationServiceModule"

    // Lifecycle
    override fun onHostResume() { 
        isAppInForeground = true 
    }
    
    override fun onHostPause() { 
        isAppInForeground = false 
    }
    
    override fun onHostDestroy() { 
        isAppInForeground = false
        
        // Cleanup network callback
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback)
            } catch (e: Exception) {
                // Already unregistered or never registered
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, "Network callback cleanup: ${e.message}")
                }
            }
        }
        
        moduleScope.cancel()
    }

    // ==============================================================
    // HELPERS
    // ==============================================================

    /**
     * Standardized wrapper to resolve or reject a Promise.
     * Runs operation on database executor to avoid blocking main thread.
     */
    private fun executeAsync(promise: Promise, operation: () -> Any?) {
        dbExecutor.execute {
            try {
                val result = operation()
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e(TAG, "Database operation failed", e)
                promise.reject("DB_ERROR", e.message, e)
            }
        }
    }

    // ==============================================================
    // SERVICE CONTROL
    // ==============================================================

    /**
     * Starts the Foreground Tracking Service with the provided configuration.
     */
    @ReactMethod
    fun startService(config: ReadableMap) {
        Log.d(TAG, "Starting Service with config")
        
        // Don't block on DB write - do it async
        dbExecutor.execute {
            dbHelper.saveSetting("tracking_enabled", "true")
        }

        val serviceIntent = Intent(reactApplicationContext, LocationForegroundService::class.java).apply {
            config.getDoubleOrNull("interval")?.let { putExtra("interval", it.toLong()) }
            config.getDoubleOrNull("minUpdateDistance")?.let { putExtra("minUpdateDistance", it.toFloat()) }
            config.getStringOrNull("endpoint")?.let { putExtra("endpoint", it) }
            config.getIntOrNull("syncInterval")?.let { putExtra("syncInterval", it) }
            config.getDoubleOrNull("accuracyThreshold")?.let { putExtra("accuracyThreshold", it.toFloat()) }
            config.getBooleanOrNull("filterInaccurateLocations")?.let { putExtra("filterInaccurateLocations", it) }
            config.getIntOrNull("maxRetries")?.let { putExtra("maxRetries", it) }
            config.getIntOrNull("retryInterval")?.let { putExtra("retryInterval", it) }
            config.getBooleanOrNull("isOfflineMode")?.let { putExtra("isOfflineMode", it) }
            
            config.getMap("fieldMap")?.let { map ->
                val jsonString = locationUtils.convertFieldMapToJson(map)
                putExtra("fieldMap", jsonString)
            }
        }

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

    /**
     * Stops the background service and persists the disabled state.
     */
    @ReactMethod
    fun stopService() {
        Log.d(TAG, "Stopping Service via UI")
        
        // Stop service first (immediate), then save to DB
        val intent = Intent(reactApplicationContext, LocationForegroundService::class.java)
        reactApplicationContext.stopService(intent)
        
        // Save disabled state async (don't block)
        dbExecutor.execute {
            dbHelper.saveSetting("tracking_enabled", "false")
        }
    }

    // ==============================================================
    // STATS & DATA RETRIEVAL
    // ==============================================================

    @ReactMethod 
    fun getQueuedLocationsCount(promise: Promise) = 
        executeAsync(promise) { dbHelper.getQueuedCount() }
    
    @ReactMethod 
    fun getSentCount(promise: Promise) = 
        executeAsync(promise) { dbHelper.getSentCount() }
    
    @ReactMethod 
    fun getTotalCount(promise: Promise) = 
        executeAsync(promise) { dbHelper.getTotalCount() }
    
    @ReactMethod 
    fun getTodayCount(promise: Promise) = 
        executeAsync(promise) { dbHelper.getTodayCount() }
    
    @ReactMethod 
    fun getDatabaseSize(promise: Promise) = 
        executeAsync(promise) { dbHelper.getDatabaseSizeMB() }

    // Combined stats query for better performance
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

    // ==============================================================
    // DATABASE MANAGEMENT
    // ==============================================================

    @ReactMethod
    fun manualFlush(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, LocationForegroundService::class.java).apply {
                action = "com.Colota.ACTION_MANUAL_FLUSH"
            }
            reactApplicationContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Manual flush failed", e)
            promise.reject("FLUSH_ERROR", e.message, e)
        }
    }

    @ReactMethod 
    fun clearSentHistory(promise: Promise) = executeAsync(promise) { 
        val deleted = dbHelper.clearSentHistory()
        dbExecutor.execute { dbHelper.vacuum() }
        deleted
    }
    
    @ReactMethod 
    fun clearQueue(promise: Promise) = executeAsync(promise) { 
        val deleted = dbHelper.clearQueue()
        dbExecutor.execute { dbHelper.vacuum() }
        deleted 
    }
    
    @ReactMethod 
    fun clearAllLocations(promise: Promise) = executeAsync(promise) { 
        val deleted = dbHelper.clearAllLocations()
        dbExecutor.execute { dbHelper.vacuum() }
        deleted
    }
    
    @ReactMethod
    fun deleteOlderThan(days: Int, promise: Promise) = executeAsync(promise) { 
        val deleted = dbHelper.deleteOlderThan(days)
        dbExecutor.execute { dbHelper.vacuum() }
        deleted 
    }
    
    @ReactMethod
    fun vacuumDatabase(promise: Promise) = executeAsync(promise) { 
        dbHelper.vacuum()
        true 
    }

    // ==============================================================
    // GEOFENCE OPERATIONS
    // ==============================================================

    @ReactMethod
    fun createGeofence(
        name: String, 
        lat: Double, 
        lon: Double, 
        radius: Double, 
        pause: Boolean, 
        promise: Promise
    ) = executeAsync(promise) { 
        val result = locationUtils.insertGeofence(name, lat, lon, radius, pause)
        
        // OPTIMIZATION 8: Trigger zone recheck after creating geofence
        if (result > 0) {
            try {
                val intent = Intent(reactApplicationContext, LocationForegroundService::class.java).apply {
                    action = "com.Colota.RECHECK_SILENT_ZONE"
                }
                reactApplicationContext.startService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to trigger zone recheck", e)
            }
        }
        
        result
    }

    @ReactMethod
    fun getGeofences(promise: Promise) = executeAsync(promise) { 
        locationUtils.getGeofencesAsArray() 
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
        val result = locationUtils.updateGeofence(id, name, lat, lon, radius, enabled, pause)
        
        // Trigger zone recheck after updating geofence
        if (result) {
            try {
                val intent = Intent(reactApplicationContext, LocationForegroundService::class.java).apply {
                    action = "com.Colota.RECHECK_SILENT_ZONE"
                }
                reactApplicationContext.startService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to trigger zone recheck", e)
            }
        }
        
        result
    }

    @ReactMethod
    fun deleteGeofence(id: Int, promise: Promise) = executeAsync(promise) { 
        val result = locationUtils.deleteGeofence(id)
        
        // Trigger zone recheck after deleting geofence
        if (result) {
            try {
                val intent = Intent(reactApplicationContext, LocationForegroundService::class.java).apply {
                    action = "com.Colota.RECHECK_SILENT_ZONE"
                }
                reactApplicationContext.startService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to trigger zone recheck", e)
            }
        }
        
        result
    }

    // ==============================================================
    // SILENT ZONE LOGIC
    // ==============================================================

    @ReactMethod
    fun checkCurrentSilentZone(promise: Promise) {
        val fusedClient = LocationServices.getFusedLocationProviderClient(reactApplicationContext)
        
        try {
            fusedClient.lastLocation.addOnSuccessListener { loc ->
                if (loc == null) {
                    promise.resolve(null)
                } else {
                    // Run on executor to avoid blocking
                    dbExecutor.execute { 
                        try {
                            promise.resolve(locationUtils.getSilentZone(loc))
                        } catch (e: Exception) {
                            promise.reject("ERROR", e.message, e)
                        }
                    }
                }
            }.addOnFailureListener { e ->
                Log.e(TAG, "Failed to get location for silent zone check", e)
                promise.resolve(null)
            }
        } catch (e: SecurityException) {
            Log.e(TAG, "Location permission not granted", e)
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun forceExitZone(promise: Promise) {
        try {
            val intent = Intent(reactApplicationContext, LocationForegroundService::class.java).apply {
                action = LocationForegroundService.ACTION_FORCE_EXIT_ZONE
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactApplicationContext.startForegroundService(intent)
            } else {
                reactApplicationContext.startService(intent)
            }
            
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to force exit zone", e)
            promise.reject("FORCE_EXIT_ERROR", e.message, e)
        }
    }

    // ==============================================================
    // SETTINGS PERSISTENCE
    // ==============================================================

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

    // ==============================================================
    // UTILITY
    // ==============================================================

    @ReactMethod
    fun getMostRecentLocation(promise: Promise) = executeAsync(promise) {
        dbHelper.getRawMostRecentLocation()?.let { data ->
            Arguments.makeNativeMap(data)
        }
    }

    // Cache power manager
    private val powerManager by lazy {
        reactApplicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
    }

    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            promise.resolve(powerManager.isIgnoringBatteryOptimizations(reactApplicationContext.packageName))
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            promise.resolve(true)
            return
        }

        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${reactApplicationContext.packageName}")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open battery optimization settings", e)
            // Fallback to general settings
            try {
                val fallbackIntent = Intent(Settings.ACTION_SETTINGS).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactApplicationContext.startActivity(fallbackIntent)
                promise.resolve(false)
            } catch (e2: Exception) {
                promise.reject("ERROR", e2.message, e2)
            }
        }
    }
}

// Extension functions for safer ReadableMap access
private fun ReadableMap.getDoubleOrNull(key: String): Double? = 
    if (hasKey(key)) getDouble(key) else null

private fun ReadableMap.getIntOrNull(key: String): Int? = 
    if (hasKey(key)) getInt(key) else null

private fun ReadableMap.getStringOrNull(key: String): String? = 
    if (hasKey(key)) getString(key) else null

private fun ReadableMap.getBooleanOrNull(key: String): Boolean? = 
    if (hasKey(key)) getBoolean(key) else null