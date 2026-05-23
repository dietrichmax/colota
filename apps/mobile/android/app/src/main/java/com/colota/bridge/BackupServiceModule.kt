/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.bridge

import android.content.Intent
import android.net.Uri
import android.os.StatFs
import android.provider.DocumentsContract
import com.Colota.backup.BackupBuilder
import com.Colota.backup.BackupException
import com.Colota.backup.BackupForegroundService
import com.Colota.backup.BackupOrphanCleanup
import com.Colota.backup.BackupPickerCoordinator
import com.Colota.backup.BackupRestorer
import com.Colota.backup.PasswordStrength
import com.Colota.data.DatabaseHelper
import com.Colota.data.SettingsKeys
import com.Colota.export.AutoExportScheduler
import com.Colota.export.AutoExportWorker
import com.Colota.service.LocationForegroundService
import com.Colota.util.AppLogger
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.UiThreadUtil
import androidx.work.WorkManager
import android.provider.OpenableColumns
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.withContext
import java.io.File
import java.util.Arrays

class BackupServiceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "BackupServiceModule"
        private const val PENDING_BACKUP_FILE = "pending_backup.colota"

        // Backup pipeline holds DB snapshot + zip + encrypted file simultaneously.
        private const val BACKUP_FREE_SPACE_MULTIPLIER = 3
        private const val BACKUP_FREE_SPACE_HEADROOM_BYTES = 50L * 1024 * 1024

        // Cloud DocumentsProviders (Drive, MTP) often don't expose OpenableColumns.SIZE.
        // Use this ceiling as the assumed size so an opaque multi-gigabyte file can't fill the cache mid-decrypt.
        private const val UNKNOWN_BACKUP_SIZE_CEILING_BYTES = 2L * 1024 * 1024 * 1024

        private const val SERVICE_STOP_TIMEOUT_MS = 5_000L
        private const val SERVICE_STOP_POLL_MS = 50L
    }

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val operationMutex = Mutex()
    private val pickerCoordinator = BackupPickerCoordinator(reactContext, scope)

    override fun getName() = "BackupServiceModule"

    override fun invalidate() {
        super.invalidate()
        pickerCoordinator.dispose()
        scope.cancel()
    }

    @ReactMethod
    fun pickBackupDestination(promise: Promise) {
        pickerCoordinator.pickDestination(promise)
    }

    @ReactMethod
    fun pickBackupSource(promise: Promise) {
        pickerCoordinator.pickSource(promise)
    }

    @ReactMethod
    fun passwordStrength(passwordCodes: ReadableArray, promise: Promise) {
        val passwordChars = readableArrayToCharArray(passwordCodes)
        try {
            val result = PasswordStrength.evaluate(passwordChars)
            val map = Arguments.createMap().apply {
                putInt("score", result.score)
                putString("label", result.label)
                putDouble("bits", result.bits)
            }
            promise.resolve(map)
        } finally {
            Arrays.fill(passwordChars, 0.toChar())
        }
    }

    // Password arrives as Array<Number> of UTF-16 code units so the JVM never holds
    // a non-wipeable String. Convert to CharArray immediately and wipe in finally.
    @ReactMethod
    fun createBackup(uriString: String, passwordCodes: ReadableArray, promise: Promise) {
        val passwordChars = readableArrayToCharArray(passwordCodes)
        if (passwordChars.size < PasswordStrength.MIN_LENGTH) {
            Arrays.fill(passwordChars, 0.toChar())
            promise.reject(
                "E_PASSWORD_TOO_SHORT",
                "Password must be at least ${PasswordStrength.MIN_LENGTH} characters",
            )
            return
        }
        if (!PasswordStrength.isAcceptable(passwordChars)) {
            Arrays.fill(passwordChars, 0.toChar())
            promise.reject(
                "E_PASSWORD_TOO_WEAK",
                "Password is too predictable. Use a longer or more random password.",
            )
            return
        }
        scope.launch {
            // Block until the orphan sweep finishes so it can't delete temp dirs we're about to create.
            BackupOrphanCleanup.awaitComplete()
            if (!operationMutex.tryLock()) {
                Arrays.fill(passwordChars, 0.toChar())
                promise.reject("E_BUSY", "Another backup or restore is in progress")
                return@launch
            }
            val pendingFile = File(reactApplicationContext.cacheDir, PENDING_BACKUP_FILE)
            var safCopyStarted = false
            val uri = Uri.parse(uriString)
            try {
                ensureFreeSpaceForBackup()

                startForegroundOnMain("Encrypting backup...")

                pendingFile.outputStream().use { out ->
                    BackupBuilder(reactApplicationContext).build(out, passwordChars)
                }

                // Stage locally first so a crash mid-encrypt doesn't leave a half-written SAF file.
                safCopyStarted = true
                val resolver = reactApplicationContext.contentResolver
                resolver.openOutputStream(uri, "wt")?.use { safOut ->
                    pendingFile.inputStream().use { it.copyTo(safOut) }
                } ?: throw IllegalStateException("Could not open output stream for $uriString")

                promise.resolve(true)
            } catch (e: Exception) {
                AppLogger.e(TAG, "createBackup failed", e)
                val cleanupOk = if (safCopyStarted) cleanupPartialSafBackup(uri) else true
                val baseMessage = e.message ?: "Backup failed"
                val message = if (cleanupOk) {
                    baseMessage
                } else {
                    "$baseMessage A partial backup file remains at the chosen location and should be deleted manually."
                }
                promise.reject(errorCode(e), message, e)
            } finally {
                pendingFile.delete()
                Arrays.fill(passwordChars, 0.toChar())
                BackupForegroundService.stop(reactApplicationContext)
                operationMutex.unlock()
            }
        }
    }

    @ReactMethod
    fun restoreBackup(uriString: String, passwordCodes: ReadableArray, promise: Promise) {
        val passwordChars = readableArrayToCharArray(passwordCodes)
        if (passwordChars.isEmpty()) {
            promise.reject("E_PASSWORD_EMPTY", "Password is required")
            return
        }
        scope.launch {
            BackupOrphanCleanup.awaitComplete()
            if (!operationMutex.tryLock()) {
                Arrays.fill(passwordChars, 0.toChar())
                promise.reject("E_BUSY", "Another backup or restore is in progress")
                return@launch
            }
            try {
                val uri = Uri.parse(uriString)
                ensureFreeSpaceForRestore(uri)

                startForegroundOnMain("Restoring backup...")

                pauseAllDbWriters()

                val input = reactApplicationContext.contentResolver.openInputStream(uri)
                    ?: throw IllegalStateException("Could not open input stream for $uriString")
                input.use { BackupRestorer(reactApplicationContext).restore(it, passwordChars) }

                // Swap is done; clear the writer block so the post-restore saveSetting can land on the new DB.
                DatabaseHelper.setRestoreInProgress(false)

                // Don't silently resume tracking on the destination device.
                DatabaseHelper.getInstance(reactApplicationContext)
                    .saveSetting(SettingsKeys.TRACKING_ENABLED, "false")

                promise.resolve(true)
            } catch (e: Exception) {
                AppLogger.e(TAG, "restoreBackup failed", e)
                promise.reject(errorCode(e), e.message ?: "Restore failed", e)
            } finally {
                Arrays.fill(passwordChars, 0.toChar())
                BackupForegroundService.stop(reactApplicationContext)
                DatabaseHelper.setRestoreInProgress(false)
                operationMutex.unlock()
            }
        }
    }

    // Called by JS after the success alert is dismissed so the alert isn't torn down by reload.
    @ReactMethod
    fun applyRestore(promise: Promise) {
        reloadReactNative()
        promise.resolve(true)
    }

    // Aborts the restore if a writer doesn't stop in time; a live writer racing the swap can corrupt the new DB.
    private suspend fun pauseAllDbWriters() {
        val ctx = reactApplicationContext
        val wm = WorkManager.getInstance(ctx.applicationContext)

        // Persist tracking-disabled to the live DB before gating writers so a later failure
        // here can't leave TRACKING_ENABLED=true with the service stopped, which would
        // resurrect tracking on next boot without the user knowing the restore aborted.
        DatabaseHelper.getInstance(ctx).saveSetting(SettingsKeys.TRACKING_ENABLED, "false")

        // Block JS-bridge writers before stopping native writers so the gap can't be back-filled.
        DatabaseHelper.setRestoreInProgress(true)

        try {
            AutoExportScheduler.cancel(ctx)
            // WorkManager auto-tags every request with the worker's class name; covers manual + alarm-fired paths.
            wm.cancelAllWorkByTag(AutoExportWorker::class.java.name)
        } catch (e: Exception) {
            AppLogger.w(TAG, "Failed to cancel work: ${e.message}")
        }

        ctx.stopService(Intent(ctx, LocationForegroundService::class.java))

        val deadline = System.currentTimeMillis() + SERVICE_STOP_TIMEOUT_MS
        while (
            (LocationForegroundService.isRunning || AutoExportWorker.isRunning)
            && System.currentTimeMillis() < deadline
        ) {
            delay(SERVICE_STOP_POLL_MS)
        }
        val stragglers = buildList {
            if (LocationForegroundService.isRunning) add("location service")
            if (AutoExportWorker.isRunning) add("auto-export worker")
        }
        if (stragglers.isNotEmpty()) {
            throw IllegalStateException(
                "Refusing to restore: ${stragglers.joinToString(", ")} still running " +
                        "after ${SERVICE_STOP_TIMEOUT_MS}ms"
            )
        }
    }

    private fun ensureFreeSpaceForRestore(uri: Uri) {
        val resolver = reactApplicationContext.contentResolver
        val backupSize = try {
            resolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst() && !cursor.isNull(0)) cursor.getLong(0) else -1L
            } ?: -1L
        } catch (e: Exception) {
            AppLogger.w(TAG, "Could not query backup file size: ${e.message}")
            -1L
        }

        // Fall back to a hard ceiling when the provider hides SIZE; otherwise an opaque
        // multi-GB file would skip this check and fill the cache partition mid-decrypt.
        val effectiveSize = if (backupSize > 0) backupSize else UNKNOWN_BACKUP_SIZE_CEILING_BYTES
        val needed = effectiveSize * 2 + BACKUP_FREE_SPACE_HEADROOM_BYTES
        val cacheDir = reactApplicationContext.cacheDir
        val available = StatFs(cacheDir.absolutePath).availableBytes
        if (available < needed) {
            val neededMb = needed / (1024 * 1024)
            val availableMb = available / (1024 * 1024)
            throw IllegalStateException(
                "Not enough free space for restore. Need ~${neededMb} MB, have ${availableMb} MB."
            )
        }
    }

    // Some OEM ROMs reject FGS starts from background threads.
    private suspend fun startForegroundOnMain(message: String) {
        withContext(Dispatchers.Main) {
            BackupForegroundService.start(reactApplicationContext, message)
        }
    }

    private fun reloadReactNative() {
        UiThreadUtil.runOnUiThread {
            try {
                val app = reactApplicationContext.applicationContext as? ReactApplication
                app?.reactHost?.reload("Backup restore")
            } catch (e: Exception) {
                AppLogger.e(TAG, "Failed to reload React Native after restore", e)
            }
        }
    }

    // Some SAF providers (Drive, MTP) refuse deleteDocument on CREATE_DOCUMENT URIs;
    // truncating to 0 bytes is better than leaving a partial blob that looks legitimate.
    // Returns true if the partial file was deleted or truncated, false if cleanup failed
    // and a partial blob is still on disk - the caller surfaces that to the user.
    private fun cleanupPartialSafBackup(uri: Uri): Boolean {
        val resolver = reactApplicationContext.contentResolver
        val deleted = try {
            DocumentsContract.deleteDocument(resolver, uri)
        } catch (e: Exception) {
            AppLogger.w(TAG, "deleteDocument threw: ${e.message}")
            false
        }
        if (deleted) return true

        return try {
            resolver.openOutputStream(uri, "wt")?.use { /* truncate to empty */ }
                ?.let { true }
                ?: run {
                    AppLogger.w(TAG, "Could not open SAF stream to truncate partial backup")
                    false
                }
        } catch (e: Exception) {
            AppLogger.w(TAG, "Could not truncate partial SAF backup: ${e.message}")
            false
        }
    }

    private fun ensureFreeSpaceForBackup() {
        val dbFile = reactApplicationContext.getDatabasePath(DatabaseHelper.DATABASE_NAME)
        val dbBytes = if (dbFile.exists()) dbFile.length() else 0L
        val needed = dbBytes * BACKUP_FREE_SPACE_MULTIPLIER + BACKUP_FREE_SPACE_HEADROOM_BYTES

        val cacheDir = reactApplicationContext.cacheDir
        val available = StatFs(cacheDir.absolutePath).availableBytes
        if (available < needed) {
            val neededMb = needed / (1024 * 1024)
            val availableMb = available / (1024 * 1024)
            throw IllegalStateException(
                "Not enough free space for backup. Need ~${neededMb} MB, have ${availableMb} MB."
            )
        }
    }

    private fun errorCode(e: Exception): String = when (e) {
        is BackupException -> "E_BACKUP_${e.error.name}"
        is IllegalStateException -> "E_BACKUP_PRECONDITION"
        else -> "E_BACKUP_UNKNOWN"
    }

}
