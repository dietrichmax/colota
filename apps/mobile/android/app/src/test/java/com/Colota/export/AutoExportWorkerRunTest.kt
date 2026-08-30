package com.Colota.export

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.testing.TestListenableWorkerBuilder
import com.Colota.data.DatabaseHelper
import com.Colota.util.AppLogger
import io.mockk.*
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import java.io.ByteArrayOutputStream
import java.io.OutputStream

/** The worker end to end against a document tree whose provider reports sizes lazily, as cloud providers do. */
@RunWith(RobolectricTestRunner::class)
class AutoExportWorkerRunTest {

    private lateinit var db: DatabaseHelper
    private lateinit var createdDoc: DocumentFile
    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private val docUri: Uri = Uri.parse("content://com.colota.test.docs/document/export-1")
    private val written = ByteArrayOutputStream()

    @Before
    fun setUp() {
        resetSingleton()
        db = DatabaseHelper.getInstance(context)

        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
        every { AppLogger.e(any(), any()) } just Runs
        every { AppLogger.e(any(), any(), any()) } just Runs

        db.saveSetting("autoExportEnabled", "true")
        db.saveSetting("autoExportUri", "content://com.colota.test.docs/tree/root")
        db.saveSetting("autoExportFormat", "csv")
        db.saveSetting("autoExportMode", "incremental")
        db.saveSetting("lastAutoExportTimestamp", "1700000000")
        // Enough rows for the temp file to exceed one copy buffer, so a truncation mid-copy is observable
        db.writableDatabase.beginTransaction()
        try {
            for (i in 0 until 200) db.saveLocation(latitude = 52.0, longitude = 13.0, timestamp = 1700000500L + i)
            db.writableDatabase.setTransactionSuccessful()
        } finally {
            db.writableDatabase.endTransaction()
        }

        createdDoc = mockk<DocumentFile>()
        every { createdDoc.uri } returns docUri
        every { createdDoc.name } returns "colota_export.csv"
        every { createdDoc.exists() } returns false
        every { createdDoc.length() } returns 0L
        every { createdDoc.delete() } returns true
        val tree = mockk<DocumentFile>()
        every { tree.createFile(any(), any()) } returns createdDoc
        every { tree.listFiles() } returns emptyArray()
        mockkStatic(DocumentFile::class)
        every { DocumentFile.fromTreeUri(any(), any()) } returns tree
        shadowOf(context.contentResolver).registerOutputStream(docUri, written)
    }

    @After
    fun tearDown() {
        unmockkStatic(DocumentFile::class)
        unmockkObject(AppLogger)
        db.close()
        resetSingleton()
    }

    private fun resetSingleton() {
        val field = DatabaseHelper::class.java.getDeclaredField("INSTANCE")
        field.isAccessible = true
        field.set(null, null)
    }

    private fun runWorker(): ListenableWorker.Result {
        val worker = TestListenableWorkerBuilder<AutoExportWorker>(context)
            .setTags(listOf(AutoExportScheduler.IMMEDIATE_WORK_TAG))
            .build()
        return runBlocking { worker.doWork() }
    }

    @Test
    fun `an export succeeds on a provider that reports the document size lazily`() {
        val result = runWorker()

        assertTrue("expected success, got $result", result is ListenableWorker.Result.Success)
        val csv = written.toString(Charsets.UTF_8.name())
        assertTrue(csv.startsWith("id,timestamp"))
        assertTrue(csv.contains("1700000500"))
        val config = AutoExportConfig.from(db)
        assertTrue("watermark should advance past the exported rows", config.lastExportTimestamp > 1700000000L)
        assertEquals("colota_export.csv", config.lastFileName)
        assertEquals(200, config.lastRowCount)
        assertTrue("temp file should be gone", context.cacheDir.listFiles { f -> f.name.startsWith("auto_export_") }!!.isEmpty())
    }

    @Test
    fun `a copy that delivers fewer bytes than the temp file held is retried, not reported complete`() {
        // Another writer truncating the temp file under the running copy
        val truncating = object : OutputStream() {
            override fun write(b: Int) = Unit
            override fun write(b: ByteArray, off: Int, len: Int) {
                context.cacheDir.listFiles { f -> f.name.startsWith("auto_export_") }!!.forEach { it.writeText("") }
            }
        }
        shadowOf(context.contentResolver).registerOutputStream(docUri, truncating)

        val result = runWorker()

        assertTrue("expected retry, got $result", result is ListenableWorker.Result.Retry)
        val config = AutoExportConfig.from(db)
        assertEquals(1700000000L, config.lastExportTimestamp)
        assertTrue("expected the verification error, got ${config.lastError}", config.lastError!!.contains("Export verification failed"))
        verify { createdDoc.delete() }
    }
}
