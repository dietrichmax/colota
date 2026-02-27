/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.Colota.data.DatabaseHelper
import com.Colota.util.AppLogger
import io.mockk.*
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import kotlin.coroutines.Continuation

/**
 * Tests for LocationBootReceiver:
 * - onReceive action filtering (null, unknown, valid boot actions)
 * - handleBootCompleted logic (tracking disabled/enabled, DB not ready, SecurityException)
 * - waitForDatabaseReady retry logic
 */
@OptIn(ExperimentalCoroutinesApi::class)
class LocationBootReceiverTest {

    private lateinit var receiver: LocationBootReceiver
    private lateinit var mockContext: Context
    private lateinit var mockDbHelper: DatabaseHelper

    @Before
    fun setUp() {
        receiver = LocationBootReceiver()
        mockContext = mockk(relaxed = true)
        mockDbHelper = mockk(relaxed = true)

        mockkObject(DatabaseHelper.Companion)
        every { DatabaseHelper.getInstance(any()) } returns mockDbHelper

        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
        unmockkObject(DatabaseHelper.Companion)
    }

    // ========================================================================
    // onReceive — action filtering
    // ========================================================================

    @Test
    fun `onReceive ignores null action`() {
        val spy = spyk(receiver)
        val intent = mockk<Intent> { every { action } returns null }
        spy.onReceive(mockContext, intent)
        verify(exactly = 0) { spy.goAsync() }
    }

    @Test
    fun `onReceive ignores unknown action`() {
        val spy = spyk(receiver)
        val intent = mockk<Intent> { every { action } returns "com.example.RANDOM_ACTION" }
        spy.onReceive(mockContext, intent)
        verify(exactly = 0) { spy.goAsync() }
    }

    @Test
    fun `onReceive calls goAsync for ACTION_BOOT_COMPLETED`() {
        val spy = spyk(receiver)
        val pendingResult = mockk<BroadcastReceiver.PendingResult>(relaxed = true)
        every { spy.goAsync() } returns pendingResult
        every { mockContext.applicationContext } returns mockContext
        mockDbReadyAndDisabled()

        val intent = mockk<Intent> { every { action } returns Intent.ACTION_BOOT_COMPLETED }
        spy.onReceive(mockContext, intent)
        Thread.sleep(500)

        verify { spy.goAsync() }
        verify { pendingResult.finish() }
    }

    @Test
    fun `onReceive always calls finish even on error`() {
        val spy = spyk(receiver)
        val pendingResult = mockk<BroadcastReceiver.PendingResult>(relaxed = true)
        every { spy.goAsync() } returns pendingResult
        every { mockContext.applicationContext } returns mockContext
        every { DatabaseHelper.getInstance(any()) } throws RuntimeException("DB init failed")

        val intent = mockk<Intent> { every { action } returns Intent.ACTION_BOOT_COMPLETED }
        spy.onReceive(mockContext, intent)
        Thread.sleep(500)

        verify { pendingResult.finish() }
    }

    // ========================================================================
    // handleBootCompleted
    // ========================================================================

    @Test
    fun `handleBootCompleted skips when tracking disabled`() = runTest {
        mockDbReadyAndDisabled()

        callHandleBootCompleted(mockContext, Intent.ACTION_BOOT_COMPLETED)

        verify(exactly = 0) { mockContext.startService(any()) }
        verify(exactly = 0) { mockContext.startForegroundService(any()) }
    }

    @Test
    fun `handleBootCompleted starts service when tracking enabled`() = runTest {
        mockDbReadyAndEnabled()

        callHandleBootCompleted(mockContext, Intent.ACTION_BOOT_COMPLETED)

        verify { mockContext.startForegroundService(any()) }
    }

    @Test
    fun `handleBootCompleted loads config from database`() = runTest {
        mockDbReadyAndEnabled()

        callHandleBootCompleted(mockContext, Intent.ACTION_BOOT_COMPLETED)

        verify { mockDbHelper.getAllSettings() }
    }

    @Test
    fun `handleBootCompleted handles SecurityException gracefully`() = runTest {
        mockDbReadyAndEnabled()
        every { mockContext.startForegroundService(any()) } throws SecurityException("Permission denied")

        // Should not throw
        callHandleBootCompleted(mockContext, Intent.ACTION_BOOT_COMPLETED)
    }

    @Test
    fun `handleBootCompleted skips when database not ready`() = runTest {
        every { mockDbHelper.getSetting("tracking_enabled") } throws RuntimeException("DB locked")

        callHandleBootCompleted(mockContext, Intent.ACTION_BOOT_COMPLETED)

        verify(exactly = 0) { mockContext.startService(any()) }
        verify(exactly = 0) { mockContext.startForegroundService(any()) }
    }

    @Test
    fun `handleBootCompleted does not start service when tracking setting is missing`() = runTest {
        every { mockDbHelper.getSetting("tracking_enabled") } returns null
        every { mockDbHelper.getSetting("tracking_enabled", "false") } returns "false"

        callHandleBootCompleted(mockContext, Intent.ACTION_BOOT_COMPLETED)

        verify(exactly = 0) { mockContext.startService(any()) }
    }

    // ========================================================================
    // waitForDatabaseReady
    // ========================================================================

    @Test
    fun `waitForDatabaseReady returns true when db accessible`() = runTest {
        every { mockDbHelper.getSetting("tracking_enabled") } returns "true"

        assertTrue(callWaitForDatabaseReady(mockDbHelper))
    }

    @Test
    fun `waitForDatabaseReady returns false after max retries`() = runTest {
        every { mockDbHelper.getSetting("tracking_enabled") } throws RuntimeException("DB locked")

        assertFalse(callWaitForDatabaseReady(mockDbHelper))
        // Should have been called 3 times (MAX_DB_RETRIES)
        verify(exactly = 3) { mockDbHelper.getSetting("tracking_enabled") }
    }

    @Test
    fun `waitForDatabaseReady retries on failure then succeeds`() = runTest {
        var callCount = 0
        every { mockDbHelper.getSetting("tracking_enabled") } answers {
            callCount++
            if (callCount < 3) throw RuntimeException("DB locked")
            "true"
        }

        assertTrue(callWaitForDatabaseReady(mockDbHelper))
        assertEquals(3, callCount)
    }

    @Test
    fun `waitForDatabaseReady succeeds on first attempt without retrying`() = runTest {
        every { mockDbHelper.getSetting("tracking_enabled") } returns "false"

        assertTrue(callWaitForDatabaseReady(mockDbHelper))
        verify(exactly = 1) { mockDbHelper.getSetting("tracking_enabled") }
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private fun mockDbReadyAndDisabled() {
        every { mockDbHelper.getSetting("tracking_enabled") } returns "false"
        every { mockDbHelper.getSetting("tracking_enabled", "false") } returns "false"
    }

    private fun mockDbReadyAndEnabled() {
        every { mockDbHelper.getSetting("tracking_enabled") } returns "true"
        every { mockDbHelper.getSetting("tracking_enabled", "false") } returns "true"
        every { mockDbHelper.getAllSettings() } returns mapOf(
            "tracking_enabled" to "true",
            "endpoint" to "https://example.com",
            "interval" to "5000"
        )
    }

    /**
     * Invokes the private suspend function handleBootCompleted via Java reflection.
     * Uses a blocking continuation since the function completes synchronously
     * when mocks don't introduce real delays.
     */
    @Suppress("UNCHECKED_CAST")
    private suspend fun callHandleBootCompleted(context: Context, action: String) {
        val method = LocationBootReceiver::class.java.getDeclaredMethod(
            "handleBootCompleted",
            Context::class.java,
            String::class.java,
            Continuation::class.java
        )
        method.isAccessible = true

        kotlin.coroutines.intrinsics.suspendCoroutineUninterceptedOrReturn<Unit> { cont ->
            method.invoke(receiver, context, action, cont)
        }
    }

    @Suppress("UNCHECKED_CAST")
    private suspend fun callWaitForDatabaseReady(dbHelper: DatabaseHelper): Boolean {
        val method = LocationBootReceiver::class.java.getDeclaredMethod(
            "waitForDatabaseReady",
            DatabaseHelper::class.java,
            Continuation::class.java
        )
        method.isAccessible = true

        return kotlin.coroutines.intrinsics.suspendCoroutineUninterceptedOrReturn<Boolean> { cont ->
            method.invoke(receiver, dbHelper, cont)
        }
    }
}
