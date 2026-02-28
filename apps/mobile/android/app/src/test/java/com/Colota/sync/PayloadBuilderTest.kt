package com.Colota.sync

import android.location.Location
import com.Colota.util.AppLogger
import io.mockk.*
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class PayloadBuilderTest {

    private lateinit var builder: PayloadBuilder

    @Before
    fun setUp() {
        builder = PayloadBuilder()

        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
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
        assertEquals(1.2, payload.getDouble("vel"), 0.01) // one decimal
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
    fun `buildPayload excludes speed when not available`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f, hasSpeed = false)

        val payload = builder.buildPayload(
            location = location,
            batteryLevel = 80,
            batteryStatus = 2,
            fieldMap = emptyMap(),
            timestamp = 1700000000L
        )

        assertFalse(payload.has("vel"))
    }

    @Test
    fun `buildPayload includes zero speed when hasSpeed is true`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f, hasSpeed = true)

        val payload = builder.buildPayload(
            location = location,
            batteryLevel = 80,
            batteryStatus = 2,
            fieldMap = emptyMap(),
            timestamp = 1700000000L
        )

        assertTrue(payload.has("vel"))
        assertEquals(0.0, payload.getDouble("vel"), 0.001)
    }

    @Test
    fun `buildPayload rounds speed to one decimal without float precision artifacts`() {
        val location049 = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.049f)
        val payload049 = builder.buildPayload(location049, 80, 2, emptyMap(), 1700000000L)
        assertEquals(0.0, payload049.getDouble("vel"), 0.001) // 0.049 rounds down

        val location050 = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.05f)
        val payload050 = builder.buildPayload(location050, 80, 2, emptyMap(), 1700000000L)
        assertEquals(0.1, payload050.getDouble("vel"), 0.001) // 0.05 rounds up

        val location127 = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 1.27f)
        val payload127 = builder.buildPayload(location127, 80, 2, emptyMap(), 1700000000L)
        assertEquals(1.3, payload127.getDouble("vel"), 0.001) // 1.27 rounds to 1.3

        // Verify no float precision artifacts like 0.10000000149011612
        val location010 = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.1f)
        val payload010 = builder.buildPayload(location010, 80, 2, emptyMap(), 1700000000L)
        assertEquals("0.1", payload010.getDouble("vel").toString())
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
    fun `buildPayload excludes bearing when not available`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f)

        val payload = builder.buildPayload(
            location = location,
            batteryLevel = 80,
            batteryStatus = 2,
            fieldMap = emptyMap(),
            timestamp = 1700000000L
        )

        assertFalse(payload.has("bear"))
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

    // --- buildPayload custom fields edge-case tests ---

    @Test
    fun `buildPayload includes multiple custom fields`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f)
        val customFields = mapOf(
            "_type" to "location",
            "device" to "phone1",
            "region" to "eu-west"
        )

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
        assertEquals("eu-west", payload.getString("region"))
    }

    @Test
    fun `buildPayload custom field does not override standard fields`() {
        val location = createMockLocation(lat = 52.52, lon = 13.405, acc = 5.0f, speed = 0.0f)
        // Custom field uses the same key "lat" as the standard latitude field
        val customFields = mapOf("lat" to "999.0")

        val payload = builder.buildPayload(
            location = location,
            batteryLevel = 80,
            batteryStatus = 2,
            fieldMap = emptyMap(),
            timestamp = 1700000000L,
            customFields = customFields
        )

        // Standard fields are written after custom fields, so the standard value wins
        assertEquals(52.52, payload.getDouble("lat"), 0.001)
    }

    @Test
    fun `buildPayload with empty custom fields map`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f)
        val customFields = emptyMap<String, String>()

        val payload = builder.buildPayload(
            location = location,
            batteryLevel = 80,
            batteryStatus = 2,
            fieldMap = emptyMap(),
            timestamp = 1700000000L,
            customFields = customFields
        )

        // Only standard fields should be present (no altitude/speed/bearing since mocked without them)
        assertEquals(52.0, payload.getDouble("lat"), 0.001)
        assertEquals(13.0, payload.getDouble("lon"), 0.001)
        assertEquals(5, payload.getInt("acc"))
        assertEquals(80, payload.getInt("batt"))
        assertEquals(2, payload.getInt("bs"))
        assertEquals(1700000000L, payload.getLong("tst"))
        // Verify the payload has exactly the expected keys (no extras from custom fields)
        val keys = payload.keys().asSequence().toSet()
        assertEquals(setOf("lat", "lon", "acc", "vel", "batt", "bs", "tst"), keys)
    }

    @Test
    fun `buildPayload includes blank custom field keys`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f)
        // The implementation does not filter blank keys - they are passed through as-is
        val customFields = mapOf("" to "some_value", "valid" to "data")

        val payload = builder.buildPayload(
            location = location,
            batteryLevel = 80,
            batteryStatus = 2,
            fieldMap = emptyMap(),
            timestamp = 1700000000L,
            customFields = customFields
        )

        // Blank key is included because buildPayload does not filter it
        assertEquals("some_value", payload.getString(""))
        assertEquals("data", payload.getString("valid"))
    }

    @Test
    fun `buildPayload includes blank custom field values`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f)
        // The implementation does not filter blank values - they are passed through as-is
        val customFields = mapOf("myfield" to "", "other" to "ok")

        val payload = builder.buildPayload(
            location = location,
            batteryLevel = 80,
            batteryStatus = 2,
            fieldMap = emptyMap(),
            timestamp = 1700000000L,
            customFields = customFields
        )

        // Blank value is included because buildPayload does not filter it
        assertEquals("", payload.getString("myfield"))
        assertEquals("ok", payload.getString("other"))
    }

    // --- helpers ---

    private fun createMockLocation(
        lat: Double,
        lon: Double,
        acc: Float,
        speed: Float,
        hasAltitude: Boolean = false,
        altitude: Double = 0.0,
        hasSpeed: Boolean = true,
        hasBearing: Boolean = false,
        bearing: Float = 0.0f
    ): Location = mockk {
        every { latitude } returns lat
        every { longitude } returns lon
        every { accuracy } returns acc
        every { this@mockk.speed } returns speed
        every { hasSpeed() } returns hasSpeed
        every { hasAltitude() } returns hasAltitude
        every { this@mockk.altitude } returns altitude
        every { hasBearing() } returns hasBearing
        every { this@mockk.bearing } returns bearing
    }
}
