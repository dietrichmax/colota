/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

package com.Colota.data

import android.database.sqlite.SQLiteDatabase
import com.Colota.data.DatabaseHelper.Companion.CREATE_BOUNDARY_OVERRIDES_TABLE
import com.Colota.data.DatabaseHelper.Companion.CREATE_PROFILES_INDEX
import com.Colota.data.DatabaseHelper.Companion.DATABASE_VERSION
import com.Colota.data.DatabaseHelper.Companion.TABLE_GEOFENCES
import com.Colota.data.DatabaseHelper.Companion.TABLE_LOCATIONS
import com.Colota.data.DatabaseHelper.Companion.TABLE_PROFILES
import com.Colota.data.DatabaseHelper.Companion.TABLE_QUEUE
import com.Colota.util.AppLogger

object DatabaseMigrations {
    private const val TAG = "LocationDB"

    // Profiles table as introduced in v2, before activation_delay_seconds (added by the v6
    // migration). Frozen on purpose: the < 2 migration must create this older shape so the v6
    // ALTER adds the column without colliding. onCreate uses the latest CREATE_PROFILES_TABLE.
    private const val CREATE_PROFILES_TABLE_V2 = """
        CREATE TABLE IF NOT EXISTS $TABLE_PROFILES (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            interval_ms INTEGER NOT NULL,
            min_update_distance REAL NOT NULL,
            sync_interval_seconds INTEGER NOT NULL,
            priority INTEGER NOT NULL DEFAULT 0,
            condition_type TEXT NOT NULL,
            speed_threshold REAL,
            deactivation_delay_seconds INTEGER NOT NULL DEFAULT 30,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL
        )
    """

    // Run before the swap so a migration failure leaves the live DB untouched.
    fun migrateCandidate(candidateFile: java.io.File) {
        val db = SQLiteDatabase.openDatabase(
            candidateFile.absolutePath,
            null,
            SQLiteDatabase.OPEN_READWRITE,
        )
        try {
            // DELETE mode: migration writes go straight to main, not a -wal that the rename ignores.
            db.rawQuery("PRAGMA journal_mode=DELETE", null).use { it.moveToFirst() }

            val current = db.version
            if (current > DATABASE_VERSION) {
                throw IllegalStateException(
                    "Candidate schema $current is newer than app schema $DATABASE_VERSION"
                )
            }
            if (current < DATABASE_VERSION) {
                db.beginTransaction()
                try {
                    migrate(db, current, DATABASE_VERSION)
                    db.version = DATABASE_VERSION
                    db.setTransactionSuccessful()
                } finally {
                    db.endTransaction()
                }
            }
        } finally {
            db.close()
        }
    }

    internal fun migrate(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        AppLogger.i(TAG, "Migrating database from v$oldVersion to v$newVersion")
        if (oldVersion < 2) {
            db.execSQL(CREATE_PROFILES_TABLE_V2)
            db.execSQL(CREATE_PROFILES_INDEX)
        }
        if (oldVersion < 3) {
            db.execSQL("ALTER TABLE $TABLE_LOCATIONS ADD COLUMN sent INTEGER NOT NULL DEFAULT 0")
            db.execSQL("""
                UPDATE $TABLE_LOCATIONS SET sent = 1
                WHERE NOT EXISTS (
                    SELECT 1 FROM $TABLE_QUEUE
                    WHERE $TABLE_QUEUE.location_id = $TABLE_LOCATIONS.id
                )
            """.trimIndent())
        }
        if (oldVersion < 4) {
            db.execSQL("ALTER TABLE $TABLE_GEOFENCES ADD COLUMN pause_on_wifi INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE $TABLE_GEOFENCES ADD COLUMN pause_on_motionless INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE $TABLE_GEOFENCES ADD COLUMN motionless_timeout_minutes INTEGER NOT NULL DEFAULT 10")
        }
        if (oldVersion < 5) {
            db.execSQL("ALTER TABLE $TABLE_GEOFENCES ADD COLUMN heartbeat_enabled INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE $TABLE_GEOFENCES ADD COLUMN heartbeat_interval_minutes INTEGER NOT NULL DEFAULT 15")
        }
        if (oldVersion < 6) {
            db.execSQL("ALTER TABLE $TABLE_PROFILES ADD COLUMN activation_delay_seconds INTEGER NOT NULL DEFAULT 0")
            // Stationary profiles existed before this column with a fixed 60s detection window;
            // backfill that value so they keep behaving the same now that it is a stored field.
            db.execSQL("UPDATE $TABLE_PROFILES SET activation_delay_seconds = 60 WHERE condition_type = 'stationary'")
            db.execSQL("ALTER TABLE $TABLE_LOCATIONS ADD COLUMN note TEXT")
        }
        if (oldVersion < 7) {
            db.execSQL(CREATE_BOUNDARY_OVERRIDES_TABLE)
        }
        if (oldVersion < 8) {
            db.execSQL("ALTER TABLE $TABLE_PROFILES ADD COLUMN wifi_ssid TEXT")
        }
        if (oldVersion < 9) {
            db.execSQL("ALTER TABLE $TABLE_PROFILES ADD COLUMN bluetooth_address TEXT")
            db.execSQL("ALTER TABLE $TABLE_PROFILES ADD COLUMN bluetooth_name TEXT")
        }
    }
}
