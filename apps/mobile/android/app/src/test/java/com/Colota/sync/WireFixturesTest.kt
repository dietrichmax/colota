package com.Colota.sync

import android.location.Location
import com.Colota.service.GeofenceTransitions
import com.Colota.util.AppLogger
import com.Colota.util.BatteryStatus
import io.mockk.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.io.File

/** colota-forwarder's tests replay the same files, so a change here has to land there too. */
class WireFixturesTest {

    private val fixtures: File = generateSequence(File(System.getProperty("user.dir")).absoluteFile) { it.parentFile }
        .map { File(it, "fixtures/wire") }
        .first { it.isDirectory }

    private val fix: Location = mockk {
        every { latitude } returns 48.1372
        every { longitude } returns 11.5761
        every { accuracy } returns 8.4f
        every { hasAltitude() } returns true
        every { altitude } returns 519.6
        every { hasSpeed() } returns true
        every { speed } returns 1.43f
        every { hasBearing() } returns true
        every { bearing } returns 90.5f
    }

    @Before
    fun setUp() {
        mockkObject(AppLogger)
        every { AppLogger.e(any(), any(), any()) } just Runs
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
    }

    private fun point(format: ApiFormat, customFields: Map<String, String>, inRegions: List<String>): JSONObject =
        PayloadBuilder.buildLocationPayload(
            fix, 1763200000L, 82, BatteryStatus.DISCHARGING, emptyMap(), customFields, format, inRegions
        )

    // Numbers compare as Double so 8 and 8.0 match, as they do for any JSON reader.
    private fun normalize(value: Any?): Any? = when (value) {
        is JSONObject -> value.keys().asSequence().associateWith { normalize(value.get(it)) }
        is JSONArray -> (0 until value.length()).map { normalize(value.get(it)) }
        is Number -> value.toDouble()
        else -> value
    }

    private fun assertMatchesFixture(name: String, actual: JSONObject) {
        val expected = JSONObject(File(fixtures, name).readText())
        assertEquals(
            "fixtures/wire/$name no longer matches what Colota sends:\n${actual.toString(2)}",
            normalize(expected),
            normalize(actual)
        )
    }

    @Test
    fun `every format and geofence event the app can send has a fixture`() {
        // A new one needs its own fixture and test here, then the forwarder's wire.test.ts, before this list grows.
        assertEquals(setOf("FIELD_MAPPED", "TRACCAR_JSON", "OVERLAND_BATCH"), ApiFormat.values().map { it.name }.toSet())
        assertEquals(setOf("enter", "leave"), GeofenceTransitions.Event.values().map { it.wireName }.toSet())
    }

    @Test
    fun `a field-mapped point matches location json`() {
        assertMatchesFixture("location.json", point(ApiFormat.FIELD_MAPPED, mapOf("tid" to "pixel"), listOf("Home")))
    }

    @Test
    fun `a field-mapped geofence event matches transition json`() {
        val point = point(ApiFormat.FIELD_MAPPED, mapOf("tid" to "pixel"), listOf("Home"))
        assertMatchesFixture("transition.json", PayloadBuilder.buildTransitionPayload(point, "enter", "Home", 1760000000L))
    }

    @Test
    fun `a Traccar JSON point matches traccar-json json`() {
        // the Traccar template's custom field is "id"
        val flat = point(ApiFormat.TRACCAR_JSON, mapOf("id" to "pixel"), emptyList())
        assertMatchesFixture("traccar-json.json", PayloadBuilder.buildTraccarJsonPayload(flat))
    }

    @Test
    fun `an Overland batch matches overland-batch json`() {
        val flat = point(ApiFormat.OVERLAND_BATCH, mapOf("device_id" to "pixel"), listOf("Home"))
        val envelope = PayloadBuilder.buildOverlandBatchPayload(listOf(flat), PayloadBuilder.extractEnvelopeCustomFields(flat))
        assertMatchesFixture("overland-batch.json", envelope)
    }

    @Test
    fun `Overland geofence events sent on their own match overland-transitions json`() {
        // a leave is dated by the first fix outside and carries no inregions
        val point = point(ApiFormat.OVERLAND_BATCH, mapOf("device_id" to "pixel"), emptyList())
        val leave = PayloadBuilder.buildTransitionPayload(point, "leave", "Home", 1760000000L)
        val envelope = PayloadBuilder.buildOverlandBatchPayload(
            items = emptyList(),
            customFields = PayloadBuilder.extractEnvelopeCustomFields(leave),
            transitions = listOf(leave),
        )
        assertMatchesFixture("overland-transitions.json", envelope)
    }
}
