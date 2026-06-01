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
 * @param onConfigSwitch Callback to apply the resolved profile config (or defaults when null-profile)
 */
class ProfileManager(
    private val profileHelper: ProfileHelper,
    private val scope: CoroutineScope,
    private val onConfigSwitch: (ProfileConfig) -> Unit,
    private val onStationaryChanged: ((stationary: Boolean) -> Unit)? = null
) {
    companion object {
        private const val TAG = "ProfileManager"
    }

    data class ProfileConfig(
        val interval: Long,
        val distance: Float,
        val syncInterval: Int,
        val profileName: String?,
        val profileId: Int?,
    )

    // Default config (written externally by the service, read inside @Synchronized deactivateToDefault)
    @Volatile var defaultInterval: Long = 5000L
    @Volatile var defaultDistance: Float = 0f
    @Volatile var defaultSyncInterval: Int = 0

    // Active profile: mutated only inside @Synchronized methods.
    // @Volatile because getActiveProfileName() is read externally without the lock.
    @Volatile private var activeProfile: ProfileHelper.CachedProfile? = null
    // Accessed only inside @Synchronized methods — the intrinsic lock covers visibility.
    private var deactivationJob: Job? = null
    private var activationJob: Job? = null
    private var pendingActivationProfileId: Int? = null

    // Condition flags: written from broadcast callbacks, each write immediately followed by
    // @Synchronized evaluate() which reads them. @Volatile makes the write visible to readers
    // already holding the lock on another thread.
    @Volatile private var isCharging = false
    @Volatile private var isCarMode = false
    @Volatile var isStationary = false
        private set
    // Written/read from location + motion callbacks without synchronization.
    @Volatile private var stationaryJob: Job? = null

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

    /** Called by the motion sensor when the device starts moving while stationary. */
    fun onMotionDetected() {
        if (!isStationary) return
        stationaryJob?.cancel()
        stationaryJob = null
        isStationary = false
        onStationaryChanged?.invoke(false)
        AppLogger.d(TAG, "Motion detected - device no longer stationary")
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
        evaluateStationaryState(location)
        evaluate()
    }

    fun invalidateProfiles() {
        profileHelper.invalidateCache()
    }

    fun getActiveProfileName(): String? = activeProfile?.name

    fun getNeededConditionTypes(): Set<String> =
        profileHelper.getEnabledProfiles().mapTo(HashSet()) { it.conditionType }

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

        if (pendingActivationProfileId != null && profiles.none { it.id == pendingActivationProfileId }) {
            cancelActivation()
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
                    cancelActivation()
                    // Same profile still matches — re-apply only if config changed
                    val active = activeProfile!!
                    if (active.intervalMs != matchingProfile.intervalMs ||
                        active.minUpdateDistance != matchingProfile.minUpdateDistance ||
                        active.syncIntervalSeconds != matchingProfile.syncIntervalSeconds) {
                        activateProfile(matchingProfile)
                    }
                    return
                }

                // Stationary spends its activation delay reaching the stationary state, so it
                // applies immediately here; the generic delay would double-count it.
                val activationDelay =
                    if (matchingProfile.conditionType == ProfileConstants.CONDITION_STATIONARY) 0
                    else matchingProfile.activationDelaySeconds
                if (activationDelay <= 0) {
                    cancelActivation()
                    activateProfile(matchingProfile)
                } else {
                    scheduleActivation(matchingProfile)
                }
            }

            // No profile matches — schedule deactivation if one was active
            activeProfile != null -> {
                cancelActivation()
                scheduleDeactivation(activeProfile!!)
            }

            // Pending activation's condition dropped before its delay elapsed
            else -> {
                cancelActivation()
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
            ProfileConstants.CONDITION_STATIONARY -> isStationary
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

    /** Clears stale speed readings (e.g. when entering a geofence pause zone). */
    fun clearSpeedBuffer() {
        synchronized(speedLock) {
            speedBuffer.clear()
        }
        AppLogger.d(TAG, "Speed buffer cleared")
        evaluate()
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
        onConfigSwitch(ProfileConfig(
            interval = profile.intervalMs,
            distance = profile.minUpdateDistance,
            syncInterval = profile.syncIntervalSeconds,
            profileName = profile.name,
            profileId = profile.id,
        ))
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

    private fun scheduleActivation(profile: ProfileHelper.CachedProfile) {
        if (activationJob?.isActive == true && pendingActivationProfileId == profile.id) return

        cancelActivation()
        pendingActivationProfileId = profile.id
        val scheduledProfileId = profile.id
        activationJob = scope.launch {
            delay(profile.activationDelaySeconds * 1000L)
            ensureActive()
            activateIfStillMatching(scheduledProfileId)
        }

        AppLogger.d(TAG, "Scheduled activation of '${profile.name}' in ${profile.activationDelaySeconds}s")
    }

    /**
     * Called from the activation coroutine. Re-resolves the highest-priority match
     * under the lock and activates only if the scheduled profile is still the winner —
     * the condition may have lapsed or a higher-priority profile may have arrived
     * during the delay.
     */
    @Synchronized
    private fun activateIfStillMatching(scheduledProfileId: Int) {
        // Superseded by a newer activation between the delay and the lock: leave its
        // job/pending fields intact rather than orphaning the newer timer.
        if (pendingActivationProfileId != scheduledProfileId) return
        activationJob = null
        pendingActivationProfileId = null

        val matching = profileHelper.getEnabledProfiles().firstOrNull { matchesCondition(it) }
        if (matching?.id != scheduledProfileId) return
        if (activeProfile?.id == scheduledProfileId) return
        activateProfile(matching)
    }

    private fun cancelActivation() {
        activationJob?.cancel()
        activationJob = null
        pendingActivationProfileId = null
    }

    private fun evaluateStationaryState(location: android.location.Location) {
        if (ProfileConstants.CONDITION_STATIONARY !in getNeededConditionTypes()) return

        val speed = if (location.hasSpeed()) location.speed else 0f

        if (speed >= ProfileConstants.STATIONARY_SPEED_THRESHOLD) {
            stationaryJob?.cancel()
            stationaryJob = null
            if (isStationary) {
                isStationary = false
                onStationaryChanged?.invoke(false)
                AppLogger.d(TAG, "Device no longer stationary (speed=${String.format("%.1f", speed)}m/s)")
            }
            return
        }

        if (!isStationary && stationaryJob?.isActive != true) {
            val timeoutMs = stationaryTimeoutMs()
            stationaryJob = scope.launch {
                delay(timeoutMs)
                isStationary = true
                onStationaryChanged?.invoke(true)
                AppLogger.d(TAG, "Device stationary (speed below threshold for ${timeoutMs / 1000}s)")
                evaluate()
            }
        }
    }

    // Stationary detection window = the profile's activation delay (the "still for this long" time).
    private fun stationaryTimeoutMs(): Long {
        val seconds = profileHelper.getEnabledProfiles()
            .firstOrNull { it.conditionType == ProfileConstants.CONDITION_STATIONARY }
            ?.activationDelaySeconds ?: 0
        return seconds * 1000L
    }

    private fun deactivateToDefault() {
        val previousProfile = activeProfile ?: return
        activeProfile = null
        deactivationJob = null

        AppLogger.i(TAG, "Deactivated profile: ${previousProfile.name} - reverting to defaults")

        // Notify JS
        LocationServiceModule.sendProfileSwitchEvent(null, null)

        // Revert to default config
        onConfigSwitch(ProfileConfig(
            interval = defaultInterval,
            distance = defaultDistance,
            syncInterval = defaultSyncInterval,
            profileName = null,
            profileId = null,
        ))
    }
}
