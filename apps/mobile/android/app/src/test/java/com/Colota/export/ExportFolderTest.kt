package com.Colota.export

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import com.Colota.util.AppLogger
import io.mockk.*
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Robolectric for `Build.MODEL`, which the stubbed android.jar leaves null and the matchers read. */
@RunWith(RobolectricTestRunner::class)
class ExportFolderTest {

    private val context = mockk<Context>(relaxed = true)
    private val dirUri = mockk<Uri>()
    private val tree = mockk<DocumentFile>()

    @Before
    fun setUp() {
        mockkStatic(DocumentFile::class)
        every { DocumentFile.fromTreeUri(any(), any()) } returns tree
        mockkObject(AppLogger)
        every { AppLogger.d(any(), any()) } just Runs
        every { AppLogger.i(any(), any()) } just Runs
        every { AppLogger.w(any(), any()) } just Runs
    }

    @After
    fun tearDown() {
        unmockkStatic(DocumentFile::class)
        unmockkObject(AppLogger)
    }

    private fun doc(name: String, isFile: Boolean = true) = mockk<DocumentFile>(relaxed = true) {
        every { this@mockk.name } returns name
        every { this@mockk.isFile } returns isFile
    }

    private fun cleanup(retentionCount: Int, vararg listed: DocumentFile) {
        every { tree.listFiles() } returns arrayOf(*listed)
        ExportFolder(context, dirUri).cleanup(AutoExportConfig(retentionCount = retentionCount))
    }

    /** The folder is the user's: a subfolder or another app's file in it is never Colota's to delete. */
    @Test
    fun `cleanup keeps the newest exports and leaves folders and foreign files alone`() {
        val oldest = doc("colota_export_2026-10-01_1200.csv")
        val older = doc("colota_export_2026-10-02_1200.csv")
        val newer = doc("colota_export_2026-10-03_1200.csv")
        val newest = doc("colota_export_2026-10-04_1200.gpx")
        val folderSharingAName = doc("colota_export_2026-10-01_1200.csv", isFile = false)
        val foreign = doc("notes.txt")

        cleanup(2, oldest, older, newer, newest, folderSharingAName, foreign)

        verify { oldest.delete() }
        verify { older.delete() }
        listOf(newer, newest, folderSharingAName, foreign).forEach { verify(exactly = 0) { it.delete() } }
    }

    /** A provider can hold two documents with one display name, and each counts against the limit. */
    @Test
    fun `two exports with one name are deleted one apiece`() {
        val first = doc("colota_export_2026-10-01_1200.csv")
        val second = doc("colota_export_2026-10-01_1200.csv")
        val kept = doc("colota_export_2026-10-02_1200.csv")

        cleanup(1, first, second, kept)

        verify { first.delete() }
        verify { second.delete() }
        verify(exactly = 0) { kept.delete() }
    }

    @Test
    fun `unlimited retention does not even list the folder`() {
        ExportFolder(context, dirUri).cleanup(AutoExportConfig(retentionCount = 0))

        verify(exactly = 0) { DocumentFile.fromTreeUri(any(), any()) }
    }
}
