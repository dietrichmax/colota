package com.Colota.sync

import com.Colota.bridge.LocationServiceModule
import com.Colota.data.DatabaseHelper
import com.Colota.data.QueuedLocation
import com.Colota.util.AppLogger
import io.mockk.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import kotlin.coroutines.Continuation

@OptIn(ExperimentalCoroutinesApi::class)
class SyncManagerTest {

    private lateinit var dbHelper: DatabaseHelper
    private lateinit var networkManager: NetworkManager
    private lateinit var scope: TestScope
    private lateinit var syncManager: SyncManager

    @Before
    fun setUp() {
        dbHelper = mockk(relaxed = true)
        networkManager = mockk(relaxed = true)
        scope = TestScope(UnconfinedTestDispatcher())
        syncManager = SyncManager(dbHelper, networkManager, scope)

        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
        scope.cancel()
    }

    // --- queueAndSend: offline / no endpoint ---

    @Test
    fun `queueAndSend adds to queue even in offline mode`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 5,
            isOfflineMode = true,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        val payload = JSONObject().put("lat", 52.0)
        syncManager.queueAndSend(1L, payload)

        verify { dbHelper.addToQueue(1L, any()) }
        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
    }

    @Test
    fun `queueAndSend adds to queue when endpoint is blank`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        val payload = JSONObject().put("lat", 52.0)
        syncManager.queueAndSend(1L, payload)

        verify { dbHelper.addToQueue(1L, any()) }
        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
    }

    // --- queueAndSend: instant mode ---

    @Test
    fun `queueAndSend instant mode sends immediately when network available`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        coEvery { networkManager.isNetworkAvailable() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns true

        val payload = JSONObject().put("lat", 52.0)
        syncManager.queueAndSend(1L, payload)

        coVerify { networkManager.sendToEndpoint(any(), "https://example.com", emptyMap(), "POST") }
        verify { dbHelper.removeFromQueueByLocationId(1L) }
    }

    @Test
    fun `queueAndSend instant mode increments retry on failure`() = scope.runTest {
        every { dbHelper.addToQueue(any(), any()) } returns 42L

        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        coEvery { networkManager.isNetworkAvailable() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns false

        val payload = JSONObject().put("lat", 52.0)
        syncManager.queueAndSend(1L, payload)

        verify { dbHelper.incrementRetryCount(42L, "Send failed") }
        verify(exactly = 0) { dbHelper.removeFromQueueByLocationId(any()) }
    }

    @Test
    fun `queueAndSend instant mode skips send when no network`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        coEvery { networkManager.isNetworkAvailable() } returns false

        val payload = JSONObject().put("lat", 52.0)
        syncManager.queueAndSend(1L, payload)

        verify { dbHelper.addToQueue(1L, any()) }
        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
    }

    // --- queueAndSend: Wi-Fi only ---

    @Test
    fun `queueAndSend skips send when wifi only and on metered`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = true,
            authHeaders = emptyMap()
        )

        coEvery { networkManager.isNetworkAvailable() } returns true
        every { networkManager.isUnmeteredConnection() } returns false

        val payload = JSONObject().put("lat", 52.0)
        syncManager.queueAndSend(1L, payload)

        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
    }

    @Test
    fun `queueAndSend sends when wifi only and on unmetered`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = true,
            authHeaders = emptyMap()
        )

        coEvery { networkManager.isNetworkAvailable() } returns true
        every { networkManager.isUnmeteredConnection() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns true

        val payload = JSONObject().put("lat", 52.0)
        syncManager.queueAndSend(1L, payload)

        coVerify { networkManager.sendToEndpoint(any(), "https://example.com", any(), any()) }
    }

    // --- queueAndSend: periodic mode ---

    @Test
    fun `queueAndSend periodic mode queues without immediate send`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 300,
            retryIntervalSeconds = 30,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        coEvery { networkManager.isNetworkAvailable() } returns true

        val payload = JSONObject().put("lat", 52.0)
        syncManager.queueAndSend(1L, payload)

        verify { dbHelper.addToQueue(1L, any()) }
        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
    }

    // --- queueAndSend: auth headers and HTTP method ---

    @Test
    fun `queueAndSend passes auth headers and http method`() = scope.runTest {
        val headers = mapOf("Authorization" to "Bearer tok123")
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = headers,
            httpMethod = "GET"
        )

        coEvery { networkManager.isNetworkAvailable() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns true

        syncManager.queueAndSend(1L, JSONObject().put("lat", 52.0))

        coVerify { networkManager.sendToEndpoint(any(), any(), headers, "GET") }
    }

    // --- queueAndSend: successful sync updates lastSuccessfulSyncTime ---

    @Test
    fun `queueAndSend sets lastSuccessfulSyncTime on success`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        coEvery { networkManager.isNetworkAvailable() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns true

        assertEquals(0L, syncManager.lastSuccessfulSyncTime)

        syncManager.queueAndSend(1L, JSONObject().put("lat", 52.0))

        assertTrue(syncManager.lastSuccessfulSyncTime > 0)
    }

    // --- manualFlush ---

    @Test
    fun `manualFlush does nothing when endpoint is blank`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        syncManager.manualFlush()

        verify(exactly = 0) { dbHelper.getQueuedLocations(any()) }
    }

    @Test
    fun `manualFlush processes queue when endpoint set`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        val queued = listOf(
            QueuedLocation(1L, 100L, """{"lat":52.0}""", 0)
        )
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(queued, emptyList())
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns true

        syncManager.manualFlush()

        coVerify { networkManager.sendToEndpoint(any(), "https://example.com", any(), any()) }
        verify { dbHelper.removeBatchFromQueue(listOf(1L)) }
    }

    // --- syncQueue: retry exhaustion ---

    @Test
    fun `syncQueue removes items exceeding maxRetries`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 3,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        val exceededItem = QueuedLocation(1L, 100L, """{"lat":52.0}""", 3)
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(listOf(exceededItem), emptyList())

        syncManager.manualFlush()

        // Item exceeded retries, should be removed without sending
        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
        verify { dbHelper.removeBatchFromQueue(listOf(1L)) }
    }

    @Test
    fun `syncQueue sends retriable items and removes exceeded ones in same batch`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        val retriable = QueuedLocation(1L, 100L, """{"lat":52.0}""", 0)
        val exceeded = QueuedLocation(2L, 101L, """{"lat":53.0}""", 5)
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(
            listOf(retriable, exceeded),
            emptyList()
        )
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns true

        syncManager.manualFlush()

        // Only the retriable item should be sent
        coVerify(exactly = 1) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
        // Both should be removed (one succeeded, one exceeded)
        verify { dbHelper.removeBatchFromQueue(match { it.containsAll(listOf(1L, 2L)) }) }
    }

    // --- syncQueue: maxRetries=0 (retry forever) ---

    @Test
    fun `syncQueue retries all items when maxRetries is 0`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 0,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        // Item with high retry count should still be sent, not treated as exceeded
        val item = QueuedLocation(1L, 100L, """{"lat":52.0}""", 99)
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(listOf(item), emptyList())
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns true

        syncManager.manualFlush()

        coVerify(exactly = 1) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
        verify { dbHelper.removeBatchFromQueue(listOf(1L)) }
        // Location should NOT be deleted (it was successfully sent)
        verify(exactly = 0) { dbHelper.deleteLocations(any()) }
    }

    @Test
    fun `syncQueue does not permanently fail items when maxRetries is 0`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 0,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        val item = QueuedLocation(1L, 100L, """{"lat":52.0}""", 50)
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(listOf(item), emptyList())
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns false

        syncManager.manualFlush()

        // Should increment retry count but NOT remove from queue or delete location
        verify { dbHelper.incrementRetryCount(1L, "Send failed") }
        verify(exactly = 0) { dbHelper.removeBatchFromQueue(any()) }
        verify(exactly = 0) { dbHelper.deleteLocations(any()) }
    }

    @Test
    fun `syncQueue stops fetching batches when all sends fail`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        val item = QueuedLocation(1L, 100L, """{"lat":52.0}""", 0)
        // Always return the same item (it stays in queue after failure)
        every { dbHelper.getQueuedLocations(50) } returns listOf(item)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns false

        syncManager.manualFlush()

        // Should only fetch ONE batch, not loop 10 times re-fetching the same failing item
        verify(exactly = 1) { dbHelper.getQueuedLocations(50) }
        coVerify(exactly = 1) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
    }

    @Test
    fun `syncQueue continues to next batch after cleaning up exceeded items`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 3,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        // Batch 1: only exceeded items (cleaned up, no sends)
        // Batch 2: fresh items that should be sent
        val exceeded = QueuedLocation(1L, 100L, """{"lat":52.0}""", 3)
        val fresh = QueuedLocation(2L, 101L, """{"lat":53.0}""", 0)
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(
            listOf(exceeded),
            listOf(fresh),
            emptyList()
        )
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns true

        syncManager.manualFlush()

        // Should process BOTH batches: clean up exceeded AND send fresh
        verify(exactly = 3) { dbHelper.getQueuedLocations(50) }
        coVerify(exactly = 1) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
        verify { dbHelper.removeBatchFromQueue(listOf(1L)) }
        verify { dbHelper.removeBatchFromQueue(listOf(2L)) }
    }

    // --- getCachedQueuedCount ---

    @Test
    fun `getCachedQueuedCount returns db count`() {
        every { dbHelper.getQueuedCount() } returns 42
        assertEquals(42, syncManager.getCachedQueuedCount())
    }

    @Test
    fun `invalidateQueueCache causes fresh db read`() {
        var callCount = 0
        every { dbHelper.getQueuedCount() } answers { callCount++; callCount * 10 }

        val first = syncManager.getCachedQueuedCount()
        assertEquals(10, first)

        syncManager.invalidateQueueCache()
        val second = syncManager.getCachedQueuedCount()
        assertEquals(20, second)
    }

    // ========================================================================
    // Exponential backoff (30s → 60s → 5min → 15min)
    // ========================================================================

    @Test
    fun `applyBackoffDelay waits 30s after 1 failure`() = scope.runTest {
        setField("consecutiveFailures", 1)
        val start = currentTime
        callApplyBackoffDelay()
        assertEquals(30_000L, currentTime - start)
    }

    @Test
    fun `applyBackoffDelay waits 60s after 2 failures`() = scope.runTest {
        setField("consecutiveFailures", 2)
        val start = currentTime
        callApplyBackoffDelay()
        assertEquals(60_000L, currentTime - start)
    }

    @Test
    fun `applyBackoffDelay waits 5min after 3 failures`() = scope.runTest {
        setField("consecutiveFailures", 3)
        val start = currentTime
        callApplyBackoffDelay()
        assertEquals(300_000L, currentTime - start)
    }

    @Test
    fun `applyBackoffDelay waits 15min after 4 or more failures`() = scope.runTest {
        setField("consecutiveFailures", 10)
        val start = currentTime
        callApplyBackoffDelay()
        assertEquals(900_000L, currentTime - start)
    }

    // ========================================================================
    // Batch processing limits and concurrent chunk sending
    // ========================================================================

    @Test
    fun `syncQueue stops processing after 10 batches`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        // Always return items - loop should still stop at batch 10
        val item = QueuedLocation(1L, 100L, """{"lat":52.0}""", 0)
        every { dbHelper.getQueuedLocations(50) } returns listOf(item)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns true

        syncManager.manualFlush()

        verify(exactly = 10) { dbHelper.getQueuedLocations(50) }
    }

    @Test
    fun `syncQueue sends all items across chunked groups`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        // 25 items → 3 chunks (10 + 10 + 5)
        val items = (1L..25L).map { QueuedLocation(it, it + 100, """{"lat":52.0}""", 0) }
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(items, emptyList())
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns true

        syncManager.manualFlush()

        coVerify(exactly = 25) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
        // 3 chunks → 3 removeBatchFromQueue calls
        verify(exactly = 3) { dbHelper.removeBatchFromQueue(any()) }
    }

    @Test
    fun `syncQueue deletes locations of permanently failed items`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            maxRetries = 3,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        val exceeded = QueuedLocation(1L, 100L, """{"lat":52.0}""", 3)
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(listOf(exceeded), emptyList())

        syncManager.manualFlush()

        verify { dbHelper.deleteLocations(listOf(100L)) }
    }

    // ========================================================================
    // Consecutive failure tracking (3+ failures → error event)
    // ========================================================================

    @Test
    fun `periodic sync increments consecutiveFailures on each failure`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 1,
            retryIntervalSeconds = 1,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        coEvery { networkManager.isNetworkAvailable() } returns true
        every { dbHelper.getQueuedCount() } returns 5
        // getQueuedLocations returns empty → performSyncAndCheckSuccess sees
        // countBefore=5, countAfter=5 → failure
        every { dbHelper.getQueuedLocations(50) } returns emptyList()

        syncManager.startPeriodicSync()

        // Advance past 2 full iterations:
        // iter 1: delay(1s) + sync + backoff(30s) = 31s
        // iter 2: delay(1s) + sync + backoff(60s) = 61s
        // Total to complete 2 iterations: ~92s
        advanceTimeBy(92_500)

        assertEquals(2, getField("consecutiveFailures"))
        syncManager.stopPeriodicSync()
    }

    @Test
    fun `periodic sync sends error event after 3 consecutive failures`() = scope.runTest {
        mockkObject(LocationServiceModule.Companion)
        every { LocationServiceModule.sendSyncErrorEvent(any(), any()) } returns true

        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 1,
            retryIntervalSeconds = 1,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        coEvery { networkManager.isNetworkAvailable() } returns true
        every { dbHelper.getQueuedCount() } returns 5
        every { dbHelper.getQueuedLocations(50) } returns emptyList()

        syncManager.startPeriodicSync()

        // Advance past 3 full iterations:
        // iter 1: delay(1s) + sync + backoff(30s) = 31s
        // iter 2: delay(1s) + sync + backoff(60s) = 61s
        // iter 3: delay(1s) + sync (error event fires here) + backoff(300s)
        // Need to reach iter 3's sync: 31 + 61 + 1 = 93s
        advanceTimeBy(93_500)

        verify(atLeast = 1) {
            LocationServiceModule.sendSyncErrorEvent(match { it.contains("3 consecutive") }, 5)
        }
        syncManager.stopPeriodicSync()
        unmockkObject(LocationServiceModule.Companion)
    }

    @Test
    fun `periodic sync does not send error event before 3 failures`() = scope.runTest {
        mockkObject(LocationServiceModule.Companion)
        every { LocationServiceModule.sendSyncErrorEvent(any(), any()) } returns true

        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 1,
            retryIntervalSeconds = 1,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        coEvery { networkManager.isNetworkAvailable() } returns true
        every { dbHelper.getQueuedCount() } returns 5
        every { dbHelper.getQueuedLocations(50) } returns emptyList()

        syncManager.startPeriodicSync()

        // Only advance through 2 iterations (before 3rd sync)
        advanceTimeBy(92_500)

        verify(exactly = 0) { LocationServiceModule.sendSyncErrorEvent(any(), any()) }
        syncManager.stopPeriodicSync()
        unmockkObject(LocationServiceModule.Companion)
    }

    @Test
    fun `periodic sync resets consecutiveFailures on success`() = scope.runTest {
        setField("consecutiveFailures", 5)

        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 1,
            retryIntervalSeconds = 1,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        coEvery { networkManager.isNetworkAvailable() } returns true
        // Simulate successful sync: queue count drops to 0 after processing
        var queuedCount = 3
        every { dbHelper.getQueuedCount() } answers { queuedCount }
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(
            listOf(QueuedLocation(1L, 100L, """{"lat":52.0}""", 0)),
            emptyList()
        )
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns true
        every { dbHelper.removeBatchFromQueue(any()) } answers { queuedCount = 0 }

        syncManager.startPeriodicSync()
        advanceTimeBy(2_000)

        assertEquals(0, getField("consecutiveFailures"))
        syncManager.stopPeriodicSync()
    }

    // ========================================================================
    // Periodic sync mode (job scheduling, lifecycle)
    // ========================================================================

    @Test
    fun `startPeriodicSync triggers sync at configured interval`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 60,
            retryIntervalSeconds = 30,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        coEvery { networkManager.isNetworkAvailable() } returns true
        var queuedCount = 3
        every { dbHelper.getQueuedCount() } answers { queuedCount }
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(
            listOf(QueuedLocation(1L, 100L, """{"lat":52.0}""", 0)),
            emptyList()
        )
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns true
        every { dbHelper.removeBatchFromQueue(any()) } answers { queuedCount = 0 }

        syncManager.startPeriodicSync()

        // Before interval elapses - no sync yet
        advanceTimeBy(30_000)
        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any()) }

        // After interval elapses - sync happens
        advanceTimeBy(31_000)
        coVerify(atLeast = 1) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
        syncManager.stopPeriodicSync()
    }

    @Test
    fun `startPeriodicSync skips sync when offline`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 1,
            retryIntervalSeconds = 1,
            maxRetries = 5,
            isOfflineMode = true,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        every { dbHelper.getQueuedCount() } returns 5

        syncManager.startPeriodicSync()
        advanceTimeBy(5_000)

        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
        syncManager.stopPeriodicSync()
    }

    @Test
    fun `startPeriodicSync skips sync when no network`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 1,
            retryIntervalSeconds = 1,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        coEvery { networkManager.isNetworkAvailable() } returns false
        every { dbHelper.getQueuedCount() } returns 5

        syncManager.startPeriodicSync()
        advanceTimeBy(5_000)

        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
        syncManager.stopPeriodicSync()
    }

    @Test
    fun `stopPeriodicSync prevents further syncs after cancellation`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 1,
            retryIntervalSeconds = 1,
            maxRetries = 5,
            isOfflineMode = false,
            isWifiOnlySync = false,
            authHeaders = emptyMap()
        )

        coEvery { networkManager.isNetworkAvailable() } returns true
        every { dbHelper.getQueuedCount() } returns 5
        every { dbHelper.getQueuedLocations(50) } returns emptyList()

        syncManager.startPeriodicSync()
        syncManager.stopPeriodicSync()

        advanceTimeBy(10_000)

        // No sync should have been attempted after cancellation
        verify(exactly = 0) { dbHelper.getQueuedLocations(any()) }
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    @Suppress("UNCHECKED_CAST")
    private suspend fun callApplyBackoffDelay() {
        val method = SyncManager::class.java.getDeclaredMethod(
            "applyBackoffDelay",
            Continuation::class.java
        )
        method.isAccessible = true
        kotlin.coroutines.intrinsics.suspendCoroutineUninterceptedOrReturn<Unit> { cont ->
            method.invoke(syncManager, cont)
        }
    }

    private fun setField(name: String, value: Any?) {
        val field = SyncManager::class.java.getDeclaredField(name)
        field.isAccessible = true
        field.set(syncManager, value)
    }

    private fun getField(name: String): Any? {
        val field = SyncManager::class.java.getDeclaredField(name)
        field.isAccessible = true
        return field.get(syncManager)
    }
}
