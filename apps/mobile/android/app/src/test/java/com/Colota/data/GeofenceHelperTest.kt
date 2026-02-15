package com.Colota.data

import org.junit.Assert.*
import org.junit.Test

class GeofenceHelperTest {

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
}
