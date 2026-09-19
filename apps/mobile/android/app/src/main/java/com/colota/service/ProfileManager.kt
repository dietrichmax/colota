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
 * delay (hysteresis) prevents rapid switching before handing over to the next
 * matching profile or the defaults.
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
        val conditionType: String,
    )

    // Default config (written externally by the service, read inside @Synchronized deactivateToDefault)
    @Volatile var defaultInterval: Long = 5000L
    @Volatile var defaultDistance: Float = 0f
    @Volatile var defaultSyncInterval: Int = 0

    // @Volatile: getActiveProfileName() reads it without the lock.
    @Volatile private var activeProfile: ProfileHelper.CachedProfile? = null
    // Guarded by the @Synchronized methods.
    private var deactivationJob: Job? = null
    private var activationJob: Job? = null
    private var pendingActivationProfileId: Int? = null
    private var deferredActivationProfileId: Int? = null

    // Written outside the lock, read by evaluate() under it.
    @Volatile private var isCharging = false
    @Volatile private var isCarMode = false
    @Volatile var isStationary = false
        private set
    // The current still run, timed by location.time and written without the lock.
    @Volatile private var runStartedAtMs = 0L
    @Volatile private var lastSampleAtMs = 0L
    @Volatile private var lastSampleGapMs = 0L

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
        // Or the next still fix re-activates from the run this verdict already spent.
        runStartedAtMs = 0L
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

    @Synchronized
    fun evaluate() {
        val profiles = profileHelper.getEnabledProfiles()

        // A disabled or deleted profile skips its deactivation delay.
        if (activeProfile != null && profiles.none { it.id == activeProfile!!.id }) {
            cancelDeactivation()
            deactivateToDefault()
        }

        val waitingProfileId = pendingActivationProfileId ?: deferredActivationProfileId
        if (waitingProfileId != null && profiles.none { it.id == waitingProfileId }) {
            cancelActivation()
        }

        if (profiles.isEmpty()) {
            return
        }

        // getEnabledProfiles is sorted by priority DESC, id ASC.
        val matchingProfile = profiles.firstOrNull { matchesCondition(it) }

        when {
            matchingProfile != null -> {
                if (activeProfile?.id == matchingProfile.id) {
                    cancelDeactivation()
                    cancelActivation()
                    val active = activeProfile!!
                    if (active.intervalMs != matchingProfile.intervalMs ||
                        active.minUpdateDistance != matchingProfile.minUpdateDistance ||
                        active.syncIntervalSeconds != matchingProfile.syncIntervalSeconds) {
                        activateProfile(matchingProfile)
                    }
                    return
                }

                val active = activeProfile
                if (active != null && ranksAbove(profiles, active.id, matchingProfile.id)) {
                    holdForDeactivation(active, matchingProfile)
                    return
                }

                if (isActivationSatisfied(matchingProfile)) {
                    cancelActivation()
                    activateProfile(matchingProfile)
                } else {
                    scheduleActivation(matchingProfile)
                }
            }

            activeProfile != null -> {
                cancelActivation()
                scheduleDeactivation(activeProfile!!)
            }

            else -> {
                cancelActivation()
            }
        }
    }

    /** The active profile stopped matching and a lower one matches: each delay runs on its own condition. */
    private fun holdForDeactivation(active: ProfileHelper.CachedProfile, next: ProfileHelper.CachedProfile) {
        if (active.deactivationDelaySeconds <= 0) {
            cancelDeactivation()
            handOver(next)
            return
        }
        scheduleDeactivation(active)
        if (!isActivationSatisfied(next)) scheduleActivation(next)
        else if (deferredActivationProfileId != next.id) cancelActivation()
    }

    private fun handOver(next: ProfileHelper.CachedProfile?) {
        if (next != null && isActivationSatisfied(next)) {
            cancelActivation()
            activateProfile(next)
        } else {
            deactivateToDefault()
            if (next != null) scheduleActivation(next)
        }
    }

    /**
     * True for a delay of 0, for one that ran out while a higher profile finished its deactivation delay, and for
     * Stationary, which spends its activation delay reaching the stationary state.
     */
    private fun isActivationSatisfied(profile: ProfileHelper.CachedProfile): Boolean =
        profile.conditionType == ProfileConstants.CONDITION_STATIONARY ||
            profile.activationDelaySeconds <= 0 ||
            deferredActivationProfileId == profile.id

    private fun ranksAbove(profiles: List<ProfileHelper.CachedProfile>, higherId: Int, lowerId: Int): Boolean {
        val higher = profiles.indexOfFirst { it.id == higherId }
        return higher >= 0 && higher < profiles.indexOfFirst { it.id == lowerId }
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
        cancelDeactivation()
        activeProfile = profile

        AppLogger.i(TAG, "Activated profile: ${profile.name} (interval=${profile.intervalMs}ms, sync=${profile.syncIntervalSeconds}s)")

        LocationServiceModule.sendProfileSwitchEvent(profile.name, profile.id)
        onConfigSwitch(ProfileConfig(
            interval = profile.intervalMs,
            distance = profile.minUpdateDistance,
            syncInterval = profile.syncIntervalSeconds,
            profileName = profile.name,
            profileId = profile.id,
            conditionType = profile.conditionType,
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
     * Runs when the deactivation delay ends. The re-check covers evaluate() switching profile between
     * ensureActive() and the lock. The top match then takes over if its activation delay has passed, else the defaults.
     */
    @Synchronized
    private fun deactivateIfStillActive(scheduledProfileId: Int) {
        if (activeProfile?.id != scheduledProfileId) return
        val next = profileHelper.getEnabledProfiles().firstOrNull { matchesCondition(it) }
        if (next?.id == scheduledProfileId) return
        handOver(next)
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
     * Runs when the activation delay ends and applies the profile only if it is still the best match.
     * A higher profile inside its deactivation delay keeps the slot until that delay ends.
     */
    @Synchronized
    private fun activateIfStillMatching(scheduledProfileId: Int) {
        // Superseded by a newer timer after the delay: leave its fields alone.
        if (pendingActivationProfileId != scheduledProfileId) return
        activationJob = null
        pendingActivationProfileId = null

        val profiles = profileHelper.getEnabledProfiles()
        val matching = profiles.firstOrNull { matchesCondition(it) }
        if (matching?.id != scheduledProfileId) return
        if (activeProfile?.id == scheduledProfileId) return
        val active = activeProfile
        if (active != null && deactivationJob?.isActive == true &&
            ranksAbove(profiles, active.id, scheduledProfileId)
        ) {
            deferredActivationProfileId = scheduledProfileId
            AppLogger.d(TAG, "'${matching.name}' waits for '${active.name}' to finish its deactivation delay")
            return
        }
        activateProfile(matching)
    }

    private fun cancelActivation() {
        activationJob?.cancel()
        activationJob = null
        pendingActivationProfileId = null
        deferredActivationProfileId = null
    }

    /** Only the fix that completes the window can conclude stillness; a stopped stream never does. */
    private fun evaluateStationaryState(location: android.location.Location) {
        if (ProfileConstants.CONDITION_STATIONARY !in getNeededConditionTypes()) return

        val sampleAtMs = location.time
        val gapMs = if (lastSampleAtMs == 0L) -1L else sampleAtMs - lastSampleAtMs
        val previousGapMs = lastSampleGapMs
        lastSampleAtMs = sampleAtMs
        if (gapMs >= 0) lastSampleGapMs = gapMs

        val speed = if (location.hasSpeed()) location.speed else 0f

        if (speed >= ProfileConstants.STATIONARY_SPEED_THRESHOLD) {
            runStartedAtMs = 0L
            if (isStationary) {
                isStationary = false
                onStationaryChanged?.invoke(false)
                AppLogger.d(TAG, "Device no longer stationary (speed=${String.format("%.1f", speed)}m/s)")
            }
            return
        }

        if (isStationary) return

        val timeoutMs = stationaryTimeoutMs()
        if (runStartedAtMs == 0L || !runSurvivesGap(gapMs, previousGapMs)) {
            if (runStartedAtMs != 0L) AppLogger.d(TAG, "Stationary run restarted: ${gapMs}ms without a fix")
            runStartedAtMs = sampleAtMs
        }

        val stillForMs = sampleAtMs - runStartedAtMs
        if (stillForMs < timeoutMs) return

        isStationary = true
        onStationaryChanged?.invoke(true)
        AppLogger.d(TAG, "Device stationary (speed below threshold for ${stillForMs / 1000}s)")
    }

    /**
     * A gap is unobserved time, not stillness. The tolerance scales with the run's own spacing, and
     * deliberately not with the window: a long window must not make a long blackout count as stillness.
     */
    private fun runSurvivesGap(gapMs: Long, previousGapMs: Long): Boolean {
        if (gapMs < 0) return false
        val tolerance = maxOf(
            ProfileConstants.STATIONARY_MIN_GAP_TOLERANCE_MS,
            previousGapMs * ProfileConstants.STATIONARY_GAP_TOLERANCE_FACTOR
        )
        return gapMs <= minOf(tolerance, ProfileConstants.STATIONARY_MAX_GAP_TOLERANCE_MS)
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

        LocationServiceModule.sendProfileSwitchEvent(null, null)
        onConfigSwitch(ProfileConfig(
            interval = defaultInterval,
            distance = defaultDistance,
            syncInterval = defaultSyncInterval,
            profileName = null,
            profileId = null,
            conditionType = "",
        ))
    }
}
