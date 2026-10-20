package com.Colota.sync

import com.Colota.bridge.LocationServiceModule
import com.Colota.data.DatabaseHelper
import com.Colota.data.QueuedLocation
import com.Colota.sync.ApiFormat
import com.Colota.util.AppLogger
import io.mockk.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import com.Colota.sync.http.NetworkManager
import com.Colota.sync.http.BatchResult
import com.Colota.network.NetworkMonitor

@OptIn(ExperimentalCoroutinesApi::class)
class SyncManagerTest {

    private lateinit var dbHelper: DatabaseHelper
    private lateinit var networkManager: NetworkManager
    private lateinit var networkMonitor: NetworkMonitor
    private lateinit var scope: TestScope
    private lateinit var syncManager: SyncManager

    @Before
    fun setUp() {
        dbHelper = mockk(relaxed = true)
        networkManager = mockk(relaxed = true)
        networkMonitor = mockk(relaxed = true)
        scope = TestScope(UnconfinedTestDispatcher())
        SyncState.reset()
        syncManager = SyncManager(dbHelper, networkManager, networkMonitor, scope)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns BatchResult.NetworkError

        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
        SyncState.reset()
        scope.cancel()
    }

    // --- queueAndSend: offline / no endpoint ---

    @Test
    fun `queueAndSend skips queue and send in offline mode`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = true,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        val payload = JSONObject().put("lat", 52.0)
        syncManager.queueAndSend(1L, payload)

        verify(exactly = 0) { dbHelper.addToQueue(any(), any()) }
        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
    }

    @Test
    fun `queueAndSend adds to queue when endpoint is blank`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns BatchResult.Success

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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns BatchResult.ServerError(500)

        val payload = JSONObject().put("lat", 52.0)
        syncManager.queueAndSend(1L, payload)

        verify { dbHelper.incrementRetryCount(42L, "5xx: 500") }
        verify(exactly = 0) { dbHelper.removeFromQueueByLocationId(any()) }
    }

    @Test
    fun `queueAndSend instant mode skips send when no network`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns false

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
            isOfflineMode = false,
            syncCondition = "wifi_any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        every { networkMonitor.isUnmeteredConnection() } returns false

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
            isOfflineMode = false,
            syncCondition = "wifi_any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        every { networkMonitor.isUnmeteredConnection() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns BatchResult.Success

        val payload = JSONObject().put("lat", 52.0)
        syncManager.queueAndSend(1L, payload)

        coVerify { networkManager.sendToEndpoint(any(), "https://example.com", any(), any()) }
    }

    // --- queueAndSend: Wi-Fi SSID ---

    @Test
    fun `queueAndSend skips send when wifi_ssid and wrong SSID`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "wifi_ssid",
            syncSsid = "HomeNetwork",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        every { networkMonitor.isConnectedToSsid("HomeNetwork") } returns false

        val payload = JSONObject().put("lat", 52.0)
        syncManager.queueAndSend(1L, payload)

        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
    }

    @Test
    fun `queueAndSend sends when wifi_ssid and matching SSID`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "wifi_ssid",
            syncSsid = "HomeNetwork",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        every { networkMonitor.isConnectedToSsid("HomeNetwork") } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns BatchResult.Success

        val payload = JSONObject().put("lat", 52.0)
        syncManager.queueAndSend(1L, payload)

        coVerify { networkManager.sendToEndpoint(any(), "https://example.com", any(), any()) }
    }

    // --- queueAndSend: VPN ---

    @Test
    fun `queueAndSend skips send when vpn condition and no VPN`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "vpn",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        every { networkMonitor.isVpnConnected() } returns false

        val payload = JSONObject().put("lat", 52.0)
        syncManager.queueAndSend(1L, payload)

        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
    }

    @Test
    fun `queueAndSend sends when vpn condition and VPN connected`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "vpn",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        every { networkMonitor.isVpnConnected() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns BatchResult.Success

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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true

        val payload = JSONObject().put("lat", 52.0)
        syncManager.queueAndSend(1L, payload)

        verify { dbHelper.addToQueue(1L, any()) }
        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
    }

    // --- queueAndSend: bypassInterval ---

    @Test
    fun `queueAndSend bypassInterval sends despite a periodic interval`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 900,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns BatchResult.Success

        val payload = JSONObject().put("lat", 52.0)
        syncManager.queueAndSend(1L, payload, bypassInterval = true)

        coVerify { networkManager.sendToEndpoint(any(), "https://example.com", emptyMap(), "POST") }
        verify { dbHelper.removeFromQueueByLocationId(1L) }
    }

    @Test
    fun `queueAndSend bypassInterval still honours the sync condition`() = scope.runTest {
        // bypassInterval covers the interval only, never the network the user chose
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 900,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "wifi_ssid",
            syncSsid = "HomeNetwork",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        every { networkMonitor.isConnectedToSsid("HomeNetwork") } returns false

        val payload = JSONObject().put("lat", 52.0)
        syncManager.queueAndSend(1L, payload, bypassInterval = true)

        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
        verify { dbHelper.addToQueue(1L, any()) }
    }

    @Test
    fun `queueAndSend bypassInterval leaves a failed send in the queue`() = scope.runTest {
        every { dbHelper.addToQueue(any(), any()) } returns 42L
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 900,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns BatchResult.ClientError(400)

        val payload = JSONObject().put("lat", 52.0)
        syncManager.queueAndSend(1L, payload, bypassInterval = true)

        verify { dbHelper.incrementRetryCount(42L, "4xx: 400") }
        verify(exactly = 0) { dbHelper.removeFromQueueByLocationId(any()) }
    }

    // --- queueAndSend: auth headers and HTTP method ---

    @Test
    fun `queueAndSend passes auth headers and http method`() = scope.runTest {
        val headers = mapOf("Authorization" to "Bearer tok123")
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = headers,
            httpMethod = "GET"
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns BatchResult.Success

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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns BatchResult.Success

        assertEquals(0L, syncManager.lastSuccessfulSyncTime)

        syncManager.queueAndSend(1L, JSONObject().put("lat", 52.0))

        assertTrue(syncManager.lastSuccessfulSyncTime > 0)
    }

    @Test
    fun `queueAndSend records the success where the bridge reads it and clears a stale error`() = scope.runTest {
        SyncState.reset()
        SyncState.recordError("HTTP 401 Unauthorized")
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )
        coEvery { networkMonitor.isNetworkAvailable() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns BatchResult.Success

        syncManager.queueAndSend(1L, JSONObject().put("lat", 52.0))

        assertEquals(syncManager.lastSuccessfulSyncTime, SyncState.lastSuccessTime)
        assertEquals("", SyncState.lastSyncError)
        SyncState.reset()
    }

    // --- manualFlush ---

    @Test
    fun `manualFlush does nothing when endpoint is blank`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        val queued = listOf(
            QueuedLocation(1L, 100L, """{"lat":52.0}""", 0)
        )
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(queued, emptyList())
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns BatchResult.Success

        syncManager.manualFlush()

        coVerify { networkManager.sendToEndpoint(any(), "https://example.com", any(), any()) }
        verify { dbHelper.removeBatchFromQueue(listOf(1L)) }
    }

    @Test
    fun `syncQueue stops fetching batches when all sends fail`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        val item = QueuedLocation(1L, 100L, """{"lat":52.0}""", 0)
        // A failed row stays at the head of the queue
        every { dbHelper.getQueuedLocations(50) } returns listOf(item)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns BatchResult.ClientError(400)

        syncManager.manualFlush()

        verify(exactly = 1) { dbHelper.getQueuedLocations(50) }
        coVerify(exactly = 1) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
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

    // --- Batch limit and chunks ---

    @Test
    fun `syncQueue stops processing after 10 batches`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        // The queue never empties, so only the batch cap ends the pass
        val item = QueuedLocation(1L, 100L, """{"lat":52.0}""", 0)
        every { dbHelper.getQueuedLocations(50) } returns listOf(item)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns BatchResult.Success

        syncManager.manualFlush()

        verify(exactly = 10) { dbHelper.getQueuedLocations(50) }
    }

    @Test
    fun `syncQueue sends all items across chunked groups`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        // Chunks of 10, 10 and 5
        val items = (1L..25L).map { QueuedLocation(it, it + 100, """{"lat":52.0}""", 0) }
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(items, emptyList())
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns BatchResult.Success

        syncManager.manualFlush()

        coVerify(exactly = 25) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
        verify(exactly = 3) { dbHelper.removeBatchFromQueue(any()) }
    }

    // --- Consecutive failures ---

    @Test
    fun `periodic sync increments consecutiveFailures on each failure`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 1,
            retryIntervalSeconds = 1,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        every { dbHelper.getQueuedCount() } returns 5
        // Rows are queued but none can be fetched, so the count never drops and every pass fails
        every { dbHelper.getQueuedLocations(50) } returns emptyList()

        syncManager.startPeriodicSync()

        // Two 1 s ticks, each followed by its backoff of 30 s and 60 s
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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        every { dbHelper.getQueuedCount() } returns 5
        every { dbHelper.getQueuedLocations(50) } returns emptyList()

        syncManager.startPeriodicSync()

        // The third tick lands at 31 + 61 + 1 s and its failure sends the error event
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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        every { dbHelper.getQueuedCount() } returns 5
        every { dbHelper.getQueuedLocations(50) } returns emptyList()

        syncManager.startPeriodicSync()

        // Two ticks; the error event needs a third
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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        // Simulate successful sync: queue count drops to 0 after processing
        var queuedCount = 3
        every { dbHelper.getQueuedCount() } answers { queuedCount }
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(
            listOf(QueuedLocation(1L, 100L, """{"lat":52.0}""", 0)),
            emptyList()
        )
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns BatchResult.Success
        every { dbHelper.removeBatchFromQueue(any()) } answers { queuedCount = 0 }

        syncManager.startPeriodicSync()
        advanceTimeBy(2_000)

        assertEquals(0, getField("consecutiveFailures"))
        syncManager.stopPeriodicSync()
    }

    // --- Periodic sync ---

    @Test
    fun `startPeriodicSync triggers sync at configured interval`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 60,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        var queuedCount = 3
        every { dbHelper.getQueuedCount() } answers { queuedCount }
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(
            listOf(QueuedLocation(1L, 100L, """{"lat":52.0}""", 0)),
            emptyList()
        )
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns BatchResult.Success
        every { dbHelper.removeBatchFromQueue(any()) } answers { queuedCount = 0 }

        syncManager.startPeriodicSync()

        advanceTimeBy(30_000)
        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any()) }

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
            isOfflineMode = true,
            syncCondition = "any",
            syncSsid = "",
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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns false
        every { dbHelper.getQueuedCount() } returns 5

        syncManager.startPeriodicSync()
        advanceTimeBy(5_000)

        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any()) }
        syncManager.stopPeriodicSync()
    }

    @Test
    fun `startPeriodicSync logs the tick the network gate swallows`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 1,
            retryIntervalSeconds = 1,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns false
        every { dbHelper.getQueuedCount() } returns 5

        syncManager.startPeriodicSync()
        advanceTimeBy(1_500)

        verify(atLeast = 1) { AppLogger.d("SyncManager", "Sync tick: queue=5 allowed=false") }
        syncManager.stopPeriodicSync()
    }

    @Test
    fun `startPeriodicSync logs an idle periodic tick so a missing line means the timer stalled`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 1,
            retryIntervalSeconds = 1,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        every { dbHelper.getQueuedCount() } returns 0

        syncManager.startPeriodicSync()
        advanceTimeBy(1_500)

        verify(atLeast = 1) { AppLogger.d("SyncManager", "Sync tick: queue=0 allowed=true") }
        syncManager.stopPeriodicSync()
    }

    @Test
    fun `startPeriodicSync stays silent on an idle instant-mode tick`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 1,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        every { dbHelper.getQueuedCount() } returns 0

        syncManager.startPeriodicSync()
        advanceTimeBy(65_000)

        verify(exactly = 0) { AppLogger.d("SyncManager", match { it.startsWith("Sync tick") }) }
        syncManager.stopPeriodicSync()
    }

    @Test
    fun `stopPeriodicSync prevents further syncs after cancellation`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 1,
            retryIntervalSeconds = 1,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        every { dbHelper.getQueuedCount() } returns 5
        every { dbHelper.getQueuedLocations(50) } returns emptyList()

        syncManager.startPeriodicSync()
        syncManager.stopPeriodicSync()

        advanceTimeBy(10_000)

        verify(exactly = 0) { dbHelper.getQueuedLocations(any()) }
    }

    // --- A profile switch changes the interval mid-wait ---

    private var ticks = 0

    private fun startPeriodicSyncOnVirtualClock(intervalSeconds: Int, queuedCount: Int = 0): SyncManager {
        val manager = SyncManager(dbHelper, networkManager, networkMonitor, scope, clock = { scope.testScheduler.currentTime })
        manager.switchInterval(intervalSeconds)
        coEvery { networkMonitor.isNetworkAvailable() } returns true
        every { dbHelper.getQueuedCount() } returns queuedCount
        every { dbHelper.getQueuedLocations(50) } returns emptyList()
        every { AppLogger.d("SyncManager", match { it.startsWith("Sync tick:") }) } answers { ticks += 1 }
        manager.startPeriodicSync()
        return manager
    }

    private fun SyncManager.switchInterval(seconds: Int) = updateConfig(
        endpoint = "https://example.com",
        syncIntervalSeconds = seconds,
        retryIntervalSeconds = 30,
        isOfflineMode = false,
        syncCondition = "any",
        syncSsid = "",
        authHeaders = emptyMap()
    )

    @Test
    fun `a shorter interval applies to the wait already running instead of after it`() = scope.runTest {
        val manager = startPeriodicSyncOnVirtualClock(300)

        advanceTimeBy(10_000)
        manager.switchInterval(60)

        advanceTimeBy(49_000)
        assertEquals("60 s from the start of the wait has not passed yet", 0, ticks)
        advanceTimeBy(2_000)
        assertEquals("the profile's 60 s is honoured, not the 300 s the wait began with", 1, ticks)
        advanceTimeBy(60_000)
        assertEquals("the new interval sets the cadence from then on", 2, ticks)
        manager.stopPeriodicSync()
    }

    @Test
    fun `a shorter interval already served by the running wait syncs at once`() = scope.runTest {
        val manager = startPeriodicSyncOnVirtualClock(300)

        advanceTimeBy(200_000)
        manager.switchInterval(60)
        runCurrent()

        assertEquals("200 s have passed, more than the new 60 s, so no further wait is owed", 1, ticks)
        advanceTimeBy(59_000)
        assertEquals(1, ticks)
        advanceTimeBy(2_000)
        assertEquals(2, ticks)
        manager.stopPeriodicSync()
    }

    @Test
    fun `a longer interval extends the wait already running`() = scope.runTest {
        val manager = startPeriodicSyncOnVirtualClock(60)

        advanceTimeBy(30_000)
        manager.switchInterval(300)

        advanceTimeBy(269_000)
        assertEquals("the old 60 s must not fire once more before the new interval takes over", 0, ticks)
        advanceTimeBy(2_000)
        assertEquals(1, ticks)
        manager.stopPeriodicSync()
    }

    @Test
    fun `an interval change during a backoff does not cut the backoff short`() = scope.runTest {
        val manager = startPeriodicSyncOnVirtualClock(10, queuedCount = 5)

        advanceTimeBy(20_000)
        verify(exactly = 1) { dbHelper.getQueuedLocations(50) }
        manager.switchInterval(5)

        advanceTimeBy(24_000)
        verify(exactly = 1) { dbHelper.getQueuedLocations(50) }
        advanceTimeBy(2_000)
        verify(exactly = 2) { dbHelper.getQueuedLocations(50) }
        manager.stopPeriodicSync()
    }

    // --- One corrupt row in a chunk ---

    @Test
    fun `syncQueue isolates exception in single item without cancelling chunk`() = scope.runTest {
        mockkObject(LocationServiceModule.Companion)
        every { LocationServiceModule.sendSyncErrorEvent(any(), any()) } returns true

        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        val corrupted = QueuedLocation(1L, 100L, "NOT_VALID_JSON", 0)
        val valid = QueuedLocation(2L, 101L, """{"lat":52.0}""", 0)
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(
            listOf(corrupted, valid),
            emptyList()
        )
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns BatchResult.Success

        syncManager.manualFlush()

        coVerify(atLeast = 1) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
        verify { dbHelper.incrementRetryCount(1L, "Corrupt payload") }
        verify { dbHelper.markLocationsSent(listOf(101L)) }

        unmockkObject(LocationServiceModule.Companion)
    }

    // --- apiFormat passthrough ---

    @Test
    fun `queueAndSend passes apiFormat to sendToEndpoint`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap(),
            httpMethod = "POST",
            apiFormat = ApiFormat.TRACCAR_JSON
        )

        coEvery { networkMonitor.isNetworkAvailable() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns BatchResult.Success

        syncManager.queueAndSend(1L, JSONObject().put("lat", 52.0))

        coVerify { networkManager.sendToEndpoint(any(), any(), any(), "POST", ApiFormat.TRACCAR_JSON) }
    }

    @Test
    fun `syncQueue passes apiFormat to sendToEndpoint during batch sync`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap(),
            httpMethod = "POST",
            apiFormat = ApiFormat.TRACCAR_JSON
        )

        val item = QueuedLocation(1L, 100L, """{"lat":52.0}""", 0)
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(listOf(item), emptyList())
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns BatchResult.Success

        syncManager.manualFlush()

        coVerify { networkManager.sendToEndpoint(any(), any(), any(), "POST", ApiFormat.TRACCAR_JSON) }
    }

    // --- Overland batch path ---

    @Test
    fun `batch path uses overlandBatchSize for the fetch limit`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://dawarich.example/api/v1/overland/batches",
            syncIntervalSeconds = 300,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap(),
            apiFormat = ApiFormat.OVERLAND_BATCH,
            overlandBatchSize = 200
        )

        every { dbHelper.getQueuedLocations(any()) } returns emptyList()

        syncManager.manualFlush()

        verify { dbHelper.getQueuedLocations(200) }
    }

    /** Sync Now gives up after a silence, and a fully rejected batch of 50 takes about 100 requests to bisect. */
    @Test
    fun `a bisect reports each finished piece, so Sync Now hears from a long split`() = scope.runTest {
        mockkObject(LocationServiceModule.Companion)
        every { LocationServiceModule.sendSyncProgressEvent(any(), any(), any(), any(), any()) } returns true
        syncManager.updateConfig(
            endpoint = "https://dawarich.example/api/v1/overland/batches",
            syncIntervalSeconds = 300,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap(),
            apiFormat = ApiFormat.OVERLAND_BATCH,
            overlandBatchSize = 50
        )
        val items = (1L..4L).map { QueuedLocation(it, it + 100, """{"lat":52.0,"lon":13.0,"tst":1700000000}""", 0) }
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(items, emptyList())
        every { dbHelper.getQueuedCount() } returns 4
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } answers {
            if (firstArg<List<JSONObject>>().size > 1) BatchResult.ClientError(400) else BatchResult.Success
        }

        try {
            syncManager.manualFlush()

            verifyOrder {
                LocationServiceModule.sendSyncProgressEvent(1, 0, 4)
                LocationServiceModule.sendSyncProgressEvent(2, 0, 4)
                LocationServiceModule.sendSyncProgressEvent(3, 0, 4)
                LocationServiceModule.sendSyncProgressEvent(4, 0, 4)
            }
        } finally {
            unmockkObject(LocationServiceModule.Companion)
        }
    }

    // --- One sender at a time ---

    @Test
    fun `a manual flush during another waits instead of posting the same rows again`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )
        fakeQueue(20)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } coAnswers { delay(1_000); BatchResult.Success }

        launch { syncManager.manualFlush() }
        launch { syncManager.manualFlush() }
        advanceUntilIdle()

        // Both passes fetch the oldest rows first, so a second pass beside the first posts every row twice
        coVerify(exactly = 20) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `a periodic tick during a manual flush waits and counts no failure`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 1,
            retryIntervalSeconds = 1,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )
        coEvery { networkMonitor.isNetworkAvailable() } returns true
        fakeQueue(20)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } coAnswers { delay(1_500); BatchResult.Success }

        launch { syncManager.manualFlush() }
        syncManager.startPeriodicSync()
        // The ticks at 1 s and 2 s land while the flush still holds its chunks
        advanceTimeBy(3_600)
        syncManager.stopPeriodicSync()

        coVerify(exactly = 20) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
        assertEquals(0, getField("consecutiveFailures"))
    }

    @Test
    fun `an instant send during a pass is posted once, by the pass`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )
        coEvery { networkMonitor.isNetworkAvailable() } returns true
        fakeQueue(10)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } coAnswers { delay(1_000); BatchResult.Success }

        launch { syncManager.manualFlush() }
        syncManager.queueAndSend(500L, JSONObject().put("lat", 53.0))
        advanceUntilIdle()

        coVerify(exactly = 1) {
            networkManager.sendToEndpoint(match { it.optDouble("lat") == 53.0 }, any(), any(), any(), any())
        }
        verify(exactly = 0) { dbHelper.removeFromQueueByLocationId(500L) }
    }

    @Test
    fun `a manual flush reports progress after a chunk that sent nothing`() = scope.runTest {
        mockkObject(LocationServiceModule.Companion)
        every { LocationServiceModule.sendSyncProgressEvent(any(), any(), any(), any()) } returns true
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )
        fakeQueue(10)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns BatchResult.NetworkError

        syncManager.manualFlush()

        // Sync Now frees its button after a silence, so a pass that only fails must still report
        verify { LocationServiceModule.sendSyncProgressEvent(0, 10, 10, null) }

        unmockkObject(LocationServiceModule.Companion)
    }

    @Test
    fun `batch path reports progress after a batch that sent nothing`() = scope.runTest {
        mockkObject(LocationServiceModule.Companion)
        every { LocationServiceModule.sendSyncProgressEvent(any(), any(), any(), any()) } returns true
        syncManager.updateConfig(
            endpoint = "https://dawarich.example/api/v1/overland/batches",
            syncIntervalSeconds = 300,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap(),
            apiFormat = ApiFormat.OVERLAND_BATCH,
            overlandBatchSize = 50
        )
        val items = (1L..50L).map {
            QueuedLocation(it, it + 100, """{"lat":52.0,"lon":13.0,"tst":1700000000}""", 0)
        }
        every { dbHelper.getQueuedLocations(50) } returns items
        every { dbHelper.getQueuedCount() } returns 50
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } returns BatchResult.NetworkError

        syncManager.manualFlush()

        // Sync Now frees its button after a silence, so a batch that only fails must still report
        verify { LocationServiceModule.sendSyncProgressEvent(0, 50, 50, null) }

        unmockkObject(LocationServiceModule.Companion)
    }

    @Test
    fun `a manual flush waiting on a periodic pass hears that pass report`() = scope.runTest {
        mockkObject(LocationServiceModule.Companion)
        every { LocationServiceModule.sendSyncProgressEvent(any(), any(), any(), any()) } returns true
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 1,
            retryIntervalSeconds = 1,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )
        coEvery { networkMonitor.isNetworkAvailable() } returns true
        fakeQueue(20)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } coAnswers { delay(1_500); BatchResult.Success }

        syncManager.startPeriodicSync()
        advanceTimeBy(1_200)
        launch { syncManager.manualFlush() }
        advanceTimeBy(1_400)

        // The periodic pass has no screen of its own, but the waiting flush does and would give up on silence
        verify { LocationServiceModule.sendSyncProgressEvent(10, 0, 20, null) }
        // Only the periodic pass has posted so far, so the event can only be its report
        coVerify(exactly = 20) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }

        syncManager.stopPeriodicSync()
        unmockkObject(LocationServiceModule.Companion)
    }

    @Test
    fun `a slow instant send does not hold back the next fix`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )
        coEvery { networkMonitor.isNetworkAvailable() } returns true
        fakeQueue(0)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } coAnswers { delay(5_000); BatchResult.Success }

        launch { syncManager.queueAndSend(1L, JSONObject().put("lat", 1.0)) }
        advanceTimeBy(1_000)
        launch { syncManager.queueAndSend(2L, JSONObject().put("lat", 2.0)) }
        advanceTimeBy(100)

        // Two instant sends never carry the same row, so serialising them would buy nothing
        coVerify(exactly = 1) {
            networkManager.sendToEndpoint(match { it.optDouble("lat") == 2.0 }, any(), any(), any(), any())
        }
    }

    @Test
    fun `a manual flush started during an instant send does not post that row again`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )
        coEvery { networkMonitor.isNetworkAvailable() } returns true
        fakeQueue(0)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } coAnswers { delay(1_000); BatchResult.Success }

        launch { syncManager.queueAndSend(500L, JSONObject().put("lat", 53.0), bypassInterval = true) }
        launch { syncManager.manualFlush() }
        advanceUntilIdle()

        // Zone entry starts both together, and the flush fetches the heartbeat row the instant send is posting
        coVerify(exactly = 1) {
            networkManager.sendToEndpoint(match { it.optDouble("lat") == 53.0 }, any(), any(), any(), any())
        }
    }

    @Test
    fun `a manual flush cancelled while it waits still sends its ending event`() = scope.runTest {
        mockkObject(LocationServiceModule.Companion)
        every { LocationServiceModule.sendSyncProgressEvent(any(), any(), any(), any()) } returns true
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )
        fakeQueue(20)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } coAnswers { delay(1_500); BatchResult.Success }

        launch { syncManager.manualFlush() }
        val waiting = launch { syncManager.manualFlush() }
        advanceTimeBy(100)
        waiting.cancel()
        advanceTimeBy(100)

        // Sync Now waits for this event, so a flush stopped before it got the lock must still send one
        verify { LocationServiceModule.sendSyncProgressEvent(0, 0, 0, 20) }

        advanceUntilIdle()
        unmockkObject(LocationServiceModule.Companion)
    }

    @Test
    fun `a tick that finds only a row an instant send is posting counts no failure`() = scope.runTest {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 1,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )
        coEvery { networkMonitor.isNetworkAvailable() } returns true
        fakeQueue(0)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } coAnswers { delay(3_000); BatchResult.Success }

        launch { syncManager.queueAndSend(500L, JSONObject().put("lat", 53.0)) }
        syncManager.startPeriodicSync()
        advanceTimeBy(1_500)
        syncManager.stopPeriodicSync()

        assertEquals(0, getField("consecutiveFailures"))
        coVerify(exactly = 1) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
    }

    // --- What a failed send tells the pass ---

    private fun configurePerItem() {
        syncManager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap()
        )
    }

    /** A dead host fails every row the same way, so one chunk is enough to know it. */
    @Test
    fun `an unreachable server costs one chunk, not a whole batch`() = scope.runTest {
        configurePerItem()
        fakeQueue(50)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns BatchResult.NetworkError

        syncManager.manualFlush()

        coVerify(exactly = 10) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
        verify(exactly = 0) { dbHelper.incrementRetryCount(any(), any()) }
    }

    /** A flaky link still delivers, so a chunk that got rows through keeps the pass going. */
    @Test
    fun `a chunk that gets some rows through keeps going`() = scope.runTest {
        configurePerItem()
        fakeQueue(20)
        var calls = 0
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } coAnswers {
            if (calls++ % 2 == 0) BatchResult.Success else BatchResult.NetworkError
        }

        syncManager.manualFlush()

        coVerify(atLeast = 20) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
        verify(exactly = 0) { dbHelper.incrementRetryCount(any(), any()) }
    }

    @Test
    fun `a chunk with a server error keeps going while rows get through`() = scope.runTest {
        configurePerItem()
        fakeQueue(20)
        var calls = 0
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } coAnswers {
            if (calls++ % 2 == 0) BatchResult.Success else BatchResult.ServerError(500)
        }

        syncManager.manualFlush()

        coVerify(atLeast = 20) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `a chunk of server errors with nothing sent ends the pass`() = scope.runTest {
        configurePerItem()
        fakeQueue(50)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns BatchResult.ServerError(500)

        syncManager.manualFlush()

        coVerify(exactly = 10) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
        verify(exactly = 10) { dbHelper.incrementRetryCount(any(), "5xx: 500") }
    }

    /** A 502 to 504 is the proxy saying the app behind it is down, which says nothing about the row. */
    @Test
    fun `a gateway outage keeps the rows in place`() = scope.runTest {
        configurePerItem()
        fakeQueue(50)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns BatchResult.ServerError(503)

        syncManager.manualFlush()

        coVerify(exactly = 10) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
        verify(exactly = 0) { dbHelper.incrementRetryCount(any(), any()) }
    }

    /** A row kept in place stays at the head of the queue, so each later fetch in the pass would post it again. */
    @Test
    fun `a row that failed in transport is not posted again in the same pass`() = scope.runTest {
        configurePerItem()
        fakeQueue(15)
        var calls = 0
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } coAnswers {
            if (++calls == 1) BatchResult.NetworkError else BatchResult.Success
        }

        syncManager.manualFlush()

        coVerify(exactly = 15) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
    }

    /** One rejected row must not stall the good rows behind it. */
    @Test
    fun `rejected rows do not stop the rows behind them`() = scope.runTest {
        configurePerItem()
        fakeQueue(20)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns BatchResult.ClientError(400)

        syncManager.manualFlush()

        coVerify(exactly = 20) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
        verify(exactly = 20) { dbHelper.incrementRetryCount(any(), "4xx: 400") }
    }

    /** A 429 asks the client to slow down, so nothing more goes out in this pass. */
    @Test
    fun `a rate limit ends the pass after the chunk that hit it`() = scope.runTest {
        configurePerItem()
        fakeQueue(50)
        var calls = 0
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } coAnswers {
            if (++calls == 3) BatchResult.RateLimited(30) else BatchResult.Success
        }

        syncManager.manualFlush()

        coVerify(exactly = 10) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
        verify { dbHelper.markLocationsSent(match { it.size == 9 }) }
        verify(exactly = 0) { dbHelper.incrementRetryCount(any(), any()) }
    }

    /** An outage is the server's fault, so the row keeps its place and points reach the server in order. */
    @Test
    fun `an instant send that cannot connect keeps its place in the queue`() = scope.runTest {
        configurePerItem()
        every { dbHelper.addToQueue(any(), any()) } returns 42L
        coEvery { networkMonitor.isNetworkAvailable() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns BatchResult.NetworkError

        syncManager.queueAndSend(1L, JSONObject().put("lat", 52.0))

        coVerify(exactly = 1) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
        verify(exactly = 0) { dbHelper.incrementRetryCount(any(), any()) }
        verify(exactly = 0) { dbHelper.removeFromQueueByLocationId(any()) }
    }

    // --- The wait a 429 asks for ---

    private var now = 0L

    private fun rateLimitedManager(apiFormat: ApiFormat = ApiFormat.FIELD_MAPPED): SyncManager {
        val manager = SyncManager(dbHelper, networkManager, networkMonitor, scope, clock = { now })
        manager.updateConfig(
            endpoint = "https://example.com",
            syncIntervalSeconds = 0,
            retryIntervalSeconds = 30,
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
            authHeaders = emptyMap(),
            apiFormat = apiFormat
        )
        coEvery { networkMonitor.isNetworkAvailable() } returns true
        return manager
    }

    @Test
    fun `a flush inside the Retry-After wait sends nothing, and the next one after it does`() = scope.runTest {
        val manager = rateLimitedManager()
        fakeQueue(5)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns BatchResult.RateLimited(30)
        manager.manualFlush()
        clearMocks(networkManager, answers = false)

        now += 29_000
        manager.manualFlush()
        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }

        now += 2_000
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns BatchResult.Success
        manager.manualFlush()
        coVerify(exactly = 5) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `a 429 without Retry-After waits 60 s`() = scope.runTest {
        val manager = rateLimitedManager()
        fakeQueue(1)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns BatchResult.RateLimited(null)

        manager.manualFlush()

        assertEquals(60L, manager.rateLimitWaitSeconds())
    }

    @Test
    fun `a flush that ends rate limited tells the screen how long to wait`() = scope.runTest {
        mockkObject(LocationServiceModule)
        every { LocationServiceModule.sendSyncProgressEvent(any(), any(), any(), any(), any()) } returns true
        val manager = rateLimitedManager()
        fakeQueue(1)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns BatchResult.RateLimited(45)

        try {
            manager.manualFlush()

            verify { LocationServiceModule.sendSyncProgressEvent(0, 1, 1, 1, 45L) }
        } finally {
            unmockkObject(LocationServiceModule)
        }
    }

    @Test
    fun `a flush skipped inside the wait still ends the screen's pass and says how long is left`() = scope.runTest {
        mockkObject(LocationServiceModule)
        every { LocationServiceModule.sendSyncProgressEvent(any(), any(), any(), any(), any()) } returns true
        val manager = rateLimitedManager()
        fakeQueue(3)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns BatchResult.RateLimited(60)
        try {
            manager.manualFlush()
            now += 15_000
            manager.manualFlush()

            verify { LocationServiceModule.sendSyncProgressEvent(0, 0, 0, 3, 45L) }
        } finally {
            unmockkObject(LocationServiceModule)
        }
    }

    /** With tracking off every Sync now runs on a service that stops after it. */
    @Test
    fun `the wait outlives the SyncManager that met the 429`() = scope.runTest {
        fakeQueue(3)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns BatchResult.RateLimited(300)
        rateLimitedManager().manualFlush()
        clearMocks(networkManager, answers = false)

        rateLimitedManager().manualFlush()

        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `the longest Retry-After in a chunk sets the wait`() = scope.runTest {
        val manager = rateLimitedManager()
        fakeQueue(10)
        var calls = 0
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } coAnswers {
            when (++calls) {
                1 -> BatchResult.RateLimited(null)
                4 -> BatchResult.RateLimited(600)
                else -> BatchResult.Success
            }
        }

        manager.manualFlush()

        assertEquals(600L, manager.rateLimitWaitSeconds())
    }

    @Test
    fun `an instant send inside the wait stays queued without a request`() = scope.runTest {
        val manager = rateLimitedManager()
        fakeQueue(1)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns BatchResult.RateLimited(30)
        manager.queueAndSend(1L, JSONObject().put("lat", 52.0))
        clearMocks(networkManager, answers = false)

        manager.queueAndSend(2L, JSONObject().put("lat", 52.1))

        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
        verify(exactly = 0) { dbHelper.removeFromQueueByLocationId(any()) }
    }

    @Test
    fun `a batch 429 starts the wait too`() = scope.runTest {
        val manager = rateLimitedManager(ApiFormat.OVERLAND_BATCH)
        val items = (1L..3L).map { QueuedLocation(it, it + 100, """{"lat":52.0,"lon":13.0,"tst":1700000000}""", 0) }
        every { dbHelper.getQueuedLocations(50) } returns items
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } returns BatchResult.RateLimited(120)

        manager.manualFlush()
        manager.manualFlush()

        coVerify(exactly = 1) { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) }
        assertEquals(120L, manager.rateLimitWaitSeconds())
    }

    @Test
    fun `a periodic tick inside the wait sends nothing`() = scope.runTest {
        val manager = startPeriodicSyncOnVirtualClock(60, queuedCount = 5)
        fakeQueue(5)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns BatchResult.RateLimited(300)
        manager.manualFlush()
        clearMocks(networkManager, answers = false)

        advanceTimeBy(61_000)

        assertEquals("the tick itself still runs and logs", 1, ticks)
        coVerify(exactly = 0) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
        manager.stopPeriodicSync()
    }

    /** Rows leave only when a pass or an instant send removes them, so two senders running together see the same rows. */
    private fun fakeQueue(size: Int) {
        val queue = (1L..size.toLong()).map { QueuedLocation(it, it + 100, """{"lat":52.0}""", 0) }.toMutableList()
        var nextId = size.toLong()
        every { dbHelper.getQueuedLocations(50) } answers { queue.toList() }
        every { dbHelper.getQueuedCount() } answers { queue.size }
        every { dbHelper.addToQueue(any(), any()) } answers {
            nextId++
            queue.add(QueuedLocation(nextId, firstArg(), secondArg(), 0))
            nextId
        }
        every { dbHelper.removeBatchFromQueue(any()) } answers {
            val ids = firstArg<List<Long>>()
            queue.removeAll { it.queueId in ids }
        }
        every { dbHelper.removeFromQueueByLocationId(any()) } answers {
            val locationId = firstArg<Long>()
            val before = queue.size
            queue.removeAll { it.locationId == locationId }
            before - queue.size
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
