package com.Colota.sync

import com.Colota.data.DatabaseHelper
import com.Colota.data.QueuedLocation
import io.mockk.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

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
    }

    @After
    fun tearDown() {
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

    // --- stopPeriodicSync ---

    @Test
    fun `stopPeriodicSync cancels job`() {
        syncManager.startPeriodicSync()
        syncManager.stopPeriodicSync()
        // No exception means the job was cancelled cleanly
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
}
