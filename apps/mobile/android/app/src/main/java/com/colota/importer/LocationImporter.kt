/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.importer

import android.content.ContentResolver
import android.location.Location
import android.net.Uri
import android.util.JsonReader
import android.util.JsonToken
import com.Colota.data.DatabaseHelper
import com.Colota.sync.ApiFormat
import com.Colota.sync.PayloadBuilder
import com.Colota.util.AppLogger
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.io.SequenceInputStream
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.roundToLong

object LocationImporter {

    private const val TAG = "LocationImporter"
    private const val SNIFF_BYTES = 4096

    // 6dp ~ 10cm. Tight enough to catch round-tripped exports, loose enough that
    // genuinely distinct nearby fixes don't collide.
    private const val DEDUP_PRECISION = 1_000_000L

    fun preview(
        contentResolver: ContentResolver,
        uri: Uri,
        db: DatabaseHelper,
        cancelled: AtomicBoolean,
        nowSec: Long = System.currentTimeMillis() / 1000,
    ): PreviewResult {
        val parseStart = System.currentTimeMillis()
        val (format, parse) = openStream(contentResolver, uri).use { stream ->
            val (sniffBytes, sniffString) = readSniff(stream)
            val detected = detectFormat(sniffString)
                ?: throw UnsupportedFormatException("Could not detect file format")
            val combined = SequenceInputStream(ByteArrayInputStream(sniffBytes), stream)
            val result = when (detected) {
                ImportFormat.GEOJSON -> GeoJsonParser.parse(combined, cancelled, nowSec)
                ImportFormat.GOOGLE_TIMELINE_LEGACY,
                ImportFormat.GOOGLE_TIMELINE_NEW -> GoogleTimelineParser.parse(combined, cancelled, nowSec)
                ImportFormat.GPX -> GpxParser.parse(combined, cancelled, nowSec)
                ImportFormat.KML -> KmlParser.parse(combined, cancelled, nowSec)
                ImportFormat.CSV -> CsvParser.parse(combined, cancelled, nowSec)
            }
            detected to result
        }
        val parseMs = System.currentTimeMillis() - parseStart
        val rate = if (parseMs > 0) parse.rows.size * 1000L / parseMs else parse.rows.size.toLong()
        AppLogger.i(TAG, "Parsed ${parse.rows.size} rows (${parse.invalid} invalid) in ${parseMs}ms (~$rate rows/s) format=$format")

        if (cancelled.get()) throw InterruptedException("Import cancelled")
        if (parse.rows.isEmpty()) {
            return PreviewResult(
                format = format,
                totalParsed = 0,
                invalid = parse.invalid,
                duplicates = 0,
                dateRangeStartSec = null,
                dateRangeEndSec = null,
                rowsToCommit = emptyList(),
            )
        }

        val dedupStart = System.currentTimeMillis()
        val sortedIncoming = parse.rows.sortedWith(
            compareBy<ImportRow> { it.timestamp }
                .thenBy { it.latitude }
                .thenBy { it.longitude },
        )
        // Fold in-file dupes first or the merge-walk's cmp==0 branch can leak a
        // second copy past an already-matched DB key.
        val (deduped, inFileDuplicates) = foldInFileDuplicates(sortedIncoming)
        val minTs = deduped.first().timestamp
        val maxTs = deduped.last().timestamp
        val (unique, dbDuplicates) = mergeWalkDedup(db, deduped, minTs, maxTs, cancelled)
        val duplicates = inFileDuplicates + dbDuplicates
        val dedupMs = System.currentTimeMillis() - dedupStart
        AppLogger.i(TAG, "Dedup: ${unique.size} new, $duplicates duplicates in ${dedupMs}ms")

        return PreviewResult(
            format = format,
            totalParsed = parse.rows.size,
            invalid = parse.invalid,
            duplicates = duplicates,
            dateRangeStartSec = minTs,
            dateRangeEndSec = maxTs,
            rowsToCommit = unique,
        )
    }

    private fun foldInFileDuplicates(sorted: List<ImportRow>): Pair<List<ImportRow>, Int> {
        if (sorted.size <= 1) return sorted to 0
        val out = ArrayList<ImportRow>(sorted.size)
        out.add(sorted[0])
        var lastKey = dedupKey(sorted[0].timestamp, sorted[0].latitude, sorted[0].longitude)
        var dupes = 0
        for (i in 1 until sorted.size) {
            val k = dedupKey(sorted[i].timestamp, sorted[i].latitude, sorted[i].longitude)
            if (k == lastKey) {
                dupes++
            } else {
                out.add(sorted[i])
                lastKey = k
            }
        }
        return out to dupes
    }

    fun commit(db: DatabaseHelper, rows: List<ImportRow>, options: CommitOptions = CommitOptions()): Int {
        if (rows.isEmpty()) return 0
        if (!options.asQueued) {
            return db.bulkInsertImportedLocations(rows, payloads = null)
        }
        require(options.endpoint.isNotBlank()) {
            "asQueued requires a non-blank endpoint"
        }
        require(!options.isOfflineMode) {
            "asQueued is not permitted while the app is in offline mode"
        }
        val payloads = rows.map { row -> buildPayloadForRow(row, options).toString() }
        return db.bulkInsertImportedLocations(rows, payloads = payloads)
    }

    private fun buildPayloadForRow(row: ImportRow, options: CommitOptions): org.json.JSONObject {
        // Setters also flip the has* flags PayloadBuilder gates optional fields on.
        val location = Location("import").apply {
            latitude = row.latitude
            longitude = row.longitude
            accuracy = (row.accuracy ?: 0).toFloat()
            if (row.altitude != null) altitude = row.altitude.toDouble()
            if (row.speed != null) speed = row.speed.toFloat()
            if (row.bearing != null) bearing = row.bearing.toFloat()
            time = row.timestamp * 1000L
        }
        return PayloadBuilder.buildLocationPayload(
            location = location,
            timestamp = row.timestamp,
            batteryLevel = row.battery ?: 0,
            batteryStatus = row.batteryStatus ?: 0,
            fieldMap = options.fieldMap,
            customFields = options.customFields,
            apiFormat = options.apiFormat,
        )
    }

    // Merge-walks the sorted incoming list against an ASC DB cursor in `[minTs, maxTs]`
    // so peak memory doesn't scale with the size of the existing history.
    private fun mergeWalkDedup(
        db: DatabaseHelper,
        sortedIncoming: List<ImportRow>,
        minTs: Long,
        maxTs: Long,
        cancelled: AtomicBoolean,
    ): Pair<List<ImportRow>, Int> {
        val unique = ArrayList<ImportRow>(sortedIncoming.size)
        var duplicates = 0
        var idx = 0
        db.forEachLocationKeyInRange(minTs, maxTs) { dbTs, dbLat, dbLon ->
            if (cancelled.get()) throw InterruptedException("Import cancelled")
            val dbKey = dedupKey(dbTs, dbLat, dbLon)
            while (idx < sortedIncoming.size) {
                val row = sortedIncoming[idx]
                val incomingKey = dedupKey(row.timestamp, row.latitude, row.longitude)
                val cmp = compareDedupKey(incomingKey, dbKey)
                when {
                    cmp < 0 -> { unique.add(row); idx++ }
                    cmp == 0 -> { duplicates++; idx++; return@forEachLocationKeyInRange }
                    else -> return@forEachLocationKeyInRange
                }
            }
        }
        while (idx < sortedIncoming.size) {
            if (cancelled.get()) throw InterruptedException("Import cancelled")
            unique.add(sortedIncoming[idx])
            idx++
        }
        return unique to duplicates
    }

    private fun compareDedupKey(a: DedupKey, b: DedupKey): Int {
        if (a.ts != b.ts) return a.ts.compareTo(b.ts)
        if (a.latE6 != b.latE6) return a.latE6.compareTo(b.latE6)
        return a.lonE6.compareTo(b.lonE6)
    }

    internal fun detectFormat(sniff: String): ImportFormat? {
        val firstChar = sniff.firstOrNull { !it.isWhitespace() } ?: return null
        return when (firstChar) {
            '<' -> detectXmlFormat(sniff)
            '{' -> detectJsonFormat(sniff)
            else -> detectCsvFormat(sniff)
        }
    }

    private fun detectXmlFormat(sniff: String): ImportFormat? {
        val lower = sniff.lowercase()
        // No legitimate GPX/KML in the wild ships a DOCTYPE; refuse to dodge billion-laughs.
        if ("<!doctype" in lower) {
            throw UnsupportedFormatException("XML files with DOCTYPE declarations are not supported")
        }
        val afterDecl = lower.substringAfter("?>", lower)
        return when {
            Regex("<gpx[\\s>]").containsMatchIn(afterDecl) -> ImportFormat.GPX
            Regex("<kml[\\s>]").containsMatchIn(afterDecl) -> ImportFormat.KML
            else -> null
        }
    }

    // Inspect top-level JSON keys, not substrings - a foreign GeoJSON with a property
    // named "locations" would otherwise misdetect as Google Timeline.
    private fun detectJsonFormat(sniff: String): ImportFormat? {
        val keys = HashSet<String>()
        try {
            JsonReader(sniff.reader()).use { reader ->
                reader.isLenient = true
                if (reader.peek() != JsonToken.BEGIN_OBJECT) return null
                reader.beginObject()
                while (reader.hasNext()) {
                    keys.add(reader.nextName())
                    try {
                        reader.skipValue()
                    } catch (_: Exception) {
                        // Sniff is truncated mid-document; the keys collected so far are enough.
                        break
                    }
                }
            }
        } catch (_: Exception) {
        }

        return when {
            "locations" in keys -> ImportFormat.GOOGLE_TIMELINE_LEGACY
            "semanticSegments" in keys || "rawSignals" in keys -> ImportFormat.GOOGLE_TIMELINE_NEW
            "features" in keys && "type" in keys -> ImportFormat.GEOJSON
            else -> null
        }
    }

    private fun detectCsvFormat(sniff: String): ImportFormat? {
        val firstLine = sniff.lineSequence().firstOrNull { it.isNotBlank() } ?: return null
        if (!firstLine.contains(',')) return null
        val headerLower = firstLine.lowercase()
        val hasLat = "latitude" in headerLower || Regex("(^|,)\\s*lat\\s*(,|$)").containsMatchIn(headerLower)
        val hasLon = "longitude" in headerLower || Regex("(^|,)\\s*lon\\s*(,|$)").containsMatchIn(headerLower) ||
            Regex("(^|,)\\s*lng\\s*(,|$)").containsMatchIn(headerLower)
        val hasTime = "time" in headerLower || "timestamp" in headerLower
        return if (hasLat && hasLon && hasTime) ImportFormat.CSV else null
    }

    private fun openStream(contentResolver: ContentResolver, uri: Uri): InputStream =
        contentResolver.openInputStream(uri)
            ?: throw IllegalStateException("Could not open input stream for $uri")

    // Leaves `stream` positioned just past the sniffed bytes so the caller can prepend them.
    private fun readSniff(stream: InputStream): Pair<ByteArray, String> {
        val buf = ByteArray(SNIFF_BYTES)
        var total = 0
        while (total < buf.size) {
            val n = stream.read(buf, total, buf.size - total)
            if (n <= 0) break
            total += n
        }
        val trimmed = if (total == buf.size) buf else buf.copyOf(total)
        return trimmed to String(trimmed, Charsets.UTF_8)
    }

    internal fun dedupKey(ts: Long, lat: Double, lon: Double): DedupKey =
        DedupKey(ts, (lat * DEDUP_PRECISION).roundToLong(), (lon * DEDUP_PRECISION).roundToLong())
}

internal data class DedupKey(val ts: Long, val latE6: Long, val lonE6: Long)

data class PreviewResult(
    val format: ImportFormat,
    val totalParsed: Int,
    val invalid: Int,
    val duplicates: Int,
    val dateRangeStartSec: Long?,
    val dateRangeEndSec: Long?,
    val rowsToCommit: List<ImportRow>,
)

data class CommitOptions(
    val asQueued: Boolean = false,
    val endpoint: String = "",
    val isOfflineMode: Boolean = false,
    val fieldMap: Map<String, String> = emptyMap(),
    val customFields: Map<String, String> = emptyMap(),
    val apiFormat: ApiFormat = ApiFormat.FIELD_MAPPED,
)
