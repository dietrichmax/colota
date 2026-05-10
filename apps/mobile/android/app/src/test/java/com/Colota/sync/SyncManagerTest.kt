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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
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
            isOfflineMode = false,
            syncCondition = "wifi_any",
            syncSsid = "",
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
            isOfflineMode = false,
            syncCondition = "wifi_any",
            syncSsid = "",
            authHeaders = emptyMap()
        )

        coEvery { networkManager.isNetworkAvailable() } returns true
        every { networkManager.isUnmeteredConnection() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns true

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

        coEvery { networkManager.isNetworkAvailable() } returns true
        every { networkManager.isConnectedToSsid("HomeNetwork") } returns false

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

        coEvery { networkManager.isNetworkAvailable() } returns true
        every { networkManager.isConnectedToSsid("HomeNetwork") } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns true

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

        coEvery { networkManager.isNetworkAvailable() } returns true
        every { networkManager.isVpnConnected() } returns false

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

        coEvery { networkManager.isNetworkAvailable() } returns true
        every { networkManager.isVpnConnected() } returns true
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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
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
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns true

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
        // Always return the same item (it stays in queue after failure)
        every { dbHelper.getQueuedLocations(50) } returns listOf(item)
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any()) } returns false

        syncManager.manualFlush()

        // Should only fetch ONE batch, not loop 10 times re-fetching the same failing item
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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
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

    // ========================================================================
    // Consecutive failure tracking (3+ failures → error event)
    // ========================================================================

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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
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
            isOfflineMode = false,
            syncCondition = "any",
            syncSsid = "",
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
    // Async exception isolation (fix: one bad item must not kill the chunk)
    // ========================================================================

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

        // Item 1 has corrupted payload that will throw JSONException
        val corrupted = QueuedLocation(1L, 100L, "NOT_VALID_JSON", 0)
        val valid = QueuedLocation(2L, 101L, """{"lat":52.0}""", 0)
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(
            listOf(corrupted, valid),
            emptyList()
        )
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns true

        syncManager.manualFlush()

        // Valid item should still be sent despite corrupted sibling
        coVerify(atLeast = 1) { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) }
        // Corrupted item gets retry increment, valid item gets removed
        verify { dbHelper.incrementRetryCount(1L, "Send failed") }
        verify { dbHelper.markLocationsSent(listOf(101L)) }

        unmockkObject(LocationServiceModule.Companion)
    }

    // ========================================================================
    // apiFormat passthrough
    // ========================================================================

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

        coEvery { networkManager.isNetworkAvailable() } returns true
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns true

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
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } returns true

        syncManager.manualFlush()

        coVerify { networkManager.sendToEndpoint(any(), any(), any(), "POST", ApiFormat.TRACCAR_JSON) }
    }

    // ========================================================================
    // OVERLAND_BATCH path
    // ========================================================================

    @Test
    fun `batch path sends one POST and removes all rows on success`() = scope.runTest {
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
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(items, emptyList())
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } returns BatchResult.Success

        syncManager.manualFlush()

        coVerify(exactly = 1) { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) }
        verify { dbHelper.markLocationsSent(items.map { it.locationId }) }
        verify { dbHelper.removeBatchFromQueue(items.map { it.queueId }) }
    }

    @Test
    fun `batch path bails on 5xx without splitting and bumps retry counts once each`() = scope.runTest {
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

        val items = (1L..4L).map {
            QueuedLocation(it, it + 100, """{"lat":52.0,"lon":13.0,"tst":1700000000}""", 0)
        }
        every { dbHelper.getQueuedLocations(50) } returns items
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } returns BatchResult.ServerError(503)

        syncManager.manualFlush()

        // Critical: exactly ONE HTTP call. NOT recursive splits, that would amplify the outage.
        coVerify(exactly = 1) { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) }
        // Each row gets one retry bump
        items.forEach { verify { dbHelper.incrementRetryCount(it.queueId, "5xx: 503") } }
    }

    @Test
    fun `batch path bails on network error without splitting`() = scope.runTest {
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

        val items = (1L..3L).map {
            QueuedLocation(it, it + 100, """{"lat":52.0,"lon":13.0,"tst":1700000000}""", 0)
        }
        every { dbHelper.getQueuedLocations(50) } returns items
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } returns BatchResult.NetworkError

        syncManager.manualFlush()

        coVerify(exactly = 1) { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) }
        items.forEach { verify { dbHelper.incrementRetryCount(it.queueId, "network") } }
    }

    @Test
    fun `batch path splits on 4xx to isolate poison row`() = scope.runTest {
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

        // 4 items: items 1, 2, 3 are good. Item 4 (queueId=4) is the poison row.
        val items = (1L..4L).map {
            QueuedLocation(it, it + 100, """{"lat":52.0,"lon":13.0,"tst":1700000000,"id":$it}""", 0)
        }
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(items, emptyList())

        // Server rejects any batch that contains the poison item (queueId 4)
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } answers {
            val sent = arg<List<JSONObject>>(0)
            val containsPoison = sent.any { it.optInt("id", -1) == 4 }
            if (containsPoison) BatchResult.ClientError(400) else BatchResult.Success
        }

        // Capture every commit call so we can assert across all split-recovery calls
        val sentLocationIds = mutableSetOf<Long>()
        val removedQueueIds = mutableSetOf<Long>()
        every { dbHelper.markLocationsSent(any()) } answers {
            sentLocationIds.addAll(firstArg<List<Long>>())
        }
        every { dbHelper.removeBatchFromQueue(any()) } answers {
            removedQueueIds.addAll(firstArg<List<Long>>())
        }

        syncManager.manualFlush()

        // Poison row gets isolated to a 1-item batch that fails alone -> retry counter bumped
        verify { dbHelper.incrementRetryCount(4L, "4xx: 400") }
        // Good rows committed across one or more split-recovery calls
        assertEquals(setOf(101L, 102L, 103L), sentLocationIds)
        assertEquals(setOf(1L, 2L, 3L), removedQueueIds)
        // Poison row was NOT committed
        assertFalse(sentLocationIds.contains(104L))
        assertFalse(removedQueueIds.contains(4L))
    }

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

        // Plan called this out: overlandBatchSize must thread into the fetch limit, not just the wire bundle.
        verify { dbHelper.getQueuedLocations(200) }
    }

    @Test
    fun `batch path lifts custom fields to envelope and sends device_id`() = scope.runTest {
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

        // Payload has a custom field (device_id) baked in by PayloadBuilder
        val item = QueuedLocation(
            1L, 100L,
            """{"device_id":"my-pixel","lat":52.0,"lon":13.0,"tst":1700000000}""",
            0
        )
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(listOf(item), emptyList())

        var capturedFields: Map<String, String>? = null
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } answers {
            @Suppress("UNCHECKED_CAST")
            capturedFields = arg<Map<String, String>>(1)
            BatchResult.Success
        }

        syncManager.manualFlush()

        // Custom fields must be extracted from the per-row payload and passed at envelope level.
        // Canonical location keys must NOT be passed as custom fields.
        val fields = checkNotNull(capturedFields)
        assertEquals("my-pixel", fields["device_id"])
        assertFalse("lat is a canonical key, not a custom field", fields.containsKey("lat"))
        assertFalse("tst is a canonical key, not a custom field", fields.containsKey("tst"))
    }

    @Test
    fun `batch path isolates corrupt payload without poisoning the bundle`() = scope.runTest {
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

        // Item 1 has a corrupted payload (not valid JSON). Items 2 and 3 are valid.
        // Without isolation, JSONObject(item.payload) would throw and abort the whole pass,
        // leaving the corrupt row to re-throw forever next cycle.
        val corrupted = QueuedLocation(1L, 100L, "NOT_VALID_JSON{{{", 0)
        val valid1 = QueuedLocation(2L, 101L, """{"lat":52.0,"lon":13.0,"tst":1700000000}""", 0)
        val valid2 = QueuedLocation(3L, 102L, """{"lat":52.1,"lon":13.1,"tst":1700000001}""", 0)
        every { dbHelper.getQueuedLocations(50) } returnsMany listOf(
            listOf(corrupted, valid1, valid2),
            emptyList()
        )

        var capturedItemCount = 0
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } answers {
            @Suppress("UNCHECKED_CAST")
            capturedItemCount = arg<List<JSONObject>>(0).size
            BatchResult.Success
        }

        syncManager.manualFlush()

        // Corrupt row gets its retry counter bumped
        verify { dbHelper.incrementRetryCount(1L, "Corrupt payload") }
        // Only the 2 valid rows are bundled into the wire request
        assertEquals(2, capturedItemCount)
        // Valid rows are committed
        verify { dbHelper.markLocationsSent(listOf(101L, 102L)) }
        verify { dbHelper.removeBatchFromQueue(listOf(2L, 3L)) }
        // Corrupt row is NOT removed from the queue (stays for next cycle, just deprioritized)
        verify(exactly = 0) { dbHelper.removeBatchFromQueue(match { it.contains(1L) }) }
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
