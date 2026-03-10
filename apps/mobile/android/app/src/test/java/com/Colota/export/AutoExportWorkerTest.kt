package com.Colota.export

import com.Colota.util.AppLogger
import io.mockk.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class AutoExportWorkerTest {

    @get:Rule
    val tempFolder = TemporaryFolder()

    @Before
    fun setUp() {
        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs
    }

    @After
    fun tearDown() {
        unmockkObject(AppLogger)
    }

    // --- exportToFile ---

    @Test
    fun `exportToFile writes CSV to temp file`() {
        val tempFile = tempFolder.newFile("test_export.csv")
        val db = mockk<com.Colota.data.DatabaseHelper>(relaxed = true)
        val sampleRows = listOf(
            mapOf<String, Any?>(
                "latitude" to 52.52, "longitude" to 13.405, "accuracy" to 10,
                "altitude" to 34, "speed" to 1.2, "battery" to 85, "timestamp" to 1700000000L
            )
        )
        every { db.getLocationsChronological(any(), eq(0)) } returns sampleRows
        every { db.getLocationsChronological(any(), eq(10000)) } returns emptyList()

        val rows = ExportConverters.exportToFile(db, "csv", tempFile)

        assertEquals(1, rows)
        val content = tempFile.readText()
        assertTrue(content.startsWith("id,timestamp,"))
        assertTrue(content.contains("52.52"))
    }

    @Test
    fun `exportToFile returns 0 when no locations`() {
        val tempFile = tempFolder.newFile("test_empty.csv")
        val db = mockk<com.Colota.data.DatabaseHelper>(relaxed = true)
        every { db.getLocationsChronological(any(), any()) } returns emptyList()

        val rows = ExportConverters.exportToFile(db, "csv", tempFile)
        assertEquals(0, rows)
    }

    @Test
    fun `exportToFile produces valid GeoJSON`() {
        val tempFile = tempFolder.newFile("test_export.geojson")
        val db = mockk<com.Colota.data.DatabaseHelper>(relaxed = true)
        val sampleRows = listOf(
            mapOf<String, Any?>(
                "latitude" to 52.52, "longitude" to 13.405, "accuracy" to 10,
                "altitude" to 34, "speed" to 1.2, "battery" to 85, "timestamp" to 1700000000L
            )
        )
        every { db.getLocationsChronological(any(), eq(0)) } returns sampleRows
        every { db.getLocationsChronological(any(), eq(10000)) } returns emptyList()

        ExportConverters.exportToFile(db, "geojson", tempFile)

        val content = tempFile.readText()
        assertTrue(content.contains("FeatureCollection"))
        assertTrue(content.contains("[13.405, 52.52]"))
        assertTrue(content.trimEnd().endsWith("}"))
    }

    @Test
    fun `exportToFile produces valid KML with LineString`() {
        val tempFile = tempFolder.newFile("test_export.kml")
        val db = mockk<com.Colota.data.DatabaseHelper>(relaxed = true)
        val sampleRows = listOf(
            mapOf<String, Any?>(
                "latitude" to 52.52, "longitude" to 13.405, "accuracy" to 10,
                "altitude" to 34, "speed" to 1.2, "battery" to 85, "timestamp" to 1700000000L
            )
        )
        every { db.getLocationsChronological(any(), eq(0)) } returns sampleRows
        every { db.getLocationsChronological(any(), eq(10000)) } returns emptyList()

        ExportConverters.exportToFile(db, "kml", tempFile)

        val content = tempFile.readText()
        assertTrue(content.contains("<LineString>"))
        assertTrue(content.contains("13.405,52.52,34"))
        assertTrue(content.trimEnd().endsWith("</kml>"))
    }

    @Test
    fun `exportToFile paginates across multiple pages`() {
        val tempFile = tempFolder.newFile("test_paginated.csv")
        val db = mockk<com.Colota.data.DatabaseHelper>(relaxed = true)

        val page = (0 until 100).map { i ->
            mapOf<String, Any?>(
                "latitude" to 52.0 + i * 0.001, "longitude" to 13.0,
                "accuracy" to 10, "altitude" to 0, "speed" to 0,
                "battery" to 50, "timestamp" to (1700000000L + i)
            )
        }

        every { db.getLocationsChronological(100, 0) } returns page
        every { db.getLocationsChronological(100, 100) } returns emptyList()

        val rows = ExportConverters.exportToFile(db, "csv", tempFile, pageSize = 100)

        assertEquals(100, rows)
        verify(exactly = 1) { db.getLocationsChronological(100, 0) }
        verify(exactly = 1) { db.getLocationsChronological(100, 100) }
    }

    // --- JSON escaping ---

    @Test
    fun `GeoJSON escapes double quotes in string values`() {
        val rows = listOf(mapOf<String, Any?>(
            "latitude" to 52.0, "longitude" to 13.0, "timestamp" to 1700000000L,
            "accuracy" to "test\"quoted\"value"
        ))
        val json = ExportConverters.convert("geojson", rows)
        assertTrue(json.contains("test\\\"quoted\\\"value"))
    }

    @Test
    fun `GeoJSON escapes backslashes and control characters`() {
        val rows = listOf(mapOf<String, Any?>(
            "latitude" to 52.0, "longitude" to 13.0, "timestamp" to 1700000000L,
            "accuracy" to "path\\to\\file\nnewline"
        ))
        val json = ExportConverters.convert("geojson", rows)
        assertTrue(json.contains("path\\\\to\\\\file"))
        assertTrue(json.contains("\\n"))
    }
}
