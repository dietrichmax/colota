package com.Colota.service

import android.location.Location
import com.Colota.data.DatabaseHelper
import com.Colota.data.GeofenceHelper
import com.Colota.data.SettingsKeys
import com.Colota.service.GeofenceTransitions.Event
import com.Colota.util.AppLogger
import io.mockk.*
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class GeofenceTransitionsTest {

    private lateinit var geofenceHelper: GeofenceHelper
    private lateinit var dbHelper: DatabaseHelper
    private val settings = mutableMapOf<String, String>()

    // 100 m around the centre; 0.001 deg of latitude is about 111 m
    private val home = GeofenceHelper.Region(id = 1, name = "Home", lat = 52.52, lon = 13.405, radius = 100.0)
    private val garden = GeofenceHelper.Region(id = 2, name = "Garden", lat = 52.5205, lon = 13.405, radius = 100.0)

    @Before
    fun setUp() {
        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs

        geofenceHelper = mockk()
        every { geofenceHelper.getEnabledRegions() } returns listOf(home)
        dbHelper = mockk()
        every { dbHelper.getSetting(any()) } answers { settings[firstArg()] }
        every { dbHelper.saveSetting(any(), any()) } answers { settings[firstArg()] = secondArg() }
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
    }

    private fun fix(latOffset: Double, accuracy: Float = 20f): Location = mockk {
        every { latitude } returns 52.52 + latOffset
        every { longitude } returns 13.405
        every { this@mockk.accuracy } returns accuracy
    }

    private val atCentre get() = fix(0.0)
    // 111 m: past the 100 m radius, inside radius + 20 m accuracy
    private val inMargin get() = fix(0.001)
    // 222 m: past radius + accuracy
    private val farOut get() = fix(0.002)

    private fun transitions() = GeofenceTransitions(geofenceHelper, dbHelper)

    @Test
    fun `a geofence with no known state is seeded without an enter`() {
        val subject = transitions()

        assertTrue(subject.evaluate(atCentre).isEmpty())
        assertEquals(listOf("Home"), subject.insideNames)
    }

    @Test
    fun `entering a geofence the device was known to be outside reports at once`() {
        val subject = transitions()
        subject.evaluate(farOut)
        val arrival = atCentre

        val result = subject.evaluate(arrival)

        assertEquals(1, result.size)
        assertEquals(Event.ENTER, result[0].event)
        assertEquals(home, result[0].region)
        assertSame(arrival, result[0].location)
        assertEquals(listOf("Home"), subject.insideNames)
    }

    @Test
    fun `one fix past the margin does not report a leave, so one wild fix cannot`() {
        val subject = transitions()
        subject.evaluate(atCentre)

        assertTrue(subject.evaluate(farOut).isEmpty())
        assertEquals(listOf("Home"), subject.insideNames)
    }

    @Test
    fun `a second fix past the margin reports the leave dated by the first`() {
        val subject = transitions()
        subject.evaluate(atCentre)
        val departure = farOut
        subject.evaluate(departure)

        val result = subject.evaluate(farOut)

        assertEquals(1, result.size)
        assertEquals(Event.LEAVE, result[0].event)
        assertSame(departure, result[0].location)
        assertTrue(subject.insideNames.isEmpty())
    }

    @Test
    fun `a fix within radius plus accuracy keeps the device inside and cancels a pending leave`() {
        val subject = transitions()
        subject.evaluate(atCentre)
        subject.evaluate(farOut)

        assertTrue(subject.evaluate(inMargin).isEmpty())
        assertTrue(subject.evaluate(farOut).isEmpty())
        assertEquals(listOf("Home"), subject.insideNames)

        assertEquals(Event.LEAVE, subject.evaluate(farOut).single().event)
    }

    @Test
    fun `a restart restores the state, so a known geofence reports instead of seeding again`() {
        transitions().evaluate(farOut)

        val restarted = transitions()
        restarted.restore()

        assertEquals(Event.ENTER, restarted.evaluate(atCentre).single().event)
    }

    @Test
    fun `restore names the geofences the device was in before the first fix arrives`() {
        transitions().evaluate(atCentre)

        val restarted = transitions()
        restarted.restore()

        assertEquals(listOf("Home"), restarted.insideNames)
    }

    @Test
    fun `clear forgets the state, so turning events on again sends no enter for where the device already is`() {
        val subject = transitions()
        subject.evaluate(farOut)

        subject.clear()

        assertEquals("", settings[SettingsKeys.GEOFENCE_STATE])
        assertTrue(subject.evaluate(atCentre).isEmpty())
        assertEquals(listOf("Home"), subject.insideNames)
    }

    @Test
    fun `clear writes nothing when there is nothing to forget`() {
        transitions().clear()

        verify(exactly = 0) { dbHelper.saveSetting(any(), any()) }
    }

    @Test
    fun `overlapping geofences each report and are named in id order`() {
        every { geofenceHelper.getEnabledRegions() } returns listOf(home, garden)
        val subject = transitions()
        subject.evaluate(fix(0.01))

        val result = subject.evaluate(fix(0.0003))

        assertEquals(listOf(home, garden), result.map { it.region })
        assertEquals(listOf("Home", "Garden"), subject.insideNames)
    }

    @Test
    fun `a geofence that is deleted or disabled drops out without a leave`() {
        val subject = transitions()
        subject.evaluate(atCentre)
        every { geofenceHelper.getEnabledRegions() } returns emptyList()

        assertTrue(subject.evaluate(atCentre).isEmpty())
        assertTrue(subject.insideNames.isEmpty())
        assertEquals(0, JSONObject(settings[SettingsKeys.GEOFENCE_STATE]!!).length())
    }

    @Test
    fun `a failed geofence read keeps the state instead of seeding it again`() {
        val subject = transitions()
        subject.evaluate(farOut)
        every { geofenceHelper.getEnabledRegions() } returns null
        subject.evaluate(atCentre)
        every { geofenceHelper.getEnabledRegions() } returns listOf(home)

        assertEquals(Event.ENTER, subject.evaluate(atCentre).single().event)
    }

    @Test
    fun `namesAt names the geofences around a placed point although no fix reached the report`() {
        every { geofenceHelper.getEnabledRegions() } returns listOf(home, garden)
        val subject = transitions()

        assertEquals(listOf("Home", "Garden"), subject.namesAt(52.52, 13.405))
        assertTrue(subject.namesAt(52.522, 13.405).isEmpty())
        verify(exactly = 0) { dbHelper.saveSetting(any(), any()) }
    }

    @Test
    fun `namesAt keeps the last names when the geofences cannot be read`() {
        val subject = transitions()
        subject.evaluate(atCentre)
        every { geofenceHelper.getEnabledRegions() } returns null

        assertEquals(listOf("Home"), subject.namesAt(52.6, 13.405))
    }

    @Test
    fun `the state is written only when it changes`() {
        val subject = transitions()
        subject.evaluate(atCentre)
        subject.evaluate(atCentre)

        verify(exactly = 1) { dbHelper.saveSetting(SettingsKeys.GEOFENCE_STATE, any()) }
    }
}
