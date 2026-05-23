/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.importer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.concurrent.atomic.AtomicBoolean

@RunWith(RobolectricTestRunner::class)
class CsvParserTest {

    private val cancelled = AtomicBoolean(false)
    private val nowSec = 1_750_000_000L

    @Test
    fun `parses Colota CSV export header order`() {
        val csv = """
            id,timestamp,iso_time,latitude,longitude,accuracy,altitude,speed,battery
            0,1704110400,2024-01-01T12:00:00.000Z,52.5,13.4,5,30,2,80
        """.trimIndent()

        val result = CsvParser.parse(csv.byteInputStream(), cancelled, nowSec)
        assertEquals(0, result.invalid)
        assertEquals(1, result.rows.size)
        val row = result.rows[0]
        assertEquals(52.5, row.latitude, 1e-9)
        assertEquals(13.4, row.longitude, 1e-9)
        assertEquals(1_704_110_400L, row.timestamp)
        assertEquals(5, row.accuracy)
        assertEquals(30, row.altitude)
        assertEquals(2, row.speed)
        assertEquals(80, row.battery)
    }

    @Test
    fun `accepts foreign column order via header lookup`() {
        val csv = """
            time,lat,lon,acc
            2024-01-01T12:00:00Z,52.5,13.4,7
        """.trimIndent()

        val result = CsvParser.parse(csv.byteInputStream(), cancelled, nowSec)
        assertEquals(1, result.rows.size)
        assertEquals(7, result.rows[0].accuracy)
    }

    @Test
    fun `falls back from numeric timestamp to ISO when numeric is blank`() {
        val csv = """
            timestamp,iso_time,latitude,longitude
            ,2024-01-01T12:00:00Z,52.5,13.4
        """.trimIndent()

        val result = CsvParser.parse(csv.byteInputStream(), cancelled, nowSec)
        assertEquals(1, result.rows.size)
        assertEquals(1_704_110_400L, result.rows[0].timestamp)
    }

    @Test
    fun `rejects header missing required columns`() {
        val csv = """
            id,name,description
            0,foo,bar
        """.trimIndent()

        try {
            CsvParser.parse(csv.byteInputStream(), cancelled, nowSec)
        } catch (e: UnsupportedFormatException) {
            assertTrue(e.message?.contains("latitude") == true)
            return
        }
        throw AssertionError("expected UnsupportedFormatException for missing required columns")
    }

    @Test
    fun `drops malformed rows but continues parsing`() {
        val csv = """
            timestamp,latitude,longitude
            1704110400,52.5,13.4
            ,,
            1704110500,52.6,13.5
        """.trimIndent()

        val result = CsvParser.parse(csv.byteInputStream(), cancelled, nowSec)
        assertEquals(2, result.rows.size)
        assertEquals(1, result.invalid)
    }

    @Test
    fun `skips blank lines without counting them as invalid`() {
        val csv = """
            timestamp,latitude,longitude
            1704110400,52.5,13.4

            1704110500,52.6,13.5
        """.trimIndent()

        val result = CsvParser.parse(csv.byteInputStream(), cancelled, nowSec)
        assertEquals(2, result.rows.size)
        assertEquals(0, result.invalid)
    }

    @Test
    fun `splitCsvLine strips surrounding double quotes`() {
        val parts = CsvParser.splitCsvLine("\"a\",b,\"c\"")
        assertEquals(listOf("a", "b", "c"), parts)
    }

    @Test
    fun `rejects rows where a quoted field contains an unescaped comma`() {
        // Without this guard the split would shift columns and could swap lat / lon.
        val csv = """
            name,timestamp,latitude,longitude
            "Foo, Bar",1704110400,52.5,13.4
            Clean,1704110500,52.6,13.5
        """.trimIndent()

        val result = CsvParser.parse(csv.byteInputStream(), cancelled, nowSec)
        assertEquals(1, result.rows.size)
        assertEquals(1, result.invalid)
        assertEquals(1_704_110_500L, result.rows[0].timestamp)
    }

    @Test
    fun `parseHeader maps aliases to canonical indices`() {
        val cols = CsvParser.parseHeader("ts,lat,lng,velocity,ele")
        assertEquals(0, cols.tsNumeric)
        assertEquals(1, cols.lat)
        assertEquals(2, cols.lon)
        assertEquals(3, cols.speed)
        assertEquals(4, cols.altitude)
    }

    @Test
    fun `cancellation flag interrupts parse`() {
        val csv = buildString {
            append("timestamp,latitude,longitude\n")
            for (i in 0 until 1000) append("1704110${400 + i},52.5,13.4\n")
        }
        try {
            CsvParser.parse(csv.byteInputStream(), AtomicBoolean(true), nowSec)
        } catch (_: InterruptedException) {
            return
        }
        throw AssertionError("expected InterruptedException")
    }
}
