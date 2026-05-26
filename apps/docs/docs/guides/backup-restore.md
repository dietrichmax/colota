---
sidebar_position: 3
---

# Backup & Restore

Bundle your locations, settings and credentials into a single password-encrypted file you can store anywhere - cloud drive, USB stick, another device.

Use this when you want a full archive of your data, when you're moving to a new device, or as insurance before clearing data. For day-to-day analysis or sharing tracks, use [Data Export](data-export.md) instead. If you only need to **merge** locations from another file into your existing history without overwriting, use [Data Import](data-import.md) - that path is additive with duplicate-skipping, while Restore here is replace-everything.

## What's Included

| Included | Excluded |
| --- | --- |
| Location history (the full SQLite database) | mTLS client certificate (private key in OS keystore - re-import the `.p12` after restore) |
| Settings (sync, GPS, server, appearance) | Offline map tiles (re-download after restore) |
| Geofences and tracking profiles | Cached map tiles |
| Auth credentials (Basic, Bearer, custom headers) |  |
| mTLS Trusted Server CA (public cert bytes) |  |

The auth credentials Colota uses to reach your tracking endpoint (Basic Auth, Bearer token, custom headers) are stored as plaintext inside the encrypted container - they are protected by the backup password, not by the device's hardware-backed key. The leaked credentials let an attacker do whatever your server lets those credentials do. If you configured Colota with a credential limited to writing location data, that's all an attacker gets. If you used a credential tied to a user with broader privileges, or any token with more scope than posting locations requires, the attacker inherits that scope. Configure Colota with the minimum permission its endpoint actually needs. On restore the credentials are rewrapped under the destination device's key.

## Creating a Backup

1. Go to **Settings → Backup & Restore**
2. Enter a password (12 characters minimum) and confirm it
3. Wait for the strength meter to reach at least **OK**
4. Tap **Create backup**
5. Acknowledge the no-recovery warning
6. Choose where to save the `.colota` file

The app encrypts the file as it writes. You can leave the screen and the backup keeps running in the foreground until it finishes; a notification shows progress.

### Password Requirements

- **12 characters minimum** (hard limit)
- **~50 bits of entropy minimum** (soft strength meter)
- Sequences like `abcd` and `1234` cap the score, as do passwords with fewer than 4 distinct characters

A random 16-character password from a password manager, or a 4-5 word passphrase, both clear the bar comfortably. Common words and short tweaks of dictionary words do not.

:::warning[No password recovery]

No password recovery If you lose the password, the backup cannot be opened. Ever. There is no recovery code, no email reset, no developer override. Store the password somewhere you trust before you create the backup.

:::

## Restoring from a Backup

:::danger[Data will be overwritten]

Replaces all current data Restoring overwrites every location, setting, geofence and credential currently on the device. There is no merge mode and no undo. Take a backup of the current device first if you might want to roll back.

:::

1. Go to **Settings → Backup & Restore**
2. Tap **Choose backup file** and pick the `.colota` file
3. Enter the backup password when prompted
4. Confirm the replace warning
5. The app pauses tracking, swaps the database and restarts itself
6. Re-enable tracking from the Home screen when you're ready

### What Gets Paused

To swap the database safely, the restore stops the location tracking service and any in-flight auto-export. If a writer can't be stopped within ~5 seconds the restore aborts before touching your data.

After restore, tracking is left **off** so the new device doesn't silently start uploading on the old credentials. Re-enable it when you've checked the data is correct.

## Compatibility

| Source backup schema   | Destination app schema | Result                         |
| ---------------------- | ---------------------- | ------------------------------ |
| Same as destination    | -                      | Direct restore                 |
| Older than destination | -                      | Restored, then auto-migrated   |
| Newer than destination | -                      | Refused - update the app first |

Backups are forward-compatible (open in the same or newer app version) but not backward-compatible. If you upgraded recently and need to restore an older backup, just install the latest version.

## File Format

| Property  | Value                      |
| --------- | -------------------------- |
| Extension | `.colota`                  |
| MIME type | `application/octet-stream` |

Each file is authenticated end-to-end with a key derived from your password. Wrong password, a flipped byte, or truncation all fail to open. The format and implementation live in [`BackupFormat.kt`](https://github.com/dietrichmax/colota/blob/main/apps/mobile/android/app/src/main/java/com/colota/backup/BackupFormat.kt) and [`BackupCrypto.kt`](https://github.com/dietrichmax/colota/blob/main/apps/mobile/android/app/src/main/java/com/colota/backup/BackupCrypto.kt) if you want to verify.

## Failure Modes

| Error message                               | Cause                                                     |
| ------------------------------------------- | --------------------------------------------------------- |
| Incorrect password, or corrupted near start | Wrong password, or the first chunk has been tampered with |
| This file is not a Colota backup            | Magic bytes don't match - file is something else          |
| Made with a newer version of Colota         | Schema is ahead of the installed app                      |
| Backup file is corrupted / incomplete       | Mid-file tamper or truncation                             |
| Backup file is missing required data        | Container is missing the database or manifest entry       |
| Credentials could not be applied            | Database restored, but credential write failed            |

If a backup fails mid-encrypt, the app deletes the partial `.colota` file at the destination. If that cleanup fails (some cloud providers reject delete on freshly-created files), the error message tells you to delete it manually.

## Storage Reference

A backup is roughly the size of your SQLite database after deflate compression (typically 30-60% of the raw DB size). Use the [Data Management](data-management.md) screen to see the current database size before backing up.
