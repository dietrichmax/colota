/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import com.Colota.util.AppLogger
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


    fun onChargingStateChanged(charging: Boolean) {
        isCharging = charging
        evaluate()
    }

    fun onCarModeStateChanged(connected: Boolean) {
        isCarMode = connected
        evaluate()
    }

    fun onLocationUpdate(location: android.location.Location) {
        if (location.hasSpeed()) {
            synchronized(speedLock) {
                if (speedBuffer.size >= ProfileConstants.SPEED_BUFFER_SIZE) {
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
    fun evaluate() {
        val profiles = profileHelper.getEnabledProfiles()

        // If the active profile was disabled or deleted, deactivate immediately (no delay)
        if (activeProfile != null && profiles.none { it.id == activeProfile!!.id }) {
            cancelDeactivation()
            deactivateToDefault()
        }

        if (profiles.isEmpty()) {
            return
        }

        // Find highest-priority matching profile (list already sorted by priority DESC)
        val matchingProfile = profiles.firstOrNull { matchesCondition(it) }

        when {
            // A profile matches — activate it (or keep if already active)
            matchingProfile != null -> {
                cancelDeactivation()

                if (activeProfile?.id == matchingProfile.id) {
                    // Same profile still matches — re-apply only if config changed
                    val active = activeProfile!!
                    if (active.intervalMs != matchingProfile.intervalMs ||
                        active.minUpdateDistance != matchingProfile.minUpdateDistance ||
                        active.syncIntervalSeconds != matchingProfile.syncIntervalSeconds) {
                        activateProfile(matchingProfile)
                    }
                    return
                }

                // Different profile or new activation
                activateProfile(matchingProfile)
            }

            // No profile matches — schedule deactivation if one was active
            activeProfile != null -> {
                scheduleDeactivation(activeProfile!!)
            }
        }
    }

    private fun matchesCondition(profile: ProfileHelper.CachedProfile): Boolean {
        val result = when (profile.conditionType) {
            ProfileConstants.CONDITION_CHARGING -> isCharging
            ProfileConstants.CONDITION_ANDROID_AUTO -> isCarMode
            ProfileConstants.CONDITION_SPEED_ABOVE -> {
                val avgSpeed = getAverageSpeed()
                val threshold = profile.speedThreshold
                avgSpeed != null && threshold != null && avgSpeed > threshold
            }
            ProfileConstants.CONDITION_SPEED_BELOW -> {
                val avgSpeed = getAverageSpeed()
                val threshold = profile.speedThreshold
                avgSpeed != null && threshold != null && avgSpeed < threshold
            }
            else -> false
        }

        if (result) {
            val detail = when (profile.conditionType) {
                ProfileConstants.CONDITION_SPEED_ABOVE,
                ProfileConstants.CONDITION_SPEED_BELOW -> " (avg=${String.format("%.1f", getAverageSpeed())}m/s, threshold=${profile.speedThreshold})"
                else -> ""
            }
            AppLogger.d(TAG, "Profile '${profile.name}' matched: ${profile.conditionType}$detail")
        }

        return result
    }

    private fun getAverageSpeed(): Float? {
        synchronized(speedLock) {
            if (speedBuffer.isEmpty()) return null
            return speedBuffer.average().toFloat()
        }
    }

    private fun activateProfile(profile: ProfileHelper.CachedProfile) {
        activeProfile = profile

        AppLogger.i(TAG, "Activated profile: ${profile.name} (interval=${profile.intervalMs}ms, sync=${profile.syncIntervalSeconds}s)")

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

        val scheduledProfileId = profile.id
        deactivationJob = scope.launch {
            delay(profile.deactivationDelaySeconds * 1000L)
            ensureActive()
            deactivateIfStillActive(scheduledProfileId)
        }

        AppLogger.d(TAG, "Scheduled deactivation of '${profile.name}' in ${profile.deactivationDelaySeconds}s")
    }

    /**
     * Called from the deactivation coroutine. Re-checks under lock that the
     * profile being deactivated is still the active one — prevents a race
     * where evaluate() activated a new profile between ensureActive() and
     * acquiring the synchronized lock.
     */
    @Synchronized
    private fun deactivateIfStillActive(scheduledProfileId: Int) {
        if (activeProfile?.id != scheduledProfileId) return
        deactivateToDefault()
    }

    private fun cancelDeactivation() {
        deactivationJob?.cancel()
        deactivationJob = null
    }

    private fun deactivateToDefault() {
        val previousProfile = activeProfile ?: return
        activeProfile = null
        deactivationJob = null

        AppLogger.i(TAG, "Deactivated profile: ${previousProfile.name} - reverting to defaults")

        // Notify JS
        LocationServiceModule.sendProfileSwitchEvent(null, null)

        // Revert to default config
        onConfigSwitch(defaultInterval, defaultDistance, defaultSyncInterval, null, null)
    }
}
