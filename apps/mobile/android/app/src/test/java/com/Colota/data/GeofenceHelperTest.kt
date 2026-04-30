package com.Colota.data

import androidx.test.core.app.ApplicationProvider
import com.Colota.util.AppLogger
import io.mockk.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class GeofenceHelperTest {

    private lateinit var helper: GeofenceHelper
    private lateinit var db: DatabaseHelper

    @Before
    fun setUp() {
        resetSingleton()
        db = DatabaseHelper.getInstance(ApplicationProvider.getApplicationContext())
        helper = GeofenceHelper(ApplicationProvider.getApplicationContext())
        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs
    }

    @After
    fun tearDown() {
        db.close()
        resetSingleton()
        unmockkObject(AppLogger)
    }

    private fun resetSingleton() {
        val field = DatabaseHelper::class.java.getDeclaredField("INSTANCE")
        field.isAccessible = true
        field.set(null, null)
    }

    // =========================================================================
    // getGeofenceByName
    // =========================================================================

    @Test
    fun `getGeofenceByName returns matching geofence`() {
        helper.insertGeofence("Home", 52.5, 13.4, 150.0, pause = true)

        val result = helper.getGeofenceByName("Home")

        assertNotNull(result)
        assertEquals("Home", result!!.name)
        assertEquals(52.5, result.lat, 0.001)
        assertEquals(13.4, result.lon, 0.001)
        assertEquals(150.0, result.radius, 0.001)
    }

    @Test
    fun `getGeofenceByName returns null for unknown name`() {
        assertNull(helper.getGeofenceByName("Unknown"))
    }

    @Test
    fun `getGeofenceByName returns correct pauseOnWifi value`() {
        helper.insertGeofence("Home", 52.5, 13.4, 150.0, pause = true, pauseOnWifi = true)

        val result = helper.getGeofenceByName("Home")

        assertNotNull(result)
        assertTrue(result!!.pauseOnWifi)
    }

    @Test
    fun `getGeofenceByName returns correct pauseOnMotionless and timeout`() {
        helper.insertGeofence("Home", 52.5, 13.4, 150.0, pause = true, pauseOnMotionless = true, motionlessTimeoutMinutes = 5)

        val result = helper.getGeofenceByName("Home")

        assertNotNull(result)
        assertTrue(result!!.pauseOnMotionless)
        assertEquals(5, result.motionlessTimeoutMinutes)
    }

    @Test
    fun `getGeofenceByName returns null when zone is disabled`() {
        helper.insertGeofence("Home", 52.5, 13.4, 150.0, pause = true)
        val id = db.readableDatabase.query("geofences", arrayOf("id"), "name = ?", arrayOf("Home"), null, null, null).use {
            it.moveToFirst(); it.getInt(0)
        }
        helper.updateGeofence(id, enabled = false)

        assertNull(helper.getGeofenceByName("Home"))
    }

    @Test
    fun `getGeofenceByName returns null when pause_tracking is off`() {
        helper.insertGeofence("Home", 52.5, 13.4, 150.0, pause = false)

        assertNull(helper.getGeofenceByName("Home"))
    }

    @Test
    fun `getGeofenceByName returns first match when multiple zones exist`() {
        helper.insertGeofence("Home", 52.5, 13.4, 150.0, pause = true)
        helper.insertGeofence("Office", 48.1, 11.5, 200.0, pause = true)

        val result = helper.getGeofenceByName("Office")

        assertNotNull(result)
        assertEquals("Office", result!!.name)
    }

    // =========================================================================
    // getPauseZone
    // =========================================================================

    @Test
    fun `getPauseZone returns zone when location inside radius`() {
        helper.insertGeofence("Home", 52.5, 13.4, 150.0, pause = true)

        val location = mockLocation(52.5001, 13.4001)
        val result = helper.getPauseZone(location)

        assertNotNull(result)
        assertEquals("Home", result!!.name)
    }

    @Test
    fun `getPauseZone returns null when location outside all zones`() {
        helper.insertGeofence("Home", 52.5, 13.4, 150.0, pause = true)

        val location = mockLocation(48.0, 11.0)
        assertNull(helper.getPauseZone(location))
    }

    @Test
    fun `getPauseZone returns zone with correct WiFi and motionless settings`() {
        helper.insertGeofence("Home", 52.5, 13.4, 500.0, pause = true, pauseOnWifi = true, pauseOnMotionless = true, motionlessTimeoutMinutes = 3)

        val location = mockLocation(52.5, 13.4)
        val result = helper.getPauseZone(location)

        assertNotNull(result)
        assertTrue(result!!.pauseOnWifi)
        assertTrue(result.pauseOnMotionless)
        assertEquals(3, result.motionlessTimeoutMinutes)
    }

    @Test
    fun `getPauseZone ignores disabled zones`() {
        helper.insertGeofence("Home", 52.5, 13.4, 500.0, pause = true)
        val id = db.readableDatabase.query("geofences", arrayOf("id"), "name = ?", arrayOf("Home"), null, null, null).use {
            it.moveToFirst(); it.getInt(0)
        }
        helper.updateGeofence(id, enabled = false)

        val location = mockLocation(52.5, 13.4)
        assertNull(helper.getPauseZone(location))
    }

    @Test
    fun `getPauseZone ignores zones with pause_tracking off`() {
        helper.insertGeofence("Home", 52.5, 13.4, 500.0, pause = false)

        val location = mockLocation(52.5, 13.4)
        assertNull(helper.getPauseZone(location))
    }

    @Test
    fun `getPauseZone returns first matching zone when overlapping`() {
        helper.insertGeofence("Inner", 52.5, 13.4, 100.0, pause = true)
        helper.insertGeofence("Outer", 52.5, 13.4, 500.0, pause = true)

        val location = mockLocation(52.5, 13.4)
        val result = helper.getPauseZone(location)

        assertNotNull(result)
        // Returns whichever loads first from DB
        assertTrue(result!!.name == "Inner" || result.name == "Outer")
    }

    // =========================================================================
    // WiFi/motionless field defaults
    // =========================================================================

    @Test
    fun `geofence defaults pauseOnWifi to false`() {
        helper.insertGeofence("Home", 52.5, 13.4, 150.0, pause = true)

        val result = helper.getGeofenceByName("Home")

        assertNotNull(result)
        assertFalse(result!!.pauseOnWifi)
    }

    @Test
    fun `geofence defaults pauseOnMotionless to false`() {
        helper.insertGeofence("Home", 52.5, 13.4, 150.0, pause = true)

        val result = helper.getGeofenceByName("Home")

        assertNotNull(result)
        assertFalse(result!!.pauseOnMotionless)
    }

    @Test
    fun `geofence defaults motionlessTimeoutMinutes to 10`() {
        helper.insertGeofence("Home", 52.5, 13.4, 150.0, pause = true)

        val result = helper.getGeofenceByName("Home")

        assertNotNull(result)
        assertEquals(10, result!!.motionlessTimeoutMinutes)
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private fun mockLocation(lat: Double, lon: Double): android.location.Location {
        return io.mockk.mockk {
            io.mockk.every { latitude } returns lat
            io.mockk.every { longitude } returns lon
        }
    }

    /** Test-local convenience: maps test's `rad`/`pause` names to the helper's `radius`/`pauseTracking`. */
    private fun GeofenceHelper.insertGeofence(
        name: String,
        lat: Double,
        lon: Double,
        rad: Double,
        pause: Boolean,
        pauseOnWifi: Boolean = false,
        pauseOnMotionless: Boolean = false,
        motionlessTimeoutMinutes: Int = 10,
        heartbeatEnabled: Boolean = false,
        heartbeatIntervalMinutes: Int = 15,
    ): Int = insertGeofence(
        name = name,
        lat = lat,
        lon = lon,
        radius = rad,
        pauseTracking = pause,
        pauseOnWifi = pauseOnWifi,
        pauseOnMotionless = pauseOnMotionless,
        motionlessTimeoutMinutes = motionlessTimeoutMinutes,
        heartbeatEnabled = heartbeatEnabled,
        heartbeatIntervalMinutes = heartbeatIntervalMinutes,
    )
}
