package com.Colota.sync

import android.location.Location
import io.mockk.every
import io.mockk.mockk
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class PayloadBuilderTest {

    private lateinit var builder: PayloadBuilder

    @Before
    fun setUp() {
        builder = PayloadBuilder()
    }

    // --- buildPayload tests ---

    @Test
    fun `buildPayload uses default field names when no mapping`() {
        val location = createMockLocation(lat = 52.52, lon = 13.405, acc = 10.5f, speed = 1.2f)

        val payload = builder.buildPayload(
            location = location,
            batteryLevel = 85,
            batteryStatus = 2,
            fieldMap = emptyMap(),
            timestamp = 1700000000L
        )

        assertEquals(52.52, payload.getDouble("lat"), 0.001)
        assertEquals(13.405, payload.getDouble("lon"), 0.001)
        assertEquals(11, payload.getInt("acc")) // 10.5 rounded
        assertEquals(1, payload.getInt("vel")) // 1.2 rounded
        assertEquals(85, payload.getInt("batt"))
        assertEquals(2, payload.getInt("bs"))
        assertEquals(1700000000L, payload.getLong("tst"))
    }

    @Test
    fun `buildPayload applies field name mapping`() {
        val location = createMockLocation(lat = 48.0, lon = 11.0, acc = 5.0f, speed = 0.0f)

        val fieldMap = mapOf("lat" to "latitude", "lon" to "longitude", "tst" to "timestamp")
        val payload = builder.buildPayload(
            location = location,
            batteryLevel = 50,
            batteryStatus = 1,
            fieldMap = fieldMap,
            timestamp = 1700000000L
        )

        assertEquals(48.0, payload.getDouble("latitude"), 0.001)
        assertEquals(11.0, payload.getDouble("longitude"), 0.001)
        assertEquals(1700000000L, payload.getLong("timestamp"))
        // Unmapped fields keep defaults
        assertEquals(5, payload.getInt("acc"))
    }

    @Test
    fun `buildPayload includes altitude when available`() {
        val location = createMockLocation(
            lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f,
            hasAltitude = true, altitude = 35.7
        )

        val payload = builder.buildPayload(
            location = location,
            batteryLevel = 80,
            batteryStatus = 2,
            fieldMap = emptyMap(),
            timestamp = 1700000000L
        )

        assertEquals(36, payload.getInt("alt")) // 35.7 rounded
    }

    @Test
    fun `buildPayload excludes altitude when not available`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f)

        val payload = builder.buildPayload(
            location = location,
            batteryLevel = 80,
            batteryStatus = 2,
            fieldMap = emptyMap(),
            timestamp = 1700000000L
        )

        assertFalse(payload.has("alt"))
    }

    @Test
    fun `buildPayload includes bearing when available`() {
        val location = createMockLocation(
            lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f,
            hasBearing = true, bearing = 180.5f
        )

        val payload = builder.buildPayload(
            location = location,
            batteryLevel = 80,
            batteryStatus = 2,
            fieldMap = emptyMap(),
            timestamp = 1700000000L
        )

        assertEquals(180.5, payload.getDouble("bear"), 0.1)
    }

    @Test
    fun `buildPayload includes custom fields`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f)
        val customFields = mapOf("_type" to "location", "device" to "phone1")

        val payload = builder.buildPayload(
            location = location,
            batteryLevel = 80,
            batteryStatus = 2,
            fieldMap = emptyMap(),
            timestamp = 1700000000L,
            customFields = customFields
        )

        assertEquals("location", payload.getString("_type"))
        assertEquals("phone1", payload.getString("device"))
    }

    // --- parseFieldMap tests ---

    @Test
    fun `parseFieldMap returns null for null input`() {
        assertNull(builder.parseFieldMap(null))
    }

    @Test
    fun `parseFieldMap returns null for blank input`() {
        assertNull(builder.parseFieldMap(""))
        assertNull(builder.parseFieldMap("  "))
    }

    @Test
    fun `parseFieldMap parses valid JSON`() {
        val json = """{"lat":"latitude","lon":"longitude","tst":"timestamp"}"""
        val result = builder.parseFieldMap(json)

        assertNotNull(result)
        assertEquals("latitude", result!!["lat"])
        assertEquals("longitude", result["lon"])
        assertEquals("timestamp", result["tst"])
    }

    @Test
    fun `parseFieldMap returns null for invalid JSON`() {
        assertNull(builder.parseFieldMap("not json"))
    }

    // --- parseCustomFields tests ---

    @Test
    fun `parseCustomFields returns null for null input`() {
        assertNull(builder.parseCustomFields(null))
    }

    @Test
    fun `parseCustomFields returns null for blank input`() {
        assertNull(builder.parseCustomFields(""))
    }

    @Test
    fun `parseCustomFields returns null for empty array`() {
        assertNull(builder.parseCustomFields("[]"))
    }

    @Test
    fun `parseCustomFields parses valid JSON array`() {
        val json = """[{"key":"_type","value":"location"},{"key":"device","value":"phone1"}]"""
        val result = builder.parseCustomFields(json)

        assertNotNull(result)
        assertEquals("location", result!!["_type"])
        assertEquals("phone1", result["device"])
    }

    @Test
    fun `parseCustomFields returns null for invalid JSON`() {
        assertNull(builder.parseCustomFields("not json"))
    }

    // --- helpers ---

    private fun createMockLocation(
        lat: Double,
        lon: Double,
        acc: Float,
        speed: Float,
        hasAltitude: Boolean = false,
        altitude: Double = 0.0,
        hasBearing: Boolean = false,
        bearing: Float = 0.0f
    ): Location = mockk {
        every { latitude } returns lat
        every { longitude } returns lon
        every { accuracy } returns acc
        every { this@mockk.speed } returns speed
        every { hasAltitude() } returns hasAltitude
        every { this@mockk.altitude } returns altitude
        every { hasBearing() } returns hasBearing
        every { this@mockk.bearing } returns bearing
    }
}
