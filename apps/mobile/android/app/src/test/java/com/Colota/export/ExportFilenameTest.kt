package com.Colota.export

import com.Colota.export.ExportConverters.ExportEntry
import org.junit.Assert.*
import org.junit.Test
import java.util.Calendar
import java.util.Date

/** Filename templates, the matcher derived from them and retention selection. */
class ExportFilenameTest {

    /** Built through a default-timezone Calendar so it agrees with the renderer's SimpleDateFormat. */
    private fun dateAt(year: Int, month: Int, day: Int, hour: Int, minute: Int): Date {
        val cal = Calendar.getInstance()
        cal.set(year, month - 1, day, hour, minute, 0)
        cal.set(Calendar.MILLISECOND, 0)
        return cal.time
    }

    private val may20 = dateAt(2026, 5, 20, 8, 15)

    private fun render(template: String, format: String = "geojson", device: String = "Pixel 7") =
        ExportConverters.renderExportFilename(template, format, device, may20)

    // --- renderExportFilename ---

    @Test
    fun `default template reproduces the pre-template filename`() {
        // Existing installs must keep byte-identical names, otherwise this is a silent migration.
        assertEquals(
            "colota_export_2026-05-20_0815.geojson",
            render(ExportConverters.DEFAULT_FILENAME_TEMPLATE)
        )
    }

    @Test
    fun `device token drops whitespace`() {
        assertEquals(
            "Pixel7_colota_export-2026-05-20_0815.gpx",
            render("{device}_colota_export-{date}_{time}", format = "gpx")
        )
    }

    @Test
    fun `illegal characters are stripped`() {
        assertEquals(
            "abccolota_export_2026-05-20_0815.csv",
            render("a/b:c*colota_export_{date}_{time}", format = "csv")
        )
    }

    @Test
    fun `unknown tokens lose their braces rather than reaching the filesystem`() {
        assertEquals(
            "devcie_colota_export_2026-05-20_0815.geojson",
            render("{devcie}_colota_export_{date}_{time}")
        )
    }

    @Test
    fun `leading and trailing dots and spaces are trimmed`() {
        // Nextcloud and SMB clients reject or rename names ending in a dot or space, so the file
        // would appear to vanish on every other device.
        assertEquals(
            "colota_export_2026-05-20_0815.geojson",
            render(" .colota_export_{date}_{time}. ")
        )
    }

    @Test
    fun `a device model ending in a dot does not produce a double dot`() {
        assertEquals(
            "colota_export_2026-05-20_0815_MotoG.gpx",
            render("colota_export_{date}_{time}_{device}", format = "gpx", device = "Moto G.")
        )
    }

    @Test
    fun `long device models are capped`() {
        val name = render("{device}_colota_export_{date}_{time}", device = "X".repeat(80))
        assertEquals("${"X".repeat(32)}_colota_export_2026-05-20_0815.geojson", name)
    }

    // --- isValidFilenameTemplate ---

    @Test
    fun `template validation requires the marker and both time tokens`() {
        assertTrue(ExportConverters.isValidFilenameTemplate(ExportConverters.DEFAULT_FILENAME_TEMPLATE))
        assertTrue(ExportConverters.isValidFilenameTemplate("{device}_colota_export-{date}_{time}"))
        assertFalse(ExportConverters.isValidFilenameTemplate("backup_{date}_{time}"))
        assertFalse(ExportConverters.isValidFilenameTemplate("colota_export_{time}"))
        assertFalse(ExportConverters.isValidFilenameTemplate("colota_export_{date}"))
        // Case-sensitive: the marker is what cleanup keys off.
        assertFalse(ExportConverters.isValidFilenameTemplate("Colota_Export_{date}_{time}"))
    }

    @Test
    fun `template validation rejects a template that would overrun the filename limit`() {
        // Rejected rather than truncated, because a truncated name would no longer match its own
        // template and retention would never see it again.
        assertFalse(ExportConverters.isValidFilenameTemplate("x".repeat(120) + "colota_export_{date}_{time}"))
    }

    // --- exportFileMatcher ---

    private val defaultMatcher = ExportConverters.exportFileMatcher(
        ExportConverters.DEFAULT_FILENAME_TEMPLATE,
        "Pixel 7"
    )

    /** Every template a user can save, paired with device names that stress the boundaries. */
    private val roundTripTemplates = listOf(
        ExportConverters.DEFAULT_FILENAME_TEMPLATE,
        "{device}_colota_export-{date}_{time}",
        "colota_export_{date}_{time}_{device}",
        "colota_export_{device}_{date}_{time}",
        "{date}_{time}_colota_export",
        " .colota_export_{date}_{time}. ",
        "colota_export_{date}_{time} {device}",
        "{device}.colota_export_{date}_{time}",
        "colota_export_{date}_{time}_{date}"
    )

    @Test
    fun `every template the matcher builds accepts what the renderer writes`() {
        // The renderer trims the whole name while the matcher trims per segment, so the two can
        // drift apart at any boundary a token sits next to.
        for (template in roundTripTemplates) {
            for (device in listOf("Pixel 7", "", "Moto G.", "X".repeat(80))) {
                for (format in listOf("csv", "geojson", "gpx", "kml")) {
                    val name = ExportConverters.renderExportFilename(template, format, device, may20)
                    val matcher = ExportConverters.exportFileMatcher(template, device)
                    assertTrue(
                        "template='$template' device='$device' rendered '$name' but the matcher rejected it",
                        matcher.matches(name)
                    )
                }
            }
        }
    }

    @Test
    fun `matcher accepts any known export extension so a format switch keeps old files managed`() {
        assertTrue(defaultMatcher.matches("colota_export_2026-05-20_0815.csv"))
        assertTrue(defaultMatcher.matches("colota_export_2026-05-20_0815.kml"))
        assertFalse(defaultMatcher.matches("colota_export_2026-05-20_0815.zip"))
    }

    @Test
    fun `matcher accepts the copy suffix SAF adds on a name collision`() {
        // Two exports in the same minute; without this the second file is invisible to both the
        // history list and retention, forever.
        assertTrue(defaultMatcher.matches("colota_export_2026-05-20_0815 (1).geojson"))
        assertTrue(defaultMatcher.matches("colota_export_2026-05-20_0815 (12).geojson"))
    }

    @Test
    fun `matcher rejects a directory sharing the marker`() {
        assertFalse(defaultMatcher.matches("colota_exports"))
        assertFalse(defaultMatcher.matches("colota_export_archive"))
    }

    @Test
    fun `matcher rejects cloud-sync artifacts and protective renames`() {
        assertFalse(defaultMatcher.matches("colota_export_2026-05-20_0815 (conflicted copy).gpx"))
        assertFalse(defaultMatcher.matches(".colota_export_2026-05-20_0815.gpx.part"))
        assertFalse(defaultMatcher.matches("~syncthing~colota_export_2026-05-20_0815.gpx.tmp"))
        assertFalse(defaultMatcher.matches("KEEP_colota_export_2026-05-20_0815.gpx"))
    }

    @Test
    fun `device token scopes the matcher to this device`() {
        val matcher = ExportConverters.exportFileMatcher("{device}_colota_export-{date}_{time}", "Pixel 7")
        assertTrue(matcher.matches("Pixel7_colota_export-2026-05-20_0815.gpx"))
        assertFalse(matcher.matches("S23_colota_export-2026-05-20_0815.gpx"))
    }

    @Test
    fun `a repeated date token reads the stamp from the first occurrence`() {
        val matcher = ExportConverters.exportFileMatcher("colota_export_{date}_{time}_{date}", "Pixel 7")
        assertEquals(
            "2026-05-200815",
            matcher.stamp("colota_export_2026-05-20_0815_1999-01-01.geojson")
        )
    }

    @Test
    fun `stamp is chronologically sortable`() {
        assertTrue(
            ExportConverters.stampOf("colota_export_2026-05-19_2359.gpx", listOf(defaultMatcher)) <
                ExportConverters.stampOf("colota_export_2026-05-20_0000.gpx", listOf(defaultMatcher))
        )
        assertEquals("", ExportConverters.stampOf("unrelated.txt", listOf(defaultMatcher)))
    }

    // --- exportFileMatchers: which files a template claims ---

    @Test
    fun `a custom template still claims legacy default-named files`() {
        val matchers = ExportConverters.exportFileMatchers("backup_colota_export-{date}_{time}", "Pixel 7")
        assertTrue(matchers.any { it.matches("backup_colota_export-2026-05-20_0815.gpx") })
        assertTrue(matchers.any { it.matches("colota_export_2026-01-01_0000.geojson") })
    }

    @Test
    fun `a device template does not claim legacy default-named files`() {
        // A plain colota_export_* file could have been written by any phone sharing the folder.
        // Leaving a few of our own behind beats deleting someone else's.
        val matchers = ExportConverters.exportFileMatchers("{device}_colota_export-{date}_{time}", "Pixel 7")
        assertTrue(matchers.any { it.matches("Pixel7_colota_export-2026-05-20_0815.gpx") })
        assertFalse(matchers.any { it.matches("colota_export_2026-01-01_0000.geojson") })
    }

    // --- selectForDeletion ---

    private val defaultMatchers = listOf(defaultMatcher)

    private fun entry(name: String, lastModified: Long = 0L, isFile: Boolean = true) =
        ExportEntry(name, lastModified, isFile)

    @Test
    fun `retention of zero keeps everything`() {
        val entries = (1..5).map { entry("colota_export_2026-05-0${it}_0800.gpx", it * 1000L) }
        assertTrue(ExportConverters.selectForDeletion(entries, 0, defaultMatchers).isEmpty())
    }

    @Test
    fun `ordering follows the stamp even when it disagrees with alphabetical order`() {
        // A user who moved from the default template to a prefixed one has both shapes in the
        // folder, and there alphabetical order puts the newest file first.
        val matchers = ExportConverters.exportFileMatchers("backup_colota_export-{date}_{time}", "Pixel 7")
        val entries = listOf(
            entry("backup_colota_export-2026-05-20_0800.gpx"),
            entry("colota_export_2026-05-18_0800.gpx"),
            entry("colota_export_2026-05-19_0800.gpx")
        )
        val doomed = ExportConverters.selectForDeletion(entries, 2, matchers)
        assertEquals(listOf("colota_export_2026-05-18_0800.gpx"), doomed.map { it.name })
    }

    @Test
    fun `ordering survives a provider that reports no lastModified`() {
        // DocumentFile.lastModified() returns 0 when the provider omits the column; sorting on it
        // alone would collapse to arbitrary cursor order and delete the wrong files.
        val entries = listOf(
            entry("colota_export_2026-05-20_0800.gpx"),
            entry("colota_export_2026-05-18_0800.gpx"),
            entry("colota_export_2026-05-19_0800.gpx")
        )
        val doomed = ExportConverters.selectForDeletion(entries, 2, defaultMatchers)
        assertEquals(listOf("colota_export_2026-05-18_0800.gpx"), doomed.map { it.name })
    }

    @Test
    fun `filename stamp wins over a lastModified restamped by cloud sync`() {
        // Sync clients restamp on download, which would otherwise make the oldest export look newest.
        val entries = listOf(
            entry("colota_export_2026-05-18_0800.gpx", lastModified = 9_000L),
            entry("colota_export_2026-05-19_0800.gpx", lastModified = 2_000L),
            entry("colota_export_2026-05-20_0800.gpx", lastModified = 1_000L)
        )
        val doomed = ExportConverters.selectForDeletion(entries, 2, defaultMatchers)
        assertEquals(listOf("colota_export_2026-05-18_0800.gpx"), doomed.map { it.name })
    }

    @Test
    fun `directories are never selected even when the name would match`() {
        // DocumentFile.delete() on a tree directory is recursive.
        val entries = listOf(
            entry("colota_exports", isFile = false),
            entry("colota_export_2026-05-01_0800.gpx", isFile = false),
            entry("colota_export_2026-05-18_0800.gpx"),
            entry("colota_export_2026-05-19_0800.gpx"),
            entry("colota_export_2026-05-20_0800.gpx")
        )
        val doomed = ExportConverters.selectForDeletion(entries, 2, defaultMatchers)
        assertEquals(listOf("colota_export_2026-05-18_0800.gpx"), doomed.map { it.name })
    }

    @Test
    fun `a device-scoped template leaves other devices' exports alone`() {
        // Several devices exporting into one shared folder.
        val matchers = ExportConverters.exportFileMatchers("{device}_colota_export-{date}_{time}", "Pixel 7")
        val entries = listOf(
            entry("Pixel7_colota_export-2026-05-18_0800.gpx"),
            entry("Pixel7_colota_export-2026-05-19_0800.gpx"),
            entry("Pixel7_colota_export-2026-05-20_0800.gpx"),
            entry("S23_colota_export-2026-05-01_0800.gpx"),
            entry("S23_colota_export-2026-05-02_0800.gpx"),
            entry("colota_export_2026-01-01_0000.geojson")
        )
        val doomed = ExportConverters.selectForDeletion(entries, 2, matchers)
        assertEquals(listOf("Pixel7_colota_export-2026-05-18_0800.gpx"), doomed.map { it.name })
    }

    @Test
    fun `unrelated files in a shared folder are never selected`() {
        val entries = listOf(
            entry("holiday-photos.zip"),
            entry("notes.txt"),
            entry("colota_export_2026-05-18_0800.gpx"),
            entry("colota_export_2026-05-19_0800.gpx")
        )
        val doomed = ExportConverters.selectForDeletion(entries, 1, defaultMatchers)
        assertEquals(listOf("colota_export_2026-05-18_0800.gpx"), doomed.map { it.name })
    }
}
