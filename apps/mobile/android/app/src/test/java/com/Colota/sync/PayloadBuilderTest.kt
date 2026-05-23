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

        // Must use internal names so PayloadBuilder.buildTraccarJsonPayload can read them back.
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

        // Must use canonical names so PayloadBuilder.buildOverlandBatchPayload can extract them.
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

    // --- buildTraccarJsonPayload ---

    @Test
    fun `buildTraccarJsonPayload maps lat and lon to coords`() {
        val flat = JSONObject().apply {
            put("lat", 52.12345)
            put("lon", -2.12345)
            put("tst", 1739362800L)
        }
        val result = PayloadBuilder.buildTraccarJsonPayload(flat)
        val coords = result.getJSONObject("location").getJSONObject("coords")
        assertEquals(52.12345, coords.getDouble("latitude"), 0.0001)
        assertEquals(-2.12345, coords.getDouble("longitude"), 0.0001)
    }

    @Test
    fun `buildTraccarJsonPayload uses id field as device_id`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
            put("id", "my-phone")
        }
        val result = PayloadBuilder.buildTraccarJsonPayload(flat)
        assertEquals("my-phone", result.getString("device_id"))
    }

    @Test
    fun `buildTraccarJsonPayload falls back to device_id field when id absent`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
            put("device_id", "my-device")
        }
        val result = PayloadBuilder.buildTraccarJsonPayload(flat)
        assertEquals("my-device", result.getString("device_id"))
    }

    @Test
    fun `buildTraccarJsonPayload defaults device_id to colota`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
        }
        val result = PayloadBuilder.buildTraccarJsonPayload(flat)
        assertEquals("colota", result.getString("device_id"))
    }

    @Test
    fun `buildTraccarJsonPayload includes optional coords fields when present`() {
        val flat = JSONObject().apply {
            put("lat", 52.0); put("lon", 13.0); put("tst", 1000L)
            put("acc", 15.0)
            put("alt", 380.0)
            put("vel", 5.5)
            put("bear", 90.0)
        }
        val result = PayloadBuilder.buildTraccarJsonPayload(flat)
        val coords = result.getJSONObject("location").getJSONObject("coords")
        assertEquals(15.0, coords.getDouble("accuracy"), 0.001)
        assertEquals(380.0, coords.getDouble("altitude"), 0.001)
        assertEquals(5.5, coords.getDouble("speed"), 0.001)
        assertEquals(90.0, coords.getDouble("heading"), 0.001)
    }

    @Test
    fun `buildTraccarJsonPayload omits optional coords fields when absent`() {
        val flat = JSONObject().apply {
            put("lat", 52.0); put("lon", 13.0); put("tst", 1000L)
        }
        val result = PayloadBuilder.buildTraccarJsonPayload(flat)
        val coords = result.getJSONObject("location").getJSONObject("coords")
        assertFalse(coords.has("accuracy"))
        assertFalse(coords.has("altitude"))
        assertFalse(coords.has("speed"))
        assertFalse(coords.has("heading"))
    }

    @Test
    fun `buildTraccarJsonPayload includes battery when batt present`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
            put("batt", 85)
            put("bs", 2)
        }
        val result = PayloadBuilder.buildTraccarJsonPayload(flat)
        val battery = result.getJSONObject("location").getJSONObject("battery")
        assertEquals(0.85, battery.getDouble("level"), 0.001)
        assertTrue(battery.getBoolean("is_charging"))
    }

    @Test
    fun `buildTraccarJsonPayload omits battery when batt absent`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
        }
        val result = PayloadBuilder.buildTraccarJsonPayload(flat)
        assertFalse(result.getJSONObject("location").has("battery"))
    }

    @Test
    fun `buildTraccarJsonPayload formats timestamp as ISO 8601`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0)
            put("tst", 1739362800L)
        }
        val result = PayloadBuilder.buildTraccarJsonPayload(flat)
        val timestamp = result.getJSONObject("location").getString("timestamp")
        assertTrue("Expected ISO 8601 format, got: $timestamp", timestamp.contains("T") && timestamp.endsWith("Z"))
    }

    // --- buildTraccarJsonPayload: battery status codes ---

    @Test
    fun `buildTraccarJsonPayload marks bs=3 full as charging`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
            put("batt", 100); put("bs", 3)
        }
        val result = PayloadBuilder.buildTraccarJsonPayload(flat)
        val battery = result.getJSONObject("location").getJSONObject("battery")
        assertTrue(battery.getBoolean("is_charging"))
        assertEquals(1.0, battery.getDouble("level"), 0.001)
    }

    @Test
    fun `buildTraccarJsonPayload marks bs=1 not charging as not charging`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
            put("batt", 50); put("bs", 1)
        }
        val result = PayloadBuilder.buildTraccarJsonPayload(flat)
        val battery = result.getJSONObject("location").getJSONObject("battery")
        assertFalse(battery.getBoolean("is_charging"))
    }

    @Test
    fun `buildTraccarJsonPayload marks bs=0 unknown as not charging`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
            put("batt", 50); put("bs", 0)
        }
        val result = PayloadBuilder.buildTraccarJsonPayload(flat)
        val battery = result.getJSONObject("location").getJSONObject("battery")
        assertFalse(battery.getBoolean("is_charging"))
    }

    // --- buildTraccarJsonPayload: JSON roundtrip (simulates batch sync path) ---

    @Test
    fun `buildTraccarJsonPayload produces identical output after JSON string roundtrip`() {
        val flat = JSONObject().apply {
            put("id", "my-tracker")
            put("lat", 52.12345)
            put("lon", -2.12345)
            put("acc", 15)
            put("alt", 380)
            put("vel", 5.5)
            put("bear", 90.0)
            put("batt", 85)
            put("bs", 2)
            put("tst", 1739362800L)
        }

        // Direct path (instant sync)
        val directResult = PayloadBuilder.buildTraccarJsonPayload(flat)

        // Roundtrip path (batch sync: toString -> DB -> JSONObject parse)
        val serialized = flat.toString()
        val roundtripped = JSONObject(serialized)
        val roundtripResult = PayloadBuilder.buildTraccarJsonPayload(roundtripped)

        assertEquals(
            directResult.getString("device_id"),
            roundtripResult.getString("device_id")
        )
        val directCoords = directResult.getJSONObject("location").getJSONObject("coords")
        val roundtripCoords = roundtripResult.getJSONObject("location").getJSONObject("coords")
        assertEquals(directCoords.getDouble("latitude"), roundtripCoords.getDouble("latitude"), 0.00001)
        assertEquals(directCoords.getDouble("longitude"), roundtripCoords.getDouble("longitude"), 0.00001)
        assertEquals(directCoords.getDouble("accuracy"), roundtripCoords.getDouble("accuracy"), 0.001)
        assertEquals(directCoords.getDouble("altitude"), roundtripCoords.getDouble("altitude"), 0.001)
        assertEquals(directCoords.getDouble("speed"), roundtripCoords.getDouble("speed"), 0.001)
        assertEquals(directCoords.getDouble("heading"), roundtripCoords.getDouble("heading"), 0.001)

        val directBatt = directResult.getJSONObject("location").getJSONObject("battery")
        val roundtripBatt = roundtripResult.getJSONObject("location").getJSONObject("battery")
        assertEquals(directBatt.getDouble("level"), roundtripBatt.getDouble("level"), 0.001)
        assertEquals(directBatt.getBoolean("is_charging"), roundtripBatt.getBoolean("is_charging"))

        assertEquals(
            directResult.getJSONObject("location").getString("timestamp"),
            roundtripResult.getJSONObject("location").getString("timestamp")
        )
    }

    @Test
    fun `buildTraccarJsonPayload handles minimal payload after roundtrip`() {
        val flat = JSONObject().apply {
            put("lat", 0.0)
            put("lon", 0.0)
            put("tst", 1000L)
        }

        val roundtripped = JSONObject(flat.toString())
        val result = PayloadBuilder.buildTraccarJsonPayload(roundtripped)

        assertEquals("colota", result.getString("device_id"))
        val coords = result.getJSONObject("location").getJSONObject("coords")
        assertEquals(0.0, coords.getDouble("latitude"), 0.001)
        assertFalse(coords.has("speed"))
        assertFalse(coords.has("heading"))
        assertFalse(result.getJSONObject("location").has("battery"))
    }

    // --- buildOverlandBatchPayload ---

    @Test
    fun `buildOverlandBatchPayload wraps single point in locations array`() {
        val flat = JSONObject().apply {
            put("lat", 51.5); put("lon", -0.04); put("acc", 12); put("alt", 519)
            put("vel", 0.0); put("bear", 180.5); put("batt", 85); put("bs", 2)
            put("tst", 1704067200L)
        }
        val result = PayloadBuilder.buildOverlandBatchPayload(listOf(flat), emptyMap())

        assertTrue(result.has("locations"))
        val locations = result.getJSONArray("locations")
        assertEquals(1, locations.length())
        val feature = locations.getJSONObject(0)
        assertEquals("Feature", feature.getString("type"))
    }

    @Test
    fun `buildOverlandBatchPayload uses GeoJSON lon-lat coordinate order`() {
        val flat = JSONObject().apply {
            put("lat", 51.5); put("lon", -0.04); put("tst", 1704067200L)
        }
        val result = PayloadBuilder.buildOverlandBatchPayload(listOf(flat), emptyMap())
        val coords = result.getJSONArray("locations").getJSONObject(0)
            .getJSONObject("geometry").getJSONArray("coordinates")
        assertEquals(-0.04, coords.getDouble(0), 0.001)  // lon first
        assertEquals(51.5, coords.getDouble(1), 0.001)   // lat second
    }

    @Test
    fun `buildOverlandBatchPayload bundles 50 features in one envelope`() {
        val items = (1..50).map {
            JSONObject().apply {
                put("lat", it.toDouble()); put("lon", it.toDouble()); put("tst", 1704067200L + it)
            }
        }
        val result = PayloadBuilder.buildOverlandBatchPayload(items, emptyMap())
        assertEquals(50, result.getJSONArray("locations").length())
    }

    @Test
    fun `buildOverlandBatchPayload formats timestamp as ISO 8601`() {
        val flat = JSONObject().apply {
            put("lat", 51.5); put("lon", -0.04); put("tst", 1704067200L)
        }
        val result = PayloadBuilder.buildOverlandBatchPayload(listOf(flat), emptyMap())
        val timestamp = result.getJSONArray("locations").getJSONObject(0)
            .getJSONObject("properties").getString("timestamp")
        assertTrue("Expected ISO 8601 format, got: $timestamp", timestamp.contains("T") && timestamp.endsWith("Z"))
    }

    @Test
    fun `buildOverlandBatchPayload scales battery_level from 0-100 to 0-1`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
            put("batt", 85); put("bs", 2)
        }
        val result = PayloadBuilder.buildOverlandBatchPayload(listOf(flat), emptyMap())
        val props = result.getJSONArray("locations").getJSONObject(0).getJSONObject("properties")
        assertEquals(0.85, props.getDouble("battery_level"), 0.001)
        assertEquals("charging", props.getString("battery_state"))
    }

    @Test
    fun `buildOverlandBatchPayload maps battery_state correctly`() {
        fun stateFor(bs: Int): String {
            val flat = JSONObject().apply {
                put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
                put("batt", 50); put("bs", bs)
            }
            return PayloadBuilder.buildOverlandBatchPayload(listOf(flat), emptyMap())
                .getJSONArray("locations").getJSONObject(0)
                .getJSONObject("properties").getString("battery_state")
        }
        // Mapping must match DeviceInfoHelper.kt: 0=default/unknown, 1=discharging or not charging
        // (unplugged), 2=charging, 3=full. Out-of-range values default to "unknown" (safer than
        // inventing a definite state).
        assertEquals("unknown", stateFor(0))
        assertEquals("unplugged", stateFor(1))
        assertEquals("charging", stateFor(2))
        assertEquals("full", stateFor(3))
        assertEquals("unknown", stateFor(99))
    }

    @Test
    fun `buildOverlandBatchPayload device_id falls back when explicit override is empty string`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L); put("tid", "AA")
        }
        // Empty-string override should not bypass the fallback chain.
        val result = PayloadBuilder.buildOverlandBatchPayload(listOf(flat), mapOf("device_id" to ""))
        assertEquals("AA", result.getString("device_id"))
    }

    @Test
    fun `buildOverlandBatchPayload does not clobber locations when custom field has reserved key`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
        }
        // A custom field named "locations" or "device_id" must not overwrite the envelope structure.
        val result = PayloadBuilder.buildOverlandBatchPayload(
            listOf(flat),
            mapOf("locations" to "evil", "device_id" to "my-pixel", "extra" to "ok")
        )
        val locations = result.getJSONArray("locations")
        assertEquals(1, locations.length())
        assertEquals("my-pixel", result.getString("device_id"))
        assertEquals("ok", result.getString("extra"))
    }

    @Test
    fun `flatToOverlandFeature replaces tst=0 with current time`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 0L)  // corrupted/zero timestamp
        }
        val result = PayloadBuilder.buildOverlandBatchPayload(listOf(flat), emptyMap())
        val timestamp = result.getJSONArray("locations").getJSONObject(0)
            .getJSONObject("properties").getString("timestamp")
        // Must NOT be 1970-01-01 - we substitute current time when the stored timestamp is invalid
        assertFalse("timestamp should not be epoch zero, got: $timestamp", timestamp.startsWith("1970"))
    }

    @Test
    fun `buildOverlandBatchPayload omits optional properties when absent`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
        }
        val result = PayloadBuilder.buildOverlandBatchPayload(listOf(flat), emptyMap())
        val props = result.getJSONArray("locations").getJSONObject(0).getJSONObject("properties")
        assertFalse(props.has("horizontal_accuracy"))
        assertFalse(props.has("altitude"))
        assertFalse(props.has("speed"))
        assertFalse(props.has("course"))
        assertFalse(props.has("battery_level"))
    }

    @Test
    fun `buildOverlandBatchPayload places custom fields at envelope level not per Feature`() {
        val flat = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
        }
        val result = PayloadBuilder.buildOverlandBatchPayload(
            listOf(flat),
            mapOf("device_id" to "my-pixel", "extra" to "value")
        )
        assertEquals("my-pixel", result.getString("device_id"))
        assertEquals("value", result.getString("extra"))
        val props = result.getJSONArray("locations").getJSONObject(0).getJSONObject("properties")
        assertFalse(props.has("device_id"))
        assertFalse(props.has("extra"))
    }

    @Test
    fun `buildOverlandBatchPayload device_id falls back through device_id then tid then id then literal`() {
        // Explicit envelope override wins
        val withDeviceId = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L); put("device_id", "from-payload")
        }
        var result = PayloadBuilder.buildOverlandBatchPayload(listOf(withDeviceId), emptyMap())
        assertEquals("from-payload", result.getString("device_id"))

        // tid fallback (OwnTracks user migrating to batch)
        val withTid = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L); put("tid", "AA")
        }
        result = PayloadBuilder.buildOverlandBatchPayload(listOf(withTid), emptyMap())
        assertEquals("AA", result.getString("device_id"))

        // id fallback (Traccar user migrating to batch)
        val withId = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L); put("id", "trax")
        }
        result = PayloadBuilder.buildOverlandBatchPayload(listOf(withId), emptyMap())
        assertEquals("trax", result.getString("device_id"))

        // Literal default when nothing set
        val empty = JSONObject().apply {
            put("lat", 1.0); put("lon", 1.0); put("tst", 1000L)
        }
        result = PayloadBuilder.buildOverlandBatchPayload(listOf(empty), emptyMap())
        assertEquals("colota", result.getString("device_id"))
    }

    @Test
    fun `buildOverlandBatchPayload returns empty locations array for empty input`() {
        val result = PayloadBuilder.buildOverlandBatchPayload(emptyList(), emptyMap())
        assertEquals(0, result.getJSONArray("locations").length())
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
