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

    @Before
    fun setUp() {
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

    // --- buildLocationPayload tests ---

    @Test
    fun `buildLocationPayload uses default field names when no mapping`() {
        val location = createMockLocation(lat = 52.52, lon = 13.405, acc = 10.5f, speed = 1.2f)

        val payload = buildPayload(
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
    fun `buildLocationPayload ignores user fieldMap when apiFormat is TRACCAR_JSON`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f)

        val userFieldMap = mapOf("lat" to "latitude", "lon" to "longitude", "tst" to "timestamp")
        val payload = buildPayload(
            location = location,
            batteryLevel = 50,
            batteryStatus = 1,
            fieldMap = userFieldMap,
            timestamp = 1700000000L,
            apiFormat = ApiFormat.TRACCAR_JSON
        )

        // Must use internal names so NetworkManager.buildTraccarJsonPayload can read them back.
        assertEquals(52.0, payload.getDouble("lat"), 0.001)
        assertEquals(13.0, payload.getDouble("lon"), 0.001)
        assertEquals(1700000000L, payload.getLong("tst"))
        assertFalse(payload.has("latitude"))
        assertFalse(payload.has("longitude"))
        assertFalse(payload.has("timestamp"))
    }

    @Test
    fun `buildLocationPayload ignores user fieldMap when apiFormat is OVERLAND_BATCH`() {
        val location = createMockLocation(lat = 51.5, lon = -0.04, acc = 12.0f, speed = 0.0f)

        val userFieldMap = mapOf("lat" to "latitude", "lon" to "longitude", "tst" to "ts")
        val payload = buildPayload(
            location = location,
            batteryLevel = 85,
            batteryStatus = 2,
            fieldMap = userFieldMap,
            timestamp = 1704067200L,
            apiFormat = ApiFormat.OVERLAND_BATCH
        )

        // Must use canonical names so NetworkManager.buildOverlandBatchPayload can extract them.
        assertEquals(51.5, payload.getDouble("lat"), 0.001)
        assertEquals(-0.04, payload.getDouble("lon"), 0.001)
        assertEquals(1704067200L, payload.getLong("tst"))
        assertFalse(payload.has("latitude"))
        assertFalse(payload.has("longitude"))
        assertFalse(payload.has("ts"))
    }

    @Test
    fun `buildLocationPayload applies field name mapping`() {
        val location = createMockLocation(lat = 48.0, lon = 11.0, acc = 5.0f, speed = 0.0f)

        val fieldMap = mapOf("lat" to "latitude", "lon" to "longitude", "tst" to "timestamp")
        val payload = buildPayload(
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
    fun `buildLocationPayload includes altitude when available`() {
        val location = createMockLocation(
            lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f,
            hasAltitude = true, altitude = 35.7
        )

        val payload = buildPayload(
            location = location,
            batteryLevel = 80,
            batteryStatus = 2,
            fieldMap = emptyMap(),
            timestamp = 1700000000L
        )

        assertEquals(36, payload.getInt("alt")) // 35.7 rounded
    }

    @Test
    fun `buildLocationPayload excludes altitude when not available`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f)

        val payload = buildPayload(
            location = location,
            batteryLevel = 80,
            batteryStatus = 2,
            fieldMap = emptyMap(),
            timestamp = 1700000000L
        )

        assertFalse(payload.has("alt"))
    }

    @Test
    fun `buildLocationPayload excludes speed when not available`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f, hasSpeed = false)

        val payload = buildPayload(
            location = location,
            batteryLevel = 80,
            batteryStatus = 2,
            fieldMap = emptyMap(),
            timestamp = 1700000000L
        )

        assertFalse(payload.has("vel"))
    }

    @Test
    fun `buildLocationPayload includes zero speed when hasSpeed is true`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f, hasSpeed = true)

        val payload = buildPayload(
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
    fun `buildLocationPayload rounds speed to one decimal without float precision artifacts`() {
        val location049 = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.049f)
        val payload049 = buildPayload(location049, 80, 2, emptyMap(), 1700000000L)
        assertEquals(0.0, payload049.getDouble("vel"), 0.001) // 0.049 rounds down

        val location050 = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.05f)
        val payload050 = buildPayload(location050, 80, 2, emptyMap(), 1700000000L)
        assertEquals(0.1, payload050.getDouble("vel"), 0.001) // 0.05 rounds up

        val location127 = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 1.27f)
        val payload127 = buildPayload(location127, 80, 2, emptyMap(), 1700000000L)
        assertEquals(1.3, payload127.getDouble("vel"), 0.001) // 1.27 rounds to 1.3

        // Verify no float precision artifacts like 0.10000000149011612
        val location010 = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.1f)
        val payload010 = buildPayload(location010, 80, 2, emptyMap(), 1700000000L)
        assertEquals("0.1", payload010.getDouble("vel").toString())
    }

    @Test
    fun `buildLocationPayload includes bearing when available`() {
        val location = createMockLocation(
            lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f,
            hasBearing = true, bearing = 180.5f
        )

        val payload = buildPayload(
            location = location,
            batteryLevel = 80,
            batteryStatus = 2,
            fieldMap = emptyMap(),
            timestamp = 1700000000L
        )

        assertEquals(180.5, payload.getDouble("bear"), 0.1)
    }

    @Test
    fun `buildLocationPayload excludes bearing when not available`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f)

        val payload = buildPayload(
            location = location,
            batteryLevel = 80,
            batteryStatus = 2,
            fieldMap = emptyMap(),
            timestamp = 1700000000L
        )

        assertFalse(payload.has("bear"))
    }

    @Test
    fun `buildLocationPayload includes custom fields`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f)
        val customFields = mapOf("_type" to "location", "device" to "phone1")

        val payload = buildPayload(
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
        assertNull(PayloadBuilder.parseFieldMap(null))
    }

    @Test
    fun `parseFieldMap returns null for blank input`() {
        assertNull(PayloadBuilder.parseFieldMap(""))
        assertNull(PayloadBuilder.parseFieldMap("  "))
    }

    @Test
    fun `parseFieldMap parses valid JSON`() {
        val json = """{"lat":"latitude","lon":"longitude","tst":"timestamp"}"""
        val result = PayloadBuilder.parseFieldMap(json)

        assertNotNull(result)
        assertEquals("latitude", result!!["lat"])
        assertEquals("longitude", result["lon"])
        assertEquals("timestamp", result["tst"])
    }

    @Test
    fun `parseFieldMap returns null for invalid JSON`() {
        assertNull(PayloadBuilder.parseFieldMap("not json"))
    }

    // --- parseCustomFields tests ---

    @Test
    fun `parseCustomFields returns null for null input`() {
        assertNull(PayloadBuilder.parseCustomFields(null))
    }

    @Test
    fun `parseCustomFields returns null for blank input`() {
        assertNull(PayloadBuilder.parseCustomFields(""))
    }

    @Test
    fun `parseCustomFields returns null for empty array`() {
        assertNull(PayloadBuilder.parseCustomFields("[]"))
    }

    @Test
    fun `parseCustomFields parses valid JSON array`() {
        val json = """[{"key":"_type","value":"location"},{"key":"device","value":"phone1"}]"""
        val result = PayloadBuilder.parseCustomFields(json)

        assertNotNull(result)
        assertEquals("location", result!!["_type"])
        assertEquals("phone1", result["device"])
    }

    @Test
    fun `parseCustomFields returns null for invalid JSON`() {
        assertNull(PayloadBuilder.parseCustomFields("not json"))
    }

    // --- buildLocationPayload custom fields edge-case tests ---

    @Test
    fun `buildLocationPayload includes multiple custom fields`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f)
        val customFields = mapOf(
            "_type" to "location",
            "device" to "phone1",
            "region" to "eu-west"
        )

        val payload = buildPayload(
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
    fun `buildLocationPayload custom field does not override standard fields`() {
        val location = createMockLocation(lat = 52.52, lon = 13.405, acc = 5.0f, speed = 0.0f)
        // Custom field uses the same key "lat" as the standard latitude field
        val customFields = mapOf("lat" to "999.0")

        val payload = buildPayload(
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
    fun `buildLocationPayload with empty custom fields map`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f)
        val customFields = emptyMap<String, String>()

        val payload = buildPayload(
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
    fun `buildLocationPayload includes blank custom field keys`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f)
        // The implementation does not filter blank keys - they are passed through as-is
        val customFields = mapOf("" to "some_value", "valid" to "data")

        val payload = buildPayload(
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
    fun `buildLocationPayload includes blank custom field values`() {
        val location = createMockLocation(lat = 52.0, lon = 13.0, acc = 5.0f, speed = 0.0f)
        // The implementation does not filter blank values - they are passed through as-is
        val customFields = mapOf("myfield" to "", "other" to "ok")

        val payload = buildPayload(
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

    private fun buildPayload(
        location: Location,
        batteryLevel: Int,
        batteryStatus: Int,
        fieldMap: Map<String, String>,
        timestamp: Long,
        customFields: Map<String, String> = emptyMap(),
        apiFormat: ApiFormat = ApiFormat.FIELD_MAPPED
    ): JSONObject = PayloadBuilder.buildLocationPayload(
        location, timestamp, batteryLevel, batteryStatus, fieldMap, customFields, apiFormat
    )

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
