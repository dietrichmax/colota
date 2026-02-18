/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.location.Location
import com.Colota.data.ProfileHelper
import io.mockk.*
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProfileManagerTest {

    private lateinit var profileHelper: ProfileHelper
    private lateinit var testScope: TestScope
    private var switchedInterval: Long = 0
    private var switchedDistance: Float = 0f
    private var switchedSyncInterval: Int = 0
    private var switchedProfileName: String? = null
    private var switchedProfileId: Int? = null
    private var switchCount = 0

    private fun createManager(): ProfileManager {
        return ProfileManager(profileHelper, testScope) { interval, distance, sync, name, id ->
            switchedInterval = interval
            switchedDistance = distance
            switchedSyncInterval = sync
            switchedProfileName = name
            switchedProfileId = id
            switchCount++
        }
    }

    private fun chargingProfile(
        id: Int = 1,
        name: String = "Charging",
        intervalMs: Long = 10000,
        priority: Int = 10,
        deactivationDelay: Int = 60
    ) = ProfileHelper.CachedProfile(
        id = id,
        name = name,
        intervalMs = intervalMs,
        minUpdateDistance = 0f,
        syncIntervalSeconds = 0,
        priority = priority,
        conditionType = ProfileConstants.CONDITION_CHARGING,
        speedThreshold = null,
        deactivationDelaySeconds = deactivationDelay
    )

    private fun carModeProfile(
        id: Int = 2,
        name: String = "Car Mode",
        intervalMs: Long = 3000,
        priority: Int = 20
    ) = ProfileHelper.CachedProfile(
        id = id,
        name = name,
        intervalMs = intervalMs,
        minUpdateDistance = 5f,
        syncIntervalSeconds = 60,
        priority = priority,
        conditionType = ProfileConstants.CONDITION_ANDROID_AUTO,
        speedThreshold = null,
        deactivationDelaySeconds = 30
    )

    private fun speedAboveProfile(
        id: Int = 3,
        threshold: Float = 13.89f, // ~50 km/h
        priority: Int = 15
    ) = ProfileHelper.CachedProfile(
        id = id,
        name = "Fast",
        intervalMs = 2000,
        minUpdateDistance = 10f,
        syncIntervalSeconds = 0,
        priority = priority,
        conditionType = ProfileConstants.CONDITION_SPEED_ABOVE,
        speedThreshold = threshold,
        deactivationDelaySeconds = 30
    )

    private fun speedBelowProfile(
        id: Int = 4,
        threshold: Float = 5.56f, // ~20 km/h
        priority: Int = 5
    ) = ProfileHelper.CachedProfile(
        id = id,
        name = "Slow",
        intervalMs = 15000,
        minUpdateDistance = 0f,
        syncIntervalSeconds = 300,
        priority = priority,
        conditionType = ProfileConstants.CONDITION_SPEED_BELOW,
        speedThreshold = threshold,
        deactivationDelaySeconds = 60
    )

    private fun mockLocation(speed: Float, hasSpeed: Boolean = true): Location {
        return mockk {
            every { this@mockk.speed } returns speed
            every { this@mockk.hasSpeed() } returns hasSpeed
            every { latitude } returns 52.52
            every { longitude } returns 13.405
        }
    }

    @Before
    fun setup() {
        testScope = TestScope()
        profileHelper = mockk(relaxed = true)
        switchCount = 0
        switchedInterval = 0
        switchedDistance = 0f
        switchedSyncInterval = 0
        switchedProfileName = null
        switchedProfileId = null

        mockkObject(com.Colota.bridge.LocationServiceModule)
        every { com.Colota.bridge.LocationServiceModule.sendProfileSwitchEvent(any(), any()) } returns true
    }

    // --- Charging condition ---

    @Test
    fun `activates charging profile when charging starts`() = runTest {
        val profile = chargingProfile()
        every { profileHelper.getEnabledProfiles() } returns listOf(profile)

        val manager = createManager()
        manager.onChargingStateChanged(true)

        assertEquals("Charging", switchedProfileName)
        assertEquals(10000L, switchedInterval)
        assertEquals(1, switchCount)
    }

    @Test
    fun `does not activate charging profile when not charging`() = runTest {
        val profile = chargingProfile()
        every { profileHelper.getEnabledProfiles() } returns listOf(profile)

        val manager = createManager()
        manager.onChargingStateChanged(false)

        assertEquals(0, switchCount)
    }

    // --- Car mode condition ---

    @Test
    fun `activates car mode profile when car mode enabled`() = runTest {
        val profile = carModeProfile()
        every { profileHelper.getEnabledProfiles() } returns listOf(profile)

        val manager = createManager()
        manager.onCarModeStateChanged(true)

        assertEquals("Car Mode", switchedProfileName)
        assertEquals(3000L, switchedInterval)
    }

    // --- Speed conditions ---

    @Test
    fun `activates speed above profile when average speed exceeds threshold`() = runTest {
        val profile = speedAboveProfile(threshold = 10f)
        every { profileHelper.getEnabledProfiles() } returns listOf(profile)

        val manager = createManager()

        // Feed enough speed samples to fill buffer
        repeat(ProfileConstants.SPEED_BUFFER_SIZE) {
            manager.onLocationUpdate(mockLocation(15f))
        }

        assertEquals("Fast", switchedProfileName)
    }

    @Test
    fun `does not activate speed above profile when speed is below threshold`() = runTest {
        val profile = speedAboveProfile(threshold = 20f)
        every { profileHelper.getEnabledProfiles() } returns listOf(profile)

        val manager = createManager()

        repeat(ProfileConstants.SPEED_BUFFER_SIZE) {
            manager.onLocationUpdate(mockLocation(10f))
        }

        assertNull(switchedProfileName)
    }

    @Test
    fun `activates speed below profile when speed is under threshold`() = runTest {
        val profile = speedBelowProfile(threshold = 10f)
        every { profileHelper.getEnabledProfiles() } returns listOf(profile)

        val manager = createManager()

        repeat(ProfileConstants.SPEED_BUFFER_SIZE) {
            manager.onLocationUpdate(mockLocation(5f))
        }

        assertEquals("Slow", switchedProfileName)
    }

    @Test
    fun `speed buffer ignores locations without speed`() = runTest {
        val profile = speedAboveProfile(threshold = 10f)
        every { profileHelper.getEnabledProfiles() } returns listOf(profile)

        val manager = createManager()

        // Feed locations without speed — should not trigger
        repeat(ProfileConstants.SPEED_BUFFER_SIZE) {
            manager.onLocationUpdate(mockLocation(0f, hasSpeed = false))
        }

        assertNull(switchedProfileName)
    }

    @Test
    fun `speed buffer uses rolling average`() = runTest {
        val profile = speedAboveProfile(threshold = 10f)
        every { profileHelper.getEnabledProfiles() } returns listOf(profile)

        val manager = createManager()

        // Buffer size is 5, fill with 5 speeds: [5, 5, 5, 20, 20] = avg 11
        manager.onLocationUpdate(mockLocation(5f))
        manager.onLocationUpdate(mockLocation(5f))
        manager.onLocationUpdate(mockLocation(5f))
        manager.onLocationUpdate(mockLocation(20f))
        manager.onLocationUpdate(mockLocation(20f))

        assertEquals("Fast", switchedProfileName)
    }

    // --- Priority ---

    @Test
    fun `highest priority profile wins when multiple match`() = runTest {
        val lowPriority = chargingProfile(id = 1, name = "Low", priority = 5)
        val highPriority = chargingProfile(id = 2, name = "High", priority = 20)
        // getEnabledProfiles returns sorted by priority DESC
        every { profileHelper.getEnabledProfiles() } returns listOf(highPriority, lowPriority)

        val manager = createManager()
        manager.onChargingStateChanged(true)

        assertEquals("High", switchedProfileName)
        assertEquals(2, switchedProfileId)
    }

    // --- Deactivation delay ---

    @Test
    fun `schedules deactivation when condition stops matching`() = testScope.runTest {
        val profile = chargingProfile(deactivationDelay = 30)
        every { profileHelper.getEnabledProfiles() } returns listOf(profile)

        val manager = createManager()
        manager.defaultInterval = 5000L
        manager.defaultDistance = 0f
        manager.defaultSyncInterval = 0

        // Activate
        manager.onChargingStateChanged(true)
        assertEquals("Charging", switchedProfileName)
        val activateCount = switchCount

        // Stop charging — should NOT immediately deactivate
        manager.onChargingStateChanged(false)
        assertEquals(activateCount, switchCount)

        // Advance past deactivation delay
        advanceTimeBy(31_000)

        // Now should have reverted to defaults
        assertNull(switchedProfileName)
        assertEquals(5000L, switchedInterval)
    }

    @Test
    fun `cancels deactivation when condition matches again`() = testScope.runTest {
        val profile = chargingProfile(deactivationDelay = 60)
        every { profileHelper.getEnabledProfiles() } returns listOf(profile)

        val manager = createManager()
        manager.defaultInterval = 5000L

        // Activate
        manager.onChargingStateChanged(true)
        val countAfterActivate = switchCount

        // Stop charging
        manager.onChargingStateChanged(false)

        // Start charging again before deactivation delay
        advanceTimeBy(10_000)
        manager.onChargingStateChanged(true)

        // Wait past original delay
        advanceTimeBy(60_000)

        // Should still be on the charging profile (no deactivation happened)
        assertEquals("Charging", switchedProfileName)
    }

    // --- Config change detection ---

    @Test
    fun `reapplies config when same profile matches with different settings`() = runTest {
        val original = chargingProfile(intervalMs = 10000)
        every { profileHelper.getEnabledProfiles() } returns listOf(original)

        val manager = createManager()
        manager.onChargingStateChanged(true)
        assertEquals(10000L, switchedInterval)
        val countAfterActivate = switchCount

        // Profile updated with different interval
        val updated = chargingProfile(intervalMs = 5000)
        every { profileHelper.getEnabledProfiles() } returns listOf(updated)

        manager.invalidateProfiles()
        manager.evaluate()

        assertEquals(5000L, switchedInterval)
        assertTrue(switchCount > countAfterActivate)
    }

    @Test
    fun `does not reapply config when same profile matches with same settings`() = runTest {
        val profile = chargingProfile()
        every { profileHelper.getEnabledProfiles() } returns listOf(profile)

        val manager = createManager()
        manager.onChargingStateChanged(true)
        val countAfterActivate = switchCount

        // Re-evaluate with same profile
        manager.evaluate()

        assertEquals(countAfterActivate, switchCount)
    }

    // --- Empty profiles ---

    @Test
    fun `no activation when profiles list is empty`() = runTest {
        every { profileHelper.getEnabledProfiles() } returns emptyList()

        val manager = createManager()
        manager.onChargingStateChanged(true)

        assertEquals(0, switchCount)
    }

    @Test
    fun `getActiveProfileName returns null when no profile is active`() {
        every { profileHelper.getEnabledProfiles() } returns emptyList()
        val manager = createManager()
        assertNull(manager.getActiveProfileName())
    }

    @Test
    fun `getActiveProfileName returns name after activation`() {
        val profile = chargingProfile()
        every { profileHelper.getEnabledProfiles() } returns listOf(profile)

        val manager = createManager()
        manager.onChargingStateChanged(true)

        assertEquals("Charging", manager.getActiveProfileName())
    }

    // --- Profile switching ---

    @Test
    fun `switches from one profile to another when conditions change`() = runTest {
        val charging = chargingProfile(id = 1, priority = 10)
        val carMode = carModeProfile(id = 2, priority = 20)
        every { profileHelper.getEnabledProfiles() } returns listOf(carMode, charging)

        val manager = createManager()

        // Start charging — charging profile activates (car mode doesn't match)
        manager.onChargingStateChanged(true)
        assertEquals("Charging", switchedProfileName)

        // Enable car mode — higher priority car mode profile takes over
        manager.onCarModeStateChanged(true)
        assertEquals("Car Mode", switchedProfileName)
    }

    // --- Immediate deactivation when profile disabled/deleted ---

    @Test
    fun `deactivates immediately when active profile is disabled`() = runTest {
        val profile = chargingProfile(deactivationDelay = 60)
        every { profileHelper.getEnabledProfiles() } returns listOf(profile)

        val manager = createManager()
        manager.defaultInterval = 5000L
        manager.defaultDistance = 0f
        manager.defaultSyncInterval = 0

        // Activate
        manager.onChargingStateChanged(true)
        assertEquals("Charging", switchedProfileName)

        // Profile is disabled — getEnabledProfiles returns empty
        every { profileHelper.getEnabledProfiles() } returns emptyList()
        manager.invalidateProfiles()
        manager.evaluate()

        // Should deactivate immediately (no delay)
        assertNull(switchedProfileName)
        assertEquals(5000L, switchedInterval)
    }

    @Test
    fun `deactivates immediately when active profile is deleted`() = runTest {
        val profile = chargingProfile(id = 1, deactivationDelay = 60)
        val otherProfile = carModeProfile(id = 2, priority = 5)

        every { profileHelper.getEnabledProfiles() } returns listOf(profile, otherProfile)

        val manager = createManager()
        manager.defaultInterval = 5000L
        manager.defaultDistance = 0f
        manager.defaultSyncInterval = 0

        // Activate charging profile
        manager.onChargingStateChanged(true)
        assertEquals("Charging", switchedProfileName)

        // Profile 1 deleted — only profile 2 remains (but car mode not active)
        every { profileHelper.getEnabledProfiles() } returns listOf(otherProfile)
        manager.invalidateProfiles()
        manager.evaluate()

        // Should deactivate immediately to defaults
        assertNull(switchedProfileName)
        assertEquals(5000L, switchedInterval)
    }

    // --- Unknown condition type ---

    @Test
    fun `unknown condition type does not match`() = runTest {
        val profile = ProfileHelper.CachedProfile(
            id = 99,
            name = "Unknown",
            intervalMs = 5000,
            minUpdateDistance = 0f,
            syncIntervalSeconds = 0,
            priority = 10,
            conditionType = "unknown_condition",
            speedThreshold = null,
            deactivationDelaySeconds = 30
        )
        every { profileHelper.getEnabledProfiles() } returns listOf(profile)

        val manager = createManager()
        manager.onChargingStateChanged(true)

        assertEquals(0, switchCount)
    }
}
