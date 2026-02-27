package com.Colota.util

import android.content.SharedPreferences
import android.util.Base64
import io.mockk.*
import com.Colota.util.AppLogger
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Tests for SecureStorageHelper's auth header building logic.
 * Uses a mocked SharedPreferences to avoid EncryptedSharedPreferences Android dependency.
 */
class SecureStorageHelperTest {

    private lateinit var prefs: SharedPreferences
    private lateinit var helper: SecureStorageHelper

    @Before
    fun setUp() {
        prefs = mockk(relaxed = true)

        // Create instance via reflection to inject mocked prefs
        val constructor = SecureStorageHelper::class.java.getDeclaredConstructors().first()
        constructor.isAccessible = true

        // Use unsafe allocation to skip init block (which needs real Android context)
        val unsafeClass = Class.forName("sun.misc.Unsafe")
        val unsafeField = unsafeClass.getDeclaredField("theUnsafe")
        unsafeField.isAccessible = true
        val unsafe = unsafeField.get(null)
        val allocateMethod = unsafeClass.getMethod("allocateInstance", Class::class.java)
        helper = allocateMethod.invoke(unsafe, SecureStorageHelper::class.java) as SecureStorageHelper

        // Inject mocked prefs
        val prefsField = SecureStorageHelper::class.java.getDeclaredField("prefs")
        prefsField.isAccessible = true
        prefsField.set(helper, prefs)

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

    // --- getAuthHeaders: no auth ---

    @Test
    fun `getAuthHeaders returns empty map when auth type is none`() {
        every { prefs.getString("auth_type", "none") } returns "none"
        every { prefs.getString("custom_headers", null) } returns null

        val headers = helper.getAuthHeaders()
        assertTrue(headers.isEmpty())
    }

    @Test
    fun `getAuthHeaders returns empty map when auth type is null`() {
        every { prefs.getString("auth_type", "none") } returns null
        every { prefs.getString("custom_headers", null) } returns null

        val headers = helper.getAuthHeaders()
        assertTrue(headers.isEmpty())
    }

    // --- getAuthHeaders: basic auth ---

    @Test
    fun `getAuthHeaders builds basic auth header`() {
        every { prefs.getString("auth_type", "none") } returns "basic"
        every { prefs.getString("auth_username", "") } returns "user"
        every { prefs.getString("auth_password", "") } returns "pass"
        every { prefs.getString("custom_headers", null) } returns null

        // Mock Base64 encoding
        mockkStatic(Base64::class)
        every { Base64.encodeToString(any(), Base64.NO_WRAP) } answers {
            java.util.Base64.getEncoder().encodeToString(firstArg())
        }

        val headers = helper.getAuthHeaders()

        assertTrue(headers.containsKey("Authorization"))
        val expected = "Basic " + java.util.Base64.getEncoder().encodeToString("user:pass".toByteArray())
        assertEquals(expected, headers["Authorization"])

        unmockkStatic(Base64::class)
    }

    @Test
    fun `getAuthHeaders skips basic auth when username is blank`() {
        every { prefs.getString("auth_type", "none") } returns "basic"
        every { prefs.getString("auth_username", "") } returns ""
        every { prefs.getString("auth_password", "") } returns "pass"
        every { prefs.getString("custom_headers", null) } returns null

        val headers = helper.getAuthHeaders()
        assertFalse(headers.containsKey("Authorization"))
    }

    @Test
    fun `getAuthHeaders includes basic auth with empty password`() {
        every { prefs.getString("auth_type", "none") } returns "basic"
        every { prefs.getString("auth_username", "") } returns "admin"
        every { prefs.getString("auth_password", "") } returns ""
        every { prefs.getString("custom_headers", null) } returns null

        mockkStatic(Base64::class)
        every { Base64.encodeToString(any(), Base64.NO_WRAP) } answers {
            java.util.Base64.getEncoder().encodeToString(firstArg())
        }

        val headers = helper.getAuthHeaders()
        assertTrue(headers.containsKey("Authorization"))
        assertTrue(headers["Authorization"]!!.startsWith("Basic "))

        unmockkStatic(Base64::class)
    }

    // --- getAuthHeaders: bearer token ---

    @Test
    fun `getAuthHeaders builds bearer token header`() {
        every { prefs.getString("auth_type", "none") } returns "bearer"
        every { prefs.getString("auth_bearer_token", "") } returns "my-jwt-token"
        every { prefs.getString("custom_headers", null) } returns null

        val headers = helper.getAuthHeaders()

        assertEquals("Bearer my-jwt-token", headers["Authorization"])
    }

    @Test
    fun `getAuthHeaders skips bearer when token is blank`() {
        every { prefs.getString("auth_type", "none") } returns "bearer"
        every { prefs.getString("auth_bearer_token", "") } returns ""
        every { prefs.getString("custom_headers", null) } returns null

        val headers = helper.getAuthHeaders()
        assertFalse(headers.containsKey("Authorization"))
    }

    @Test
    fun `getAuthHeaders skips bearer when token is null`() {
        every { prefs.getString("auth_type", "none") } returns "bearer"
        every { prefs.getString("auth_bearer_token", "") } returns null
        every { prefs.getString("custom_headers", null) } returns null

        val headers = helper.getAuthHeaders()
        assertFalse(headers.containsKey("Authorization"))
    }

    // --- getAuthHeaders: custom headers ---

    @Test
    fun `getAuthHeaders includes custom headers from JSON`() {
        every { prefs.getString("auth_type", "none") } returns "none"
        val customJson = JSONObject().apply {
            put("X-Custom", "value1")
            put("X-Another", "value2")
        }.toString()
        every { prefs.getString("custom_headers", null) } returns customJson

        val headers = helper.getAuthHeaders()

        assertEquals("value1", headers["X-Custom"])
        assertEquals("value2", headers["X-Another"])
    }

    @Test
    fun `getAuthHeaders skips blank custom header keys`() {
        every { prefs.getString("auth_type", "none") } returns "none"
        val customJson = JSONObject().apply {
            put("", "value1")
            put("X-Valid", "value2")
        }.toString()
        every { prefs.getString("custom_headers", null) } returns customJson

        val headers = helper.getAuthHeaders()

        assertFalse(headers.containsKey(""))
        assertEquals("value2", headers["X-Valid"])
    }

    @Test
    fun `getAuthHeaders skips blank custom header values`() {
        every { prefs.getString("auth_type", "none") } returns "none"
        val customJson = JSONObject().apply {
            put("X-Empty", "")
            put("X-Valid", "value")
        }.toString()
        every { prefs.getString("custom_headers", null) } returns customJson

        val headers = helper.getAuthHeaders()

        assertFalse(headers.containsKey("X-Empty"))
        assertEquals("value", headers["X-Valid"])
    }

    @Test
    fun `getAuthHeaders handles invalid custom headers JSON gracefully`() {
        every { prefs.getString("auth_type", "none") } returns "none"
        every { prefs.getString("custom_headers", null) } returns "not valid json"

        val headers = helper.getAuthHeaders()
        assertTrue(headers.isEmpty())
    }

    @Test
    fun `getAuthHeaders handles null custom headers`() {
        every { prefs.getString("auth_type", "none") } returns "none"
        every { prefs.getString("custom_headers", null) } returns null

        val headers = helper.getAuthHeaders()
        assertTrue(headers.isEmpty())
    }

    // --- getAuthHeaders: combined auth + custom headers ---

    @Test
    fun `getAuthHeaders combines bearer auth with custom headers`() {
        every { prefs.getString("auth_type", "none") } returns "bearer"
        every { prefs.getString("auth_bearer_token", "") } returns "tok123"
        val customJson = JSONObject().put("X-Custom", "val").toString()
        every { prefs.getString("custom_headers", null) } returns customJson

        val headers = helper.getAuthHeaders()

        assertEquals("Bearer tok123", headers["Authorization"])
        assertEquals("val", headers["X-Custom"])
        assertEquals(2, headers.size)
    }

    // --- Key constants ---

    @Test
    fun `key constants match expected values`() {
        assertEquals("auth_type", SecureStorageHelper.KEY_AUTH_TYPE)
        assertEquals("auth_username", SecureStorageHelper.KEY_USERNAME)
        assertEquals("auth_password", SecureStorageHelper.KEY_PASSWORD)
        assertEquals("auth_bearer_token", SecureStorageHelper.KEY_BEARER_TOKEN)
        assertEquals("custom_headers", SecureStorageHelper.KEY_CUSTOM_HEADERS)
    }
}
