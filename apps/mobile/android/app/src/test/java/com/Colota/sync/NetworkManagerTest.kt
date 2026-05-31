package com.Colota.sync

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import com.Colota.util.AppLogger
import io.mockk.*
import org.junit.After
import org.junit.Before

/**
 * Tests for NetworkManager's pure-logic methods.
 * Network I/O and Android ConnectivityManager are not tested here (require instrumented tests).
 */
class NetworkManagerTest {

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

    // --- buildQueryString ---

    @Test
    fun `buildQueryString builds correct query for simple payload`() {
        val payload = JSONObject().apply {
            put("lat", 52.52)
            put("lon", 13.405)
            put("tst", 1700000000)
        }

        val result = invokeBuildQueryString(payload)

        // Verify each key=value pair is present (order may vary)
        assertTrue(result.contains("lat=52.52"))
        assertTrue(result.contains("lon=13.405"))
        assertTrue(result.contains("tst=1700000000"))
        assertEquals(2, result.count { it == '&' }) // 3 params = 2 ampersands
    }

    @Test
    fun `buildQueryString renders whole-number doubles as integers`() {
        // JS numbers cross the RN bridge as doubles, so a Test Connection unix
        // timestamp serializes as 1.780257432E9. Traccar's OsmAnd endpoint rejects
        // a scientific-notation timestamp and drops the connection without
        // replying (okhttp surfaces this as "unexpected end of stream").
        val payload = JSONObject().apply {
            put("tst", 1780257432.0)
            put("acc", 5.0)
            put("lat", 48.0685105)
        }

        val result = invokeBuildQueryString(payload)

        assertTrue(result.contains("tst=1780257432"))
        assertFalse("scientific notation breaks Traccar's parser", result.contains("1.780257432E9"))
        assertFalse("whole-number doubles must drop the .0", result.contains("acc=5.0"))
        assertTrue("fractional values keep their decimals", result.contains("lat=48.0685105"))
    }

    @Test
    fun `buildQueryString URL-encodes special characters`() {
        val payload = JSONObject().put("name", "hello world&more")

        val result = invokeBuildQueryString(payload)

        assertTrue(result.contains("name=hello+world%26more") || result.contains("name=hello%20world%26more"))
    }

    @Test
    fun `buildQueryString returns empty string for empty payload`() {
        val payload = JSONObject()
        val result = invokeBuildQueryString(payload)
        assertEquals("", result)
    }

    // --- resolveUrlVariables ---

    @Test
    fun `resolveUrlVariables substitutes DATE and TIMESTAMP`() {
        val payload = JSONObject().apply { put("tst", 1775308740L) }
        val manager = createNetworkManagerViaReflection()
        val result = manager.resolveUrlVariables("https://server.com/%DATE/%TIMESTAMP.json", payload)
        assertEquals("https://server.com/2026-04-04/1775308740.json", result)
    }

    @Test
    fun `resolveUrlVariables substitutes YEAR MONTH DAY`() {
        val payload = JSONObject().apply { put("tst", 1775308740L) }
        val manager = createNetworkManagerViaReflection()
        val result = manager.resolveUrlVariables("https://s.com/%YEAR/%MONTH/%DAY/data", payload)
        assertEquals("https://s.com/2026/04/04/data", result)
    }

    @Test
    fun `resolveUrlVariables returns endpoint unchanged when no percent`() {
        val payload = JSONObject().apply { put("tst", 1775308740L) }
        val manager = createNetworkManagerViaReflection()
        val result = manager.resolveUrlVariables("https://server.com/api", payload)
        assertEquals("https://server.com/api", result)
    }

    // --- Reflection helpers to access private methods ---

    private fun invokeBuildQueryString(payload: JSONObject): String {
        val method = NetworkManager::class.java.getDeclaredMethod("buildQueryString", JSONObject::class.java)
        method.isAccessible = true
        val manager = createNetworkManagerViaReflection()
        return method.invoke(manager, payload) as String
    }

    private fun createNetworkManagerViaReflection(): NetworkManager {
        val constructor = NetworkManager::class.java.getDeclaredConstructors().first()
        constructor.isAccessible = true
        val context = io.mockk.mockk<android.content.Context>(relaxed = true)
        val connectivityManager = io.mockk.mockk<android.net.ConnectivityManager>(relaxed = true)
        io.mockk.every {
            context.getSystemService(android.content.Context.CONNECTIVITY_SERVICE)
        } returns connectivityManager
        return constructor.newInstance(context) as NetworkManager
    }
}
