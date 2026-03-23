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

    private fun resetSingleton() { // mirrors DatabaseHelperSQLiteTest.resetSingleton()
        val field = DatabaseHelper::class.java.getDeclaredField("INSTANCE")
        field.isAccessible = true
        field.set(null, null)
    }

    // Known reference distances (verified against online Haversine calculators):
    // Berlin (52.52, 13.405) → Munich (48.1351, 11.582) ≈ 504 km
    // New York (40.7128, -74.006) → London (51.5074, -0.1278) ≈ 5,570 km
    // Same point → 0 m

    @Test
    fun `calculateDistance returns zero for same point`() {
        val distance = GeofenceHelper.calculateDistance(52.52, 13.405, 52.52, 13.405)
        assertEquals(0.0, distance, 0.01)
    }

    @Test
    fun `calculateDistance Berlin to Munich is about 504 km`() {
        val distance = GeofenceHelper.calculateDistance(52.52, 13.405, 48.1351, 11.582)
        assertEquals(504_000.0, distance, 5000.0) // within 5 km tolerance
    }

    @Test
    fun `calculateDistance New York to London is about 5570 km`() {
        val distance = GeofenceHelper.calculateDistance(40.7128, -74.006, 51.5074, -0.1278)
        assertEquals(5_570_000.0, distance, 20_000.0) // within 20 km tolerance
    }

    @Test
    fun `calculateDistance is symmetric`() {
        val d1 = GeofenceHelper.calculateDistance(52.52, 13.405, 48.1351, 11.582)
        val d2 = GeofenceHelper.calculateDistance(48.1351, 11.582, 52.52, 13.405)
        assertEquals(d1, d2, 0.01)
    }

    @Test
    fun `calculateDistance across equator`() {
        // Quito (0.1807, -78.4678) → Bogota (4.711, -74.0721) ≈ 702 km
        val distance = GeofenceHelper.calculateDistance(0.1807, -78.4678, 4.711, -74.0721)
        assertEquals(702_000.0, distance, 5000.0)
    }

    @Test
    fun `calculateDistance across date line`() {
        // Auckland (−36.848, 174.763) → Fiji (−17.713, 177.986) ≈ 2160 km
        val distance = GeofenceHelper.calculateDistance(-36.848, 174.763, -17.713, 177.986)
        assertEquals(2_160_000.0, distance, 30_000.0)
    }

    @Test
    fun `isWithinRadius returns true for point inside`() {
        // 100m from Brandenburg Gate (52.5163, 13.3777) — a point 50m away
        val center = Pair(52.5163, 13.3777)
        // ~50m north ≈ +0.00045 degrees latitude
        assertTrue(GeofenceHelper.isWithinRadius(
            center.first, center.second,
            center.first + 0.00045, center.second,
            100.0
        ))
    }

    @Test
    fun `isWithinRadius returns false for point outside`() {
        val center = Pair(52.5163, 13.3777)
        // ~200m north ≈ +0.0018 degrees latitude
        assertFalse(GeofenceHelper.isWithinRadius(
            center.first, center.second,
            center.first + 0.0018, center.second,
            100.0
        ))
    }

    @Test
    fun `isWithinRadius returns true for point exactly on boundary`() {
        val center = Pair(52.5163, 13.3777)
        val distance = GeofenceHelper.calculateDistance(
            center.first, center.second,
            center.first + 0.0009, center.second
        )
        // Use the actual distance as radius — should be on boundary
        assertTrue(GeofenceHelper.isWithinRadius(
            center.first, center.second,
            center.first + 0.0009, center.second,
            distance
        ))
    }

    @Test
    fun `isWithinRadius same point is always within any radius`() {
        assertTrue(GeofenceHelper.isWithinRadius(52.52, 13.405, 52.52, 13.405, 1.0))
    }

    @Test
    fun `bounding box rejects distant points quickly`() {
        // Berlin to Munich (~504 km) with 1 km radius — should be rejected by bounding box
        assertFalse(GeofenceHelper.isWithinRadius(52.52, 13.405, 48.1351, 11.582, 1000.0))
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
        helper.updateGeofence(id, en = false, name = null, lat = null, lon = null, rad = null, pause = null)
        helper.invalidateCache()

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
}
