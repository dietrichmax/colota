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

class PointSenderTest {

    private lateinit var dbHelper: DatabaseHelper
    private lateinit var networkManager: NetworkManager
    private val rateLimits = mutableListOf<Long?>()
    private lateinit var sender: PointSender
    private val keptInPlace = mutableSetOf<Long>()

    @Before
    fun setUp() {
        dbHelper = mockk(relaxed = true)
        networkManager = mockk(relaxed = true)
        rateLimits.clear()
        keptInPlace.clear()
        sender = PointSender(dbHelper, networkManager) { rateLimits.add(it) }

        mockkObject(AppLogger)
        every { AppLogger.e(any(), any(), any()) } just Runs
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
    }

    private fun rows(count: Long) = (1L..count).map { QueuedLocation(it, it + 100, """{"lat":52.$it}""", 0) }

    /** Answers per row, keyed by the lat the payload carries. */
    private fun answer(vararg byRow: Pair<Long, BatchResult>) {
        val results = byRow.toMap()
        coEvery { networkManager.sendToEndpoint(any(), any(), any(), any(), any()) } answers {
            val id = firstArg<JSONObject>().get("lat").toString().substringAfter(".").toLong()
            results.getValue(id)
        }
    }

    private suspend fun send(items: List<QueuedLocation>) =
        sender.sendChunk(items, "https://example.com", emptyMap(), "POST", ApiFormat.FIELD_MAPPED, keptInPlace)

    @Test
    fun `sent rows leave the queue and a rejected one is bumped`() = runTest {
        answer(1L to BatchResult.Success, 2L to BatchResult.ClientError(400), 3L to BatchResult.Success)

        val result = send(rows(3))

        verify { dbHelper.markLocationsSent(listOf(101L, 103L)) }
        verify { dbHelper.removeBatchFromQueue(listOf(1L, 3L)) }
        verify { dbHelper.incrementRetryCount(2L, "4xx: 400") }
        assertEquals(PointSender.ChunkResult(sent = 2, failed = 1, stopReason = null), result)
    }

    /** A gateway error says nothing about the row, so it keeps its place and the pass must not post it again. */
    @Test
    fun `a gateway outage keeps the row in place without a bump`() = runTest {
        answer(1L to BatchResult.ServerError(502), 2L to BatchResult.Success)

        send(rows(2))

        verify(exactly = 0) { dbHelper.incrementRetryCount(any(), any()) }
        assertEquals(setOf(1L), keptInPlace)
    }

    @Test
    fun `a corrupt row is bumped and the rest of the chunk still goes out`() = runTest {
        answer(2L to BatchResult.Success)
        val items = listOf(QueuedLocation(1L, 100L, "NOT_VALID_JSON", 0)) + rows(2).drop(1)

        val result = send(items)

        verify { dbHelper.incrementRetryCount(1L, "Corrupt payload") }
        verify { dbHelper.markLocationsSent(listOf(102L)) }
        assertEquals(1, result.sent)
    }

    /** The longest wait the server asked for wins, and the pass ends after this chunk. */
    @Test
    fun `a 429 hands the longest Retry-After to the caller and stops the pass`() = runTest {
        answer(1L to BatchResult.RateLimited(null), 2L to BatchResult.RateLimited(600), 3L to BatchResult.Success)

        val result = send(rows(3))

        assertEquals(listOf<Long?>(600L), rateLimits)
        assertTrue(result.stopReason!!.startsWith("rate limited"))
        verify { dbHelper.removeBatchFromQueue(listOf(3L)) }
    }

    /** One chunk of a dead host is enough to know it; a chunk that got rows through keeps going. */
    @Test
    fun `an outage stops the pass only when nothing got through`() = runTest {
        answer(1L to BatchResult.NetworkError, 2L to BatchResult.NetworkError)
        assertEquals("server unreachable", send(rows(2)).stopReason)

        answer(1L to BatchResult.NetworkError, 2L to BatchResult.Success)
        assertNull(send(rows(2)).stopReason)
    }
}
