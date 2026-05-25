/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.bridge

import android.net.Uri
import com.Colota.data.DatabaseHelper
import com.Colota.importer.CommitOptions
import com.Colota.importer.ImportFormat
import com.Colota.importer.ImportRow
import com.Colota.importer.LocationImporter
import com.Colota.importer.PreviewResult
import com.Colota.importer.UnsupportedFormatException
import com.Colota.service.ServiceConfig
import com.Colota.sync.PayloadBuilder
import com.Colota.util.AppLogger
import com.Colota.util.SafPickerCoordinator
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import java.util.concurrent.atomic.AtomicBoolean

class ImportServiceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "ImportServiceModule"
        private const val REQUEST_PICK_IMPORT = 9201

        // A large Google Timeline preview can hold 80+ MB of parsed rows on the instance;
        // discard if the user walks away without committing.
        private const val STASH_TTL_MS = 15L * 60_000L

        // Bare type stays "*/*" because some SAF providers honour EXTRA_MIME_TYPES strictly
        // and refuse `.geojson` / `.gpx` without the wildcard. Including "*/*" here would
        // defeat the hint.
        private val IMPORT_MIME_TYPES = arrayOf(
            "application/json",
            "application/geo+json",
            "application/gpx+xml",
            "application/vnd.google-earth.kml+xml",
            "application/xml",
            "text/xml",
            "text/csv",
            "application/octet-stream",
            "text/plain",
        )
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val operationMutex = Mutex()
    private val pickerCoordinator = SafPickerCoordinator(reactApplicationContext, scope)

    // Guards both pendingImportRows and stashTimeoutJob; parse runs outside the lock,
    // only the assignment crosses it.
    private val stashLock = Any()
    private var pendingImportRows: List<ImportRow>? = null
    private var stashTimeoutJob: Job? = null
    private val importCancelled = AtomicBoolean(false)

    override fun getName() = "ImportServiceModule"

    override fun invalidate() {
        super.invalidate()
        pickerCoordinator.dispose()
        importCancelled.set(true)
        clearStash()
        scope.cancel()
    }

    @ReactMethod
    fun pickImportSource(promise: Promise) {
        pickerCoordinator.pickOpenDocument(
            mime = "*/*",
            extraMimes = IMPORT_MIME_TYPES,
            requestCode = REQUEST_PICK_IMPORT,
            promise = promise,
        )
    }

    @ReactMethod
    fun importLocationsFromFile(uriString: String, promise: Promise) {
        scope.launch {
            if (!operationMutex.tryLock()) {
                promise.reject("E_BUSY", "Another import is already in progress")
                return@launch
            }
            try {
                // Reset inside the mutex so a stray cancelImport can't flip the flag back
                // to true between unlock and this set.
                importCancelled.set(false)
                val uri = Uri.parse(uriString)
                val db = DatabaseHelper.getInstance(reactApplicationContext)
                val preview = LocationImporter.preview(
                    contentResolver = reactApplicationContext.contentResolver,
                    uri = uri,
                    db = db,
                    cancelled = importCancelled,
                )
                stash(preview.rowsToCommit)
                promise.resolve(previewToMap(preview, db))
            } catch (e: InterruptedException) {
                clearStash()
                promise.reject("E_IMPORT_CANCELLED", "Import cancelled")
            } catch (e: UnsupportedFormatException) {
                clearStash()
                AppLogger.w(TAG, "Unsupported import format: ${e.message}")
                promise.reject("E_IMPORT_UNSUPPORTED", e.message ?: "Unsupported file format")
            } catch (e: Exception) {
                clearStash()
                AppLogger.e(TAG, "Import preview failed", e)
                promise.reject("E_IMPORT_FAILED", e.message ?: "Import failed", e)
            } finally {
                operationMutex.unlock()
            }
        }
    }

    @ReactMethod
    fun commitImport(asQueued: Boolean, promise: Promise) {
        scope.launch {
            if (!operationMutex.tryLock()) {
                promise.reject("E_BUSY", "Another import is already in progress")
                return@launch
            }
            try {
                val rows = synchronized(stashLock) { pendingImportRows }
                if (rows == null) {
                    promise.reject("E_IMPORT_NO_PENDING", "No import to commit. Pick a file first.")
                    return@launch
                }
                val db = DatabaseHelper.getInstance(reactApplicationContext)
                if (asQueued && !canQueueForSync(db)) {
                    promise.reject(
                        "E_IMPORT_SYNC_UNAVAILABLE",
                        "Cannot queue imports for sync: no endpoint configured or offline mode is on",
                    )
                    return@launch
                }
                val options = buildCommitOptions(db, asQueued)
                val inserted = LocationImporter.commit(db, rows, options)
                clearStash()
                promise.resolve(inserted)
            } catch (e: Exception) {
                AppLogger.e(TAG, "commitImport failed", e)
                promise.reject("E_IMPORT_FAILED", e.message ?: "Import commit failed", e)
            } finally {
                operationMutex.unlock()
            }
        }
    }

    @ReactMethod
    fun cancelImport(promise: Promise) {
        // Signal then clear: covers both an in-flight parse and the case where the parse
        // already finished and we're racing with its staged-rows assignment.
        importCancelled.set(true)
        clearStash()
        promise.resolve(true)
    }

    private fun stash(rows: List<ImportRow>) {
        synchronized(stashLock) {
            pendingImportRows = rows
            stashTimeoutJob?.cancel()
            // Identity-check self on expiry so a newer stash replacing this job isn't cleared.
            stashTimeoutJob = scope.launch {
                val self = coroutineContext[Job]
                delay(STASH_TTL_MS)
                synchronized(stashLock) {
                    if (stashTimeoutJob === self) {
                        AppLogger.w(
                            TAG,
                            "Import stash expired without commit, discarding ${pendingImportRows?.size ?: 0} rows",
                        )
                        pendingImportRows = null
                        stashTimeoutJob = null
                    }
                }
            }
        }
    }

    private fun clearStash() {
        synchronized(stashLock) {
            pendingImportRows = null
            stashTimeoutJob?.cancel()
            stashTimeoutJob = null
        }
    }

    private fun previewToMap(preview: PreviewResult, db: DatabaseHelper) = Arguments.createMap().apply {
        putString("format", formatToWireName(preview.format))
        putInt("totalParsed", preview.totalParsed)
        putInt("invalid", preview.invalid)
        putInt("duplicates", preview.duplicates)
        putInt("newRows", preview.rowsToCommit.size)
        if (preview.dateRangeStartSec != null) {
            putDouble("dateRangeStartSec", preview.dateRangeStartSec.toDouble())
        } else {
            putNull("dateRangeStartSec")
        }
        if (preview.dateRangeEndSec != null) {
            putDouble("dateRangeEndSec", preview.dateRangeEndSec.toDouble())
        } else {
            putNull("dateRangeEndSec")
        }
        // Reflects DB state at preview time; checked again on commit.
        putBoolean("canQueueForSync", canQueueForSync(db))
    }

    private fun canQueueForSync(db: DatabaseHelper): Boolean {
        val config = ServiceConfig.fromDatabase(db)
        return !config.isOfflineMode && config.endpoint.isNotBlank()
    }

    private fun buildCommitOptions(db: DatabaseHelper, asQueued: Boolean): CommitOptions {
        if (!asQueued) return CommitOptions(asQueued = false)
        val config = ServiceConfig.fromDatabase(db)
        return CommitOptions(
            asQueued = true,
            endpoint = config.endpoint,
            isOfflineMode = config.isOfflineMode,
            fieldMap = PayloadBuilder.parseFieldMap(config.fieldMap).orEmpty(),
            customFields = PayloadBuilder.parseCustomFields(config.customFields).orEmpty(),
            apiFormat = config.apiFormat,
        )
    }

    private fun formatToWireName(format: ImportFormat): String = when (format) {
        ImportFormat.GEOJSON -> "geojson"
        ImportFormat.GOOGLE_TIMELINE_LEGACY -> "google_timeline_legacy"
        ImportFormat.GOOGLE_TIMELINE_NEW -> "google_timeline_new"
        ImportFormat.GPX -> "gpx"
        ImportFormat.KML -> "kml"
        ImportFormat.CSV -> "csv"
    }
}
