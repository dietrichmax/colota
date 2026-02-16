/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.location.Location
import android.util.Log
import com.Colota.BuildConfig
import com.Colota.bridge.LocationServiceModule
import com.Colota.data.ProfileHelper
import kotlinx.coroutines.*

/**
 * Evaluates tracking profile conditions and triggers config switches.
 *
 * When a profile's conditions match, its GPS interval / sync settings override
 * the default config. When conditions stop matching, a configurable deactivation
 * delay (hysteresis) prevents rapid switching before reverting to defaults.
 *
 * @param profileHelper CRUD access to profile database
 * @param scope Coroutine scope for deactivation delay timers
 * @param onConfigSwitch Callback to apply new interval/distance/sync params
 */
class ProfileManager(
    private val profileHelper: ProfileHelper,
    private val scope: CoroutineScope,
    private val onConfigSwitch: (interval: Long, distance: Float, syncInterval: Int, profileName: String?, profileId: Int?) -> Unit
) {
    companion object {
        private const val TAG = "ProfileManager"
        private const val SPEED_BUFFER_SIZE = 5
    }

    // Default config values (set by the service after loading config)
    @Volatile var defaultInterval: Long = 5000L
    @Volatile var defaultDistance: Float = 0f
    @Volatile var defaultSyncInterval: Int = 0

    // Current active profile (null = using default settings)
    @Volatile private var activeProfile: ProfileHelper.CachedProfile? = null
    @Volatile private var deactivationJob: Job? = null

    // Condition states
    @Volatile private var isCharging = false
    @Volatile private var isCarMode = false

    // Speed rolling average buffer
    private val speedBuffer = ArrayDeque<Float>()
    private val speedLock = Any()

    // Last known location for trip event logging
    @Volatile private var lastLocation: Location? = null

    fun onChargingStateChanged(charging: Boolean) {
        isCharging = charging
        evaluate()
    }

    fun onCarModeStateChanged(connected: Boolean) {
        isCarMode = connected
        evaluate()
    }

    fun onLocationUpdate(location: Location) {
        lastLocation = location

        if (location.hasSpeed()) {
            synchronized(speedLock) {
                if (speedBuffer.size >= SPEED_BUFFER_SIZE) {
                    speedBuffer.removeFirst()
                }
                speedBuffer.addLast(location.speed)
            }
        }
        evaluate()
    }

    fun invalidateProfiles() {
        profileHelper.invalidateCache()
    }

    fun getActiveProfileName(): String? = activeProfile?.name

    /**
     * Re-evaluates all enabled profiles against current conditions.
     * Must handle concurrent calls from location updates, broadcasts, and service actions.
     */
    @Synchronized
    private fun evaluate() {
        val profiles = profileHelper.getEnabledProfiles()
        if (profiles.isEmpty()) {
            if (activeProfile != null) {
                scheduleDeactivation(activeProfile!!)
            }
            return
        }

        // Find highest-priority matching profile (list already sorted by priority DESC)
        val matchingProfile = profiles.firstOrNull { matchesCondition(it) }

        when {
            // A profile matches — activate it (or keep if already active)
            matchingProfile != null -> {
                if (activeProfile?.id == matchingProfile.id) {
                    // Same profile still matches — cancel any pending deactivation
                    cancelDeactivation()
                    return
                }

                // Different profile or new activation
                cancelDeactivation()
                activateProfile(matchingProfile)
            }

            // No profile matches — schedule deactivation if one was active
            activeProfile != null -> {
                scheduleDeactivation(activeProfile!!)
            }
        }
    }

    private fun matchesCondition(profile: ProfileHelper.CachedProfile): Boolean {
        return when (profile.conditionType) {
            "charging" -> isCharging
            "android_auto" -> isCarMode
            "speed_above" -> {
                val avgSpeed = getAverageSpeed()
                val threshold = profile.speedThreshold
                avgSpeed != null && threshold != null && avgSpeed > threshold
            }
            "speed_below" -> {
                val avgSpeed = getAverageSpeed()
                val threshold = profile.speedThreshold
                avgSpeed != null && threshold != null && avgSpeed < threshold
            }
            else -> false
        }
    }

    private fun getAverageSpeed(): Float? {
        synchronized(speedLock) {
            if (speedBuffer.isEmpty()) return null
            return speedBuffer.average().toFloat()
        }
    }

    private fun activateProfile(profile: ProfileHelper.CachedProfile) {
        activeProfile = profile

        // Log trip event
        val loc = lastLocation
        profileHelper.logTripEvent(
            profileId = profile.id,
            profileName = profile.name,
            eventType = "activated",
            latitude = loc?.latitude,
            longitude = loc?.longitude,
            timestamp = System.currentTimeMillis() / 1000
        )

        if (BuildConfig.DEBUG) {
            Log.i(TAG, "Activated profile: ${profile.name} (interval=${profile.intervalMs}ms, sync=${profile.syncIntervalSeconds}s)")
        }

        // Notify JS
        LocationServiceModule.sendProfileSwitchEvent(profile.name, profile.id)

        // Apply config
        onConfigSwitch(
            profile.intervalMs,
            profile.minUpdateDistance,
            profile.syncIntervalSeconds,
            profile.name,
            profile.id
        )
    }

    private fun scheduleDeactivation(profile: ProfileHelper.CachedProfile) {
        if (deactivationJob?.isActive == true) return // already scheduled

        deactivationJob = scope.launch {
            delay(profile.deactivationDelaySeconds * 1000L)
            deactivateToDefault()
        }

        if (BuildConfig.DEBUG) {
            Log.d(TAG, "Scheduled deactivation of '${profile.name}' in ${profile.deactivationDelaySeconds}s")
        }
    }

    private fun cancelDeactivation() {
        deactivationJob?.cancel()
        deactivationJob = null
    }

    @Synchronized
    private fun deactivateToDefault() {
        val previousProfile = activeProfile ?: return
        activeProfile = null
        deactivationJob = null

        // Log trip event
        val loc = lastLocation
        profileHelper.logTripEvent(
            profileId = previousProfile.id,
            profileName = previousProfile.name,
            eventType = "deactivated",
            latitude = loc?.latitude,
            longitude = loc?.longitude,
            timestamp = System.currentTimeMillis() / 1000
        )

        if (BuildConfig.DEBUG) {
            Log.i(TAG, "Deactivated profile: ${previousProfile.name} — reverting to defaults")
        }

        // Notify JS
        LocationServiceModule.sendProfileSwitchEvent(null, null)

        // Revert to default config
        onConfigSwitch(defaultInterval, defaultDistance, defaultSyncInterval, null, null)
    }
}
