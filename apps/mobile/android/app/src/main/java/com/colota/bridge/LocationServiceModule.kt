/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
 
package com.Colota.bridge

import android.app.Activity
import android.content.Intent
import com.Colota.BuildConfig
import com.Colota.data.DatabaseHelper
import com.Colota.data.GeofenceHelper
import com.Colota.data.ProfileHelper
import com.Colota.service.LocationForegroundService
import com.Colota.data.SettingsKeys
import com.Colota.service.ProfileConstants
import com.Colota.service.ServiceConfig
import com.Colota.service.getDoubleOrNull
import com.Colota.service.getIntOrNull
import com.Colota.service.getStringOrNull
import com.Colota.service.getBooleanOrNull
import com.Colota.sync.NetworkManager
import com.Colota.util.DeviceInfoHelper
import com.Colota.export.AutoExportConfig
import com.Colota.export.AutoExportScheduler
import com.Colota.export.ExportConverters
import com.Colota.util.FileOperations
import com.Colota.util.AppLogger
import com.Colota.util.SecureStorageHelper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import android.os.Environment
import android.os.StatFs
import java.lang.ref.WeakReference

/**
 * React Native bridge module for managing the Location Service.
 * Acts as the middleware between the JS UI and the Native Foreground Service/Database.
 */
class LocationServiceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), 
    LifecycleEventListener { 

    private val dbHelper = DatabaseHelper.getInstance(reactContext)
    private val fileOps = FileOperations(reactContext)
    private val deviceInfo = DeviceInfoHelper(reactContext)
    private val geofenceHelper = GeofenceHelper(reactContext)
    private val profileHelper = ProfileHelper(reactContext)
    private val secureStorage = SecureStorageHelper.getInstance(reactContext)
    private val networkManager = NetworkManager(reactContext)

    private val moduleScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // SAF directory picker
    private var safPickerPromise: Promise? = null
    private val SAF_PICKER_REQUEST = 9002

    private val activityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode != SAF_PICKER_REQUEST) return
            val promise = safPickerPromise ?: return
            safPickerPromise = null

            if (resultCode != Activity.RESULT_OK || data?.data == null) {
                promise.resolve(null)
                return
            }

            val uri = data.data!!
            // Persist permission so WorkManager can access it later
            val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            reactApplicationContext.contentResolver.takePersistableUriPermission(uri, flags)
            promise.resolve(uri.toString())
        }
    }

    init {
        reactContextRef = WeakReference(reactContext)
        reactContext.addLifecycleEventListener(this)
        reactContext.addActivityEventListener(activityEventListener)
    }

    companion object {
        private const val TAG = "LocationServiceModule"

        /** JS config key -> secure storage key mapping for saveAuthConfig. */
        private val AUTH_CONFIG_KEYS = listOf(
            "authType" to SecureStorageHelper.KEY_AUTH_TYPE,
            "username" to SecureStorageHelper.KEY_USERNAME,
            "password" to SecureStorageHelper.KEY_PASSWORD,
            "bearerToken" to SecureStorageHelper.KEY_BEARER_TOKEN,
            "customHeaders" to SecureStorageHelper.KEY_CUSTOM_HEADERS,
        )

        private var reactContextRef: WeakReference<ReactApplicationContext> = WeakReference(null)
        
        @Volatile
        private var isAppInForeground: Boolean = true

        @Volatile
        private var activeProfileName: String? = null

        private inline fun emit(event: String, build: WritableMap.() -> Unit): Boolean {
            val context = reactContextRef.get() ?: return false
            if (!context.hasActiveCatalystInstance()) return false
            return try {
                val params = Arguments.createMap().apply(build)
                context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(event, params)
                true
            } catch (e: Exception) {
                AppLogger.e(TAG, "Failed to send $event", e)
                false
            }
        }

        /** Skips when app is backgrounded to avoid unnecessary bridge overhead. */
        @JvmStatic
        fun sendLocationEvent(location: android.location.Location, battery: Int, batteryStatus: Int): Boolean {
            if (!isAppInForeground) return false
            return emit("onLocationUpdate") {
                putDouble("latitude", location.latitude)
                putDouble("longitude", location.longitude)
                putDouble("accuracy", location.accuracy.toDouble())
                if (location.hasAltitude()) putDouble("altitude", location.altitude) else putNull("altitude")
                if (location.hasSpeed()) putDouble("speed", location.speed.toDouble()) else putNull("speed")
                putDouble("bearing", if (location.hasBearing()) location.bearing.toDouble() else 0.0)
                putDouble("timestamp", location.time.toDouble())
                putInt("battery", battery)
                putInt("batteryStatus", batteryStatus)
            }
        }

        /** Fires when service stops for non-user reasons (OOM kill, system cleanup). */
        @JvmStatic
        fun sendTrackingStoppedEvent(reason: String): Boolean =
            emit("onTrackingStopped") { putString("reason", reason) }

        /** Only fires after 3+ consecutive sync failures, see SyncManager.startPeriodicSync(). */
        @JvmStatic
        fun sendSyncErrorEvent(message: String, queuedCount: Int): Boolean =
            emit("onSyncError") {
                putString("message", message)
                putInt("queuedCount", queuedCount)
            }

        @JvmStatic
        fun sendProfileSwitchEvent(profileName: String?, profileId: Int?): Boolean {
            activeProfileName = profileName
            return emit("onProfileSwitch") {
                if (profileName != null) putString("profileName", profileName) else putNull("profileName")
                if (profileId != null) putInt("profileId", profileId) else putNull("profileId")
                putBoolean("isDefault", profileName == null)
            }
        }

        @JvmStatic
        fun sendSyncProgressEvent(sent: Int, failed: Int, total: Int): Boolean =
            emit("onSyncProgress") {
                putInt("sent", sent)
                putInt("failed", failed)
                putInt("total", total)
            }

        @JvmStatic
        fun sendAutoExportEvent(success: Boolean, fileName: String?, rowCount: Int, error: String?): Boolean =
            emit("onAutoExportComplete") {
                putBoolean("success", success)
                if (fileName != null) putString("fileName", fileName) else putNull("fileName")
                putInt("rowCount", rowCount)
                if (error != null) putString("error", error) else putNull("error")
            }

        @JvmStatic
        fun sendPauseZoneEvent(entered: Boolean, zoneName: String?, pauseReason: String? = null): Boolean =
            emit("onPauseZoneChange") {
                putBoolean("entered", entered)
                putString("zoneName", zoneName)
                putString("pauseReason", pauseReason)
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


    /** Runs [operation] on Dispatchers.IO and resolves/rejects the JS promise. */
    private fun executeAsync(promise: Promise, operation: suspend () -> Any?) {
        moduleScope.launch {
            try {
                promise.resolve(withContext(Dispatchers.IO) { operation() })
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
                dbHelper.saveSetting(SettingsKeys.TRACKING_ENABLED, "true")
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
            dbHelper.saveSetting(SettingsKeys.TRACKING_ENABLED, "false")
        }
    }

    @ReactMethod
    fun getDatabaseSize(promise: Promise) =
        executeAsync(promise) { dbHelper.getDatabaseSizeMB() }

    @ReactMethod
    fun getStats(promise: Promise) = executeAsync(promise) {
        val stats = dbHelper.getStats()

        Arguments.createMap().apply {
            putInt("queued", stats.queued)
            putInt("sent", stats.sent)
            putInt("total", stats.total)
            putInt("today", stats.today)
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
        executeAsync(promise) { DebugSeedData.insertDummyData(dbHelper) }
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
        deleteThenVacuum { dbHelper.clearSentHistory() }
    }

    @ReactMethod
    fun clearQueue(promise: Promise) = executeAsync(promise) {
        deleteThenVacuum(refresh = true) { dbHelper.clearQueue() }
    }

    @ReactMethod
    fun clearAllLocations(promise: Promise) = executeAsync(promise) {
        deleteThenVacuum(refresh = true) { dbHelper.clearAllLocations() }
    }

    @ReactMethod
    fun deleteOlderThan(days: Int, promise: Promise) = executeAsync(promise) {
        deleteThenVacuum(refresh = true) { dbHelper.deleteOlderThan(days) }
    }

    @ReactMethod
    fun deleteLocationsInRange(startTs: Double, endTs: Double, promise: Promise) = executeAsync(promise) {
        deleteThenVacuum(refresh = true) { dbHelper.deleteInRange(startTs.toLong(), endTs.toLong()) }
    }
    
    @ReactMethod
    fun vacuumDatabase(promise: Promise) = executeAsync(promise) { 
        dbHelper.vacuum()
        true 
    }

    private fun triggerZoneRecheck() {
        val isTracking = dbHelper.getSetting(SettingsKeys.TRACKING_ENABLED, "false") == "true"
        if (!isTracking) return
        try {
            startServiceWithAction(LocationForegroundService.ACTION_RECHECK_ZONE)
        } catch (e: Exception) {
            AppLogger.w(TAG, "Zone recheck skipped: service not running")
        }
    }

    private fun refreshNotificationIfTracking() {
        val isTracking = dbHelper.getSetting(SettingsKeys.TRACKING_ENABLED, "false") == "true"
        if (isTracking) {
            try {
                startServiceWithAction(LocationForegroundService.ACTION_REFRESH_NOTIFICATION)
            } catch (e: Exception) {
                AppLogger.w(TAG, "Notification refresh skipped: service not running")
            }
        }
    }

    /** Asks the service to re-evaluate pause zones so the geofence change takes effect immediately. */
    private fun afterGeofenceMutation(changed: Boolean) {
        if (!changed) return
        triggerZoneRecheck()
    }

    /** Invalidates the profile cache and asks the service to re-evaluate active profile so the change takes effect immediately. */
    private fun afterProfileMutation(changed: Boolean) {
        if (!changed) return
        profileHelper.invalidateCache()
        triggerProfileRecheck()
    }

    /** delete() runs inline; vacuum is fire-and-forget so callers return immediately. */
    private fun deleteThenVacuum(refresh: Boolean = false, delete: () -> Int): Int {
        val deleted = delete()
        if (refresh) refreshNotificationIfTracking()
        moduleScope.launch(Dispatchers.IO) { dbHelper.vacuum() }
        return deleted
    }

    @ReactMethod
    fun createGeofence(
        name: String,
        lat: Double,
        lon: Double,
        radius: Double,
        pause: Boolean,
        pauseOnWifi: Boolean,
        pauseOnMotionless: Boolean,
        motionlessTimeoutMinutes: Int,
        heartbeatEnabled: Boolean,
        heartbeatIntervalMinutes: Int,
        promise: Promise
    ) = executeAsync(promise) {
        val id = geofenceHelper.insertGeofence(
            name = name,
            lat = lat,
            lon = lon,
            radius = radius,
            pauseTracking = pause,
            pauseOnWifi = pauseOnWifi,
            pauseOnMotionless = pauseOnMotionless,
            motionlessTimeoutMinutes = motionlessTimeoutMinutes,
            heartbeatEnabled = heartbeatEnabled,
            heartbeatIntervalMinutes = heartbeatIntervalMinutes,
        )
        afterGeofenceMutation(id > 0)
        id
    }

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
        pauseOnWifi: Boolean?,
        pauseOnMotionless: Boolean?,
        motionlessTimeoutMinutes: Int?,
        heartbeatEnabled: Boolean?,
        heartbeatIntervalMinutes: Int?,
        promise: Promise
    ) = executeAsync(promise) {
        val changed = geofenceHelper.updateGeofence(
            id = id,
            name = name,
            lat = lat,
            lon = lon,
            radius = radius,
            enabled = enabled,
            pauseTracking = pause,
            pauseOnWifi = pauseOnWifi,
            pauseOnMotionless = pauseOnMotionless,
            motionlessTimeoutMinutes = motionlessTimeoutMinutes,
            heartbeatEnabled = heartbeatEnabled,
            heartbeatIntervalMinutes = heartbeatIntervalMinutes,
        )
        afterGeofenceMutation(changed)
        changed
    }

    @ReactMethod
    fun deleteGeofence(id: Int, promise: Promise) = executeAsync(promise) {
        val changed = geofenceHelper.deleteGeofence(id)
        afterGeofenceMutation(changed)
        changed
    }

    /**
     * Reads the current pause state from persisted settings written by the service
     * on every enter/exit transition. Avoids the location API so opening screens that
     * call this does not trigger Android's location-access indicator.
     */
    @ReactMethod
    fun checkCurrentPauseZone(promise: Promise) = executeAsync(promise) {
        val zoneName = dbHelper.getSetting(SettingsKeys.PAUSE_ZONE_NAME)
        if (zoneName.isNullOrBlank()) return@executeAsync null

        val reason = when {
            dbHelper.getSetting(SettingsKeys.PAUSE_ZONE_WIFI_ACTIVE) == "true" -> "wifi"
            dbHelper.getSetting(SettingsKeys.PAUSE_ZONE_MOTIONLESS_ACTIVE) == "true" -> "motionless"
            else -> null
        }

        Arguments.createMap().apply {
            putString("zoneName", zoneName)
            putString("pauseReason", reason)
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
            deactivationDelaySeconds = config.getInt("deactivationDelaySeconds"),
        )
        afterProfileMutation(id > 0)
        id
    }

    @ReactMethod
    fun updateProfile(config: ReadableMap, promise: Promise) = executeAsync(promise) {
        val changed = profileHelper.updateProfile(
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
            enabled = config.getBooleanOrNull("enabled"),
        )
        afterProfileMutation(changed)
        changed
    }

    @ReactMethod
    fun deleteProfile(id: Int, promise: Promise) = executeAsync(promise) {
        val changed = profileHelper.deleteProfile(id)
        afterProfileMutation(changed)
        changed
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
        val isTracking = dbHelper.getSetting(SettingsKeys.TRACKING_ENABLED, "false") == "true"
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
    fun isValidEndpointProtocol(endpoint: String, promise: Promise) = executeAsync(promise) {
        networkManager.isValidProtocol(endpoint)
    }

    @ReactMethod
    fun isPrivateEndpoint(endpoint: String, promise: Promise) = executeAsync(promise) {
        networkManager.isPrivateEndpoint(endpoint)
    }

    @ReactMethod
    fun isNetworkAvailable(promise: Promise) {
        promise.resolve(networkManager.isNetworkAvailable())
    }

    @ReactMethod
    fun isUnmeteredConnection(promise: Promise) {
        promise.resolve(networkManager.isUnmeteredConnection())
    }

    @ReactMethod
    fun getCurrentSsid(promise: Promise) {
        promise.resolve(networkManager.getCurrentSsid())
    }

    @ReactMethod
    fun getAvailableStorageMB(promise: Promise) {
        try {
            val stat = StatFs(Environment.getDataDirectory().path)
            val availableBytes = stat.availableBlocksLong * stat.blockSizeLong
            promise.resolve((availableBytes / (1024 * 1024)).toDouble())
        } catch (e: Exception) {
            AppLogger.e("LocationServiceModule", "getAvailableStorageMB failed", e)
            promise.resolve(-1.0)
        }
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
    fun isBatteryCritical(promise: Promise) {
        promise.resolve(deviceInfo.isBatteryCritical())
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
        AUTH_CONFIG_KEYS.forEach { (jsKey, storageKey) ->
            config.getString(jsKey)?.let { secureStorage.putString(storageKey, it) }
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
        val process = Runtime.getRuntime().exec(arrayOf("/system/bin/logcat", "-d", "-v", "threadtime"))
        try {
            val lines = process.inputStream.bufferedReader().readLines()
            process.waitFor(10, java.util.concurrent.TimeUnit.SECONDS)
            Arguments.createArray().apply {
                lines.filter { "Colota." in it }.forEach { pushString(it) }
            }
        } finally {
            process.destroy()
        }
    }

    // =========================================================================
    // AUTO-EXPORT
    // =========================================================================

    @ReactMethod
    fun pickExportDirectory(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "No current activity")
            return
        }
        safPickerPromise = promise
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        activity.startActivityForResult(intent, SAF_PICKER_REQUEST)
    }

    @ReactMethod
    fun scheduleAutoExport(promise: Promise) = executeAsync(promise) {
        // Validate that the export directory URI is still accessible
        val config = AutoExportConfig.from(dbHelper)
        if (config.uri != null) {
            val uri = android.net.Uri.parse(config.uri)
            val hasPermission = reactApplicationContext.contentResolver.persistedUriPermissions.any {
                it.uri == uri && it.isReadPermission && it.isWritePermission
            }
            if (!hasPermission) {
                config.saveEnabled(dbHelper, false)
                config.savePermissionLost(dbHelper, true)
                throw Exception("Export directory permission lost. Please re-select the directory.")
            }
        }
        AutoExportScheduler.schedule(reactApplicationContext)
        true
    }

    @ReactMethod
    fun runAutoExportNow(promise: Promise) = executeAsync(promise) {
        AutoExportScheduler.runNow(reactApplicationContext)
        true
    }

    @ReactMethod
    fun cancelAutoExport(promise: Promise) = executeAsync(promise) {
        AutoExportScheduler.cancel(reactApplicationContext)
        true
    }

    @ReactMethod
    fun getAutoExportStatus(promise: Promise) = executeAsync(promise) {
        val config = AutoExportConfig.from(dbHelper)
        val fileCount = config.uri?.let { countExportFiles(it) } ?: 0

        Arguments.createMap().apply {
            putBoolean("enabled", config.enabled)
            putString("format", config.format)
            putString("interval", config.interval)
            putString("uri", config.uri)
            putString("mode", config.mode)
            putDouble("lastExportTimestamp", config.lastExportTimestamp.toDouble())
            putDouble("nextExportTimestamp", config.nextExportTimestamp().toDouble())
            putInt("fileCount", fileCount)
            putInt("retentionCount", config.retentionCount)
            putString("lastFileName", config.lastFileName)
            putInt("lastRowCount", config.lastRowCount)
            putString("lastError", config.lastError)
        }
    }

    @ReactMethod
    fun exportToFile(format: String, promise: Promise) = executeAsync(promise) {
        val ext = ExportConverters.extensionFor(format)
        val dateStr = java.text.SimpleDateFormat("yyyy-MM-dd_HHmm", java.util.Locale.US)
            .format(java.util.Date())
        val tempFile = java.io.File(reactApplicationContext.cacheDir, "manual_export_$dateStr$ext")

        val totalRows = ExportConverters.exportToFile(dbHelper, format, tempFile)

        if (totalRows == 0) {
            tempFile.delete()
            null
        } else {
            Arguments.createMap().apply {
                putString("filePath", tempFile.absolutePath)
                putString("mimeType", ExportConverters.mimeTypeFor(format))
                putInt("rowCount", totalRows)
            }
        }
    }

    @ReactMethod
    fun getExportFiles(promise: Promise) = executeAsync(promise) {
        val config = AutoExportConfig.from(dbHelper)
        if (config.uri == null) {
            Arguments.createArray()
        } else {
            val dirUri = android.net.Uri.parse(config.uri)
            val dir = androidx.documentfile.provider.DocumentFile.fromTreeUri(reactApplicationContext, dirUri)
            val files = dir?.listFiles()
                ?.filter { it.name?.startsWith("colota_export_") == true }
                ?.sortedByDescending { it.name }
                ?: emptyList()

            Arguments.createArray().apply {
                for (file in files) {
                    pushMap(Arguments.createMap().apply {
                        putString("name", file.name)
                        putDouble("size", file.length().toDouble())
                        putDouble("lastModified", (file.lastModified() / 1000).toDouble())
                        putString("uri", file.uri.toString())
                    })
                }
            }
        }
    }

    @ReactMethod
    fun shareExportFile(fileUri: String, mimeType: String, promise: Promise) {
        try {
            val uri = android.net.Uri.parse(fileUri)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = mimeType
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent.createChooser(intent, "Share Export")
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(chooser)
            promise.resolve(true)
        } catch (e: Exception) {
            AppLogger.e(TAG, "Failed to share export file", e)
            promise.reject("SHARE_ERROR", e.message, e)
        }
    }

    private fun countExportFiles(uriString: String): Int {
        return try {
            val dirUri = android.net.Uri.parse(uriString)
            val dir = androidx.documentfile.provider.DocumentFile.fromTreeUri(reactApplicationContext, dirUri)
            dir?.listFiles()?.count { it.name?.startsWith("colota_export_") == true } ?: 0
        } catch (e: Exception) {
            AppLogger.w(TAG, "Could not count export files: ${e.message}")
            0
        }
    }
}

