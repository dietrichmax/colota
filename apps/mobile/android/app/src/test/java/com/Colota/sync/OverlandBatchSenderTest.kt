package com.Colota.sync

import com.Colota.data.DatabaseHelper
import com.Colota.data.QueuedLocation
import com.Colota.sync.http.BatchResult
import com.Colota.sync.http.NetworkManager
import com.Colota.util.AppLogger
import io.mockk.*
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class OverlandBatchSenderTest {

    private lateinit var dbHelper: DatabaseHelper
    private lateinit var networkManager: NetworkManager
    private val rateLimits = mutableListOf<Long?>()
    private lateinit var sender: OverlandBatchSender

    private val endpoint = "https://dawarich.example/api/v1/overland/batches"

    @Before
    fun setUp() {
        dbHelper = mockk(relaxed = true)
        networkManager = mockk(relaxed = true)
        rateLimits.clear()
        sender = OverlandBatchSender(dbHelper, networkManager) { rateLimits.add(it) }

        mockkObject(AppLogger)
        every { AppLogger.e(any(), any(), any()) } just Runs
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
    }

    private fun rows(count: Long) = (1L..count).map {
        QueuedLocation(it, it + 100, """{"lat":52.0,"lon":13.0,"tst":1700000000,"id":$it}""", 0)
    }

    @Test
    fun `a batch the server accepts is one POST and leaves the queue`() = runTest {
        val items = rows(50)
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } returns BatchResult.Success

        val result = sender.sendBatchRecursive(items, endpoint, emptyMap())

        coVerify(exactly = 1) { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) }
        verify { dbHelper.markLocationsSent(items.map { it.locationId }) }
        verify { dbHelper.removeBatchFromQueue(items.map { it.queueId }) }
        assertEquals(OverlandBatchSender.BatchSendResult(processed = 50, failed = 0, stop = false), result)
    }

    /** Splitting on a 5xx would turn one outage into N more requests per cycle. */
    @Test
    fun `a 5xx ends the pass without splitting and bumps each row once`() = runTest {
        val items = rows(4)
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } returns BatchResult.ServerError(500)

        val result = sender.sendBatchRecursive(items, endpoint, emptyMap())

        coVerify(exactly = 1) { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) }
        items.forEach { verify(exactly = 1) { dbHelper.incrementRetryCount(it.queueId, "5xx: 500") } }
        assertTrue(result.stop)
    }

    /** An outage says nothing about the rows, so they keep their place in the queue. */
    @Test
    fun `a network error ends the pass without splitting or bumping`() = runTest {
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } returns BatchResult.NetworkError

        val result = sender.sendBatchRecursive(rows(3), endpoint, emptyMap())

        coVerify(exactly = 1) { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) }
        verify(exactly = 0) { dbHelper.incrementRetryCount(any(), any()) }
        assertTrue(result.stop)
    }

    /** One row the server refuses must not hold back the rows batched with it. */
    @Test
    fun `a 4xx bisects down to the poison row and commits the rest`() = runTest {
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } answers {
            val containsPoison = arg<List<JSONObject>>(0).any { it.optInt("id", -1) == 4 }
            if (containsPoison) BatchResult.ClientError(400) else BatchResult.Success
        }
        val sentLocationIds = mutableSetOf<Long>()
        val removedQueueIds = mutableSetOf<Long>()
        every { dbHelper.markLocationsSent(any()) } answers { sentLocationIds.addAll(firstArg<List<Long>>()) }
        every { dbHelper.removeBatchFromQueue(any()) } answers { removedQueueIds.addAll(firstArg<List<Long>>()) }

        val result = sender.sendBatchRecursive(rows(4), endpoint, emptyMap())

        verify { dbHelper.incrementRetryCount(4L, "4xx: 400") }
        assertEquals(setOf(101L, 102L, 103L), sentLocationIds)
        assertEquals(setOf(1L, 2L, 3L), removedQueueIds)
        assertEquals(OverlandBatchSender.BatchSendResult(processed = 3, failed = 1, stop = false), result)
    }

    /** A fully rejected batch costs about two requests per row, so the caller must hear from the split before it ends. */
    @Test
    fun `every finished piece of a bisect reports what it sent and failed`() = runTest {
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } answers {
            val containsPoison = arg<List<JSONObject>>(0).any { it.optInt("id", -1) == 4 }
            if (containsPoison) BatchResult.ClientError(400) else BatchResult.Success
        }
        val reports = mutableListOf<Pair<Int, Int>>()

        val result = sender.sendBatchRecursive(rows(4), endpoint, emptyMap()) { sent, failed -> reports.add(sent to failed) }

        assertEquals(listOf(2 to 0, 1 to 0, 0 to 1), reports)
        assertEquals(result.processed to result.failed, reports.sumOf { it.first } to reports.sumOf { it.second })
    }

    @Test
    fun `a corrupt row is reported once, beside the rows that went out`() = runTest {
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } returns BatchResult.Success
        val reports = mutableListOf<Pair<Int, Int>>()

        sender.sendBatchRecursive(listOf(QueuedLocation(9L, 109L, "NOT_VALID_JSON{{{", 0)) + rows(2), endpoint, emptyMap()) { sent, failed ->
            reports.add(sent to failed)
        }

        assertEquals(listOf(0 to 1, 2 to 0), reports)
    }

    /** Overland carries custom fields once on the envelope, never as location keys. */
    @Test
    fun `custom fields lift to the envelope and location keys stay out of it`() = runTest {
        val item = QueuedLocation(1L, 100L, """{"device_id":"my-pixel","lat":52.0,"lon":13.0,"tst":1700000000}""", 0)
        var capturedFields: Map<String, String>? = null
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } answers {
            capturedFields = arg<Map<String, String>>(1)
            BatchResult.Success
        }

        sender.sendBatchRecursive(listOf(item), endpoint, emptyMap())

        val fields = checkNotNull(capturedFields)
        assertEquals("my-pixel", fields["device_id"])
        assertFalse("lat is a canonical key, not a custom field", fields.containsKey("lat"))
        assertFalse("tst is a canonical key, not a custom field", fields.containsKey("tst"))
    }

    /** A row that cannot be parsed would otherwise abort every pass and block the queue behind it. */
    @Test
    fun `a corrupt row is bumped and the valid rows still go out`() = runTest {
        val corrupted = QueuedLocation(1L, 100L, "NOT_VALID_JSON{{{", 0)
        val valid1 = QueuedLocation(2L, 101L, """{"lat":52.0,"lon":13.0,"tst":1700000000}""", 0)
        val valid2 = QueuedLocation(3L, 102L, """{"lat":52.1,"lon":13.1,"tst":1700000001}""", 0)
        var capturedItemCount = 0
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } answers {
            capturedItemCount = arg<List<JSONObject>>(0).size
            BatchResult.Success
        }

        val result = sender.sendBatchRecursive(listOf(corrupted, valid1, valid2), endpoint, emptyMap())

        verify { dbHelper.incrementRetryCount(1L, "Corrupt payload") }
        assertEquals(2, capturedItemCount)
        verify { dbHelper.markLocationsSent(listOf(101L, 102L)) }
        verify { dbHelper.removeBatchFromQueue(listOf(2L, 3L)) }
        verify(exactly = 0) { dbHelper.removeBatchFromQueue(match { it.contains(1L) }) }
        assertEquals(OverlandBatchSender.BatchSendResult(processed = 2, failed = 1, stop = false), result)
    }

    /** Splitting a rate-limited batch would turn one refused request into many more. */
    @Test
    fun `a 429 ends the pass without splitting and hands its Retry-After to the caller`() = runTest {
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } returns BatchResult.RateLimited(120)

        val result = sender.sendBatchRecursive(rows(3), endpoint, emptyMap())

        coVerify(exactly = 1) { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) }
        verify(exactly = 0) { dbHelper.incrementRetryCount(any(), any()) }
        assertEquals(listOf<Long?>(120L), rateLimits)
        assertTrue(result.stop)
    }

    /** A rate limit met while bisecting ends the pass, so the other half is not sent either. */
    @Test
    fun `a rate-limited half stops the bisect before the other half`() = runTest {
        coEvery { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) } returnsMany listOf(
            BatchResult.ClientError(400),
            BatchResult.RateLimited(null),
            BatchResult.Success
        )

        val result = sender.sendBatchRecursive(rows(4), endpoint, emptyMap())

        coVerify(exactly = 2) { networkManager.sendBatchToEndpoint(any(), any(), any(), any()) }
        assertEquals(listOf<Long?>(null), rateLimits)
        assertTrue(result.stop)
    }
}
