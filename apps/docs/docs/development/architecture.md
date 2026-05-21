---
sidebar_position: 1
---

# Architecture

Colota is a monorepo with three workspace packages:

```
colota/
├── apps/
│   ├── mobile/       # React Native + Kotlin Android app
│   └── docs/         # Docusaurus documentation site
└── packages/
    └── shared/       # Shared colors, typography, types
```

## Mobile App Stack

The mobile app has a **React Native** UI layer and **native Kotlin** modules for background GPS tracking.

```
┌─────────────────────────────────────────┐
│              React Native UI            │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │ Screens  │ │  Hooks   │ │ Context │ │
│  └────┬─────┘ └────┬─────┘ └────┬────┘ │
│       └─────────────┼────────────┘      │
│              NativeLocationService       │
│              (TypeScript bridge)         │
├─────────────────────────────────────────┤
│         React Native Bridge             │
├─────────────────────────────────────────┤
│            Native Kotlin Layer          │
│  ┌──────────────────────────────────┐   │
│  │    LocationServiceModule         │   │
│  │    (bridge entry point)          │   │
│  └──────────────┬───────────────────┘   │
│   ┌─────────────┼──────────────────┐    │
│   ▼             ▼                  ▼    │
│ ForegroundService  DatabaseHelper  ...  │
│ SyncManager        GeofenceHelper       │
│ NetworkManager     SecureStorage        │
└─────────────────────────────────────────┘
```

## Native Kotlin Modules

All native code lives in `apps/mobile/android/app/src/`, organized by build flavor:

- `src/main/java/com/colota/` - Shared code: `bridge/`, `service/`, `data/`, `sync/`, `util/`, `location/` (interface), `backup/`, `export/`
- `src/gms/java/com/colota/location/` - Google Play Services location provider
- `src/foss/java/com/colota/location/` - Native Android location provider

### Bridge Modules

Two React Native bridge modules are registered by `LocationServicePackage`: `LocationServiceModule` (the primary tracking-side bridge) and `BackupServiceModule` (the encrypted-backup bridge).

### LocationServiceModule

The primary React Native bridge module (exposed as `"LocationServiceModule"`). Handles all JS-to-native communication for:

- Service control (`startService`, `stopService`)
- Database queries (`getStats`, `getTableData`, `getLocationsByDateRange`, `getDaysWithData`, `getDailyStats`)
- Geofence CRUD operations
- Settings persistence
- Device info, file operations, authentication

Emits events back to JavaScript:

- `onLocationUpdate` - new GPS fix received
- `onTrackingStopped` - service stopped (user action or OOM kill)
- `onSyncError` - 3+ consecutive sync failures
- `onSyncProgress` - batch sync progress updates with `{sent, failed, total}`
- `onPauseZoneChange` - entered or exited a geofence pause zone
- `onProfileSwitch` - a tracking profile was activated or deactivated
- `onAutoExportComplete` - auto-export finished with `{success, fileName, rowCount, error}`

### BackupServiceModule

Second React Native bridge module (exposed as `"BackupServiceModule"`). Owns the encrypted backup pipeline end-to-end so the JS layer never touches credentials, the SQLite file, or the Argon2 key directly. JS-callable methods:

- `pickBackupDestination` / `pickBackupSource` - launches the Storage Access Framework picker (`ACTION_CREATE_DOCUMENT` / `ACTION_OPEN_DOCUMENT`); a single in-flight picker is enforced via a 5-minute timeout.
- `createBackup(uri, password)` - validates password strength, claims an operation mutex, runs `BackupBuilder` against a cacheDir-staged file, then atomically copies into the SAF destination. Stops promotion to a foreground service when finished.
- `restoreBackup(uri, password)` - cancels the location service and any auto-export work, polls until both stop, runs `BackupRestorer`, then forces `tracking_enabled=false` so the destination device doesn't auto-resume.
- `applyRestore` - JS calls this after the success dialog is dismissed; it triggers `reactHost.reload()` so all modules re-read state from the restored DB.

Both `createBackup` and `restoreBackup` await `BackupOrphanCleanup.awaitComplete()` before claiming the operation mutex, ensuring the launch-time orphan sweeper can't race active operations.

Errors are surfaced to JS as `E_BACKUP_<ERROR_NAME>` codes that map onto the `BackupError` enum (`WRONG_PASSWORD`, `BAD_MAGIC`, `UNSUPPORTED_VERSION`, `UNSUPPORTED_KDF`, `UNSUPPORTED_SCHEMA`, `MISSING_ENTRY`, `INTEGRITY_FAIL`, `TRUNCATED`, `TAMPERED`, `SECRETS_PARTIAL`).

### Backup Pipeline

Native-only modules in `backup/` package. The on-disk format is documented in `BackupFormat.kt`.

| Module | Purpose |
| --- | --- |
| `BackupCrypto` | Chunked AES-256-GCM encrypt/decrypt keyed by Argon2id. Each chunk binds the file header into its GCM AAD so any header tamper invalidates the first tag. Argon2 is deferred until the first ciphertext chunk arrives so wrong-password rejection costs no key derivation. |
| `BackupFormat` | On-disk layout constants, `BackupHeader` data class, `BackupError` enum, and `BackupException`. 76-byte header (magic, format version, KDF id, KDF params, 32-byte salt, 8-byte nonce prefix, chunk size, reserved) followed by length-prefixed ciphertext chunks and an end-marker + chunk-count footer. |
| `BackupBuilder` | Snapshots the SQLite database via `DatabaseHelper.snapshotTo` (uses `VACUUM INTO` on API 30+, file-copy with WAL checkpoint as fallback), runs `quick_check`, extracts secrets via `SecureStorageHelper.exportPlaintextForBackup()`, deflates everything into a zip, then streams it through `BackupCrypto.encrypt`. Picks Argon2 memory by `ActivityManager.isLowRamDevice` (32 MiB / 64 MiB). |
| `BackupRestorer` | Decrypts the file via a `PipedInputStream` into a `ZipInputStream`, extracts entries to a temp dir with bounded reads (zip-bomb defense), validates the manifest schema version, runs `PRAGMA integrity_check` on the candidate DB, calls `DatabaseHelper.migrateCandidate` to run any required migrations on the candidate, then atomically swaps the live DB via `DatabaseHelper.replaceLiveDatabase`, then re-imports secrets. A failed secrets commit is surfaced as `SECRETS_PARTIAL` so the UI can prompt the user to re-enter credentials. |
| `BackupForegroundService` | Notification-only foreground service shown during long backups/restores. Uses `FOREGROUND_SERVICE_TYPE_DATA_SYNC`. Holds no work itself - the actual encryption stays in `BackupServiceModule`'s coroutine so the password `CharArray` lives only on the heap, not in service state. |
| `BackupOrphanCleanup` | Singleton kicked off from `MainApplication.onCreate` on a daemon thread. Sweeps `cacheDir/backup_temp`, `cacheDir/restore_temp`, `cacheDir/pending_backup.colota`, and `<dbDir>/Colota.db.incoming` left behind by a process death mid-operation. Exposes a `CompletableDeferred` so `BackupServiceModule` can await completion before claiming the operation mutex. |
| `PasswordStrength` | Mirror of the JS-side `passwordStrength.ts`. Enforces the 12-character floor and ~50-bit entropy floor; sequential runs and `<4` distinct chars cap the score. |

### LocationProvider Abstraction

Location services are abstracted behind a `LocationProvider` interface (`location/LocationProvider.kt`), with flavor-specific implementations:

- **GMS** (`src/gms/`) - `GmsLocationProvider` wraps Google Play Services `FusedLocationProviderClient`
- **FOSS** (`src/foss/`) - `NativeLocationProvider` wraps Android's native `LocationManager` with `GPS_PROVIDER`

Each flavor provides a `LocationProviderFactory` that instantiates and returns the correct implementation at runtime. The service and bridge code in `src/main/` depends only on the `LocationProvider` interface, never on a concrete class.

### LocationForegroundService

An Android foreground service that runs continuously for GPS tracking. Manages:

- GPS location capture via the `LocationProvider` abstraction
- Pause zone detection (geofencing)
- Geofence entry delay - keeps recording for 3.5× the tracking interval before pausing on zone entry, logging real arrival points for backends like GeoPulse
- Anchor points - a synthetic location saved on zone exit as a clean start point for the departing trip, timestamped 1s before the first real GPS fix
- Battery critical shutdown (below 5% while discharging)
- Location accuracy filtering
- Stationary detection - pauses GPS after 60s without movement; resume is driven by the shared `MotionStateDetector` (accelerometer variance, with SIG_MOTION as a fast-path for sharp wake events). Suspended during entry delay and inside geofence pause zones.
- Queuing data for server sync

### NotificationHelper

Handles all notification logic for the tracking service:

- Channel creation and notification building
- Dynamic title: "Colota Tracking" by default, "Colota · ProfileName" when a tracking profile is active
- Status text generation (coordinates, sync status, pause zones)
- Throttled updates (10s minimum interval, 2m minimum movement)
- Deduplication to avoid unnecessary notification redraws

### DatabaseHelper

SQLite database singleton with five tables:

| Table               | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `locations`         | All recorded GPS locations                   |
| `queue`             | Locations pending upload                     |
| `settings`          | App configuration key-value pairs            |
| `geofences`         | Pause zone definitions                       |
| `tracking_profiles` | Condition-based tracking profile definitions |

Uses WAL (Write-Ahead Logging) mode and prepared statements for performance.

Three additional methods support the backup pipeline:

- `snapshotTo(destFile)` - produces a transactional copy of the live DB. Uses `VACUUM INTO` on API 30+; falls back to a file copy with a `wal_checkpoint(FULL)` on API 26-29.
- `migrateCandidate(file)` - runs schema migrations on a candidate file in `DELETE` journal mode before it is swapped in, so a migration failure leaves the live DB untouched.
- `replaceLiveDatabase(context, newDb)` - drains the live WAL via `wal_checkpoint(TRUNCATE)`, deletes the live `-wal`/`-shm`/`-journal` sidecars, then atomically moves the candidate into place. Handles `AtomicMoveNotSupportedException` by staging through an `<dbName>.incoming` file. Synchronizes with `getInstance()` so concurrent callers either see the old singleton or the new file.

### SyncManager

Orchestrates batch location uploads with:

- Configurable batch size (50 items per batch, 10 concurrent HTTP requests)
- Exponential backoff on failure
- Periodic sync scheduling
- Manual flush support

### NetworkManager

HTTP client. Validates endpoints, enforces HTTPS for public hosts, injects auth headers, caches connectivity checks, and detects unmetered connections, specific SSIDs and VPN status for sync condition filtering.

For mTLS-protected endpoints, builds the `HttpsURLConnection` with a custom `SSLSocketFactory` supplied by `ClientCertSslContextProvider` (per-instance, never `setDefaultSSLSocketFactory()` - the override is scoped to outbound location sync, not the whole process).

### ClientCertSslContextProvider

Builds the cached `SSLSocketFactory` used for mTLS. The key managers are supplied by `DynamicKeyManager` so the cert source can be swapped without rebuilding the SSL context; trust managers come from a `CompositeX509TrustManager` that layers an optional user-imported CA on top of Android's system roots. Includes a lazy migration: legacy PKCS12 + password material in `EncryptedSharedPreferences` (if any) is unwrapped into Android Keystore the first time the provider builds a factory or the Settings UI calls `runMigrationIfNeeded`. Legacy storage is wiped only on permanent failures (bad blob, wrong password, PKCS12-shape errors); transient failures (AndroidKeyStore unavailable, OOM) leave legacy data so the next request can retry.

### DynamicKeyManager

`X509KeyManager` that resolves the active client cert at TLS handshake time from one of two sources: an alias stored in Android's system **KeyChain** (private key stays in the OS / hardware, app never sees the bytes) or a `.p12`-imported entry in **Android Keystore** (key sealed under the app's UID, hardware-backed where available). The resolved alias is cached and invalidated alongside the `SSLSocketFactory` cache, so cert swaps take effect on the next request without an app restart.

### CompositeX509TrustManager

`X509TrustManager` that accepts a server chain if **any** delegate accepts it. Used to layer a user-imported private CA on top of the system trust store without losing system CA validation - additive trust, not pinning.

### GeofenceHelper

Manages pause zones using the **haversine formula** for distance calculations. Reads geofences directly from SQLite on each lookup.

Each geofence supports three independent GPS pause modes, configured per zone:

- **Pause tracking** - Stops saving and syncing locations inside the zone. GPS continues running to detect exit.
- **WiFi pause** - Stops GPS entirely when connected to an unmetered network (WiFi/Ethernet). Implemented via `ConnectivityManager.NetworkCallback`, which fires immediately on network availability changes. An active network counter handles devices with multiple simultaneous unmetered networks - GPS only resumes once all of them are gone, after a short debounce.
- **Motionless pause** - Stops GPS after the device has been still for the configured per-zone dwell window (default 1 minute). Stillness is detected by `RawSensorMotionDetector` (batched accelerometer variance + parallel SIG_MOTION); any motion above the variance threshold resets the timer. The same detector fires GPS resume when movement returns.

A per-zone **stationary heartbeat** can send periodic location updates while paused. It sends the geofence center as a synthetic anchor point - no GPS wake required - bypassing sync conditions. Configured via `heartbeatEnabled` and `heartbeatIntervalMinutes` per geofence.

When both WiFi and motionless pause are enabled, GPS only resumes when both conditions clear - WiFi disconnected **and** motion detected. Changes made in the editor take effect immediately even when already inside the zone, via `applyZoneSettingsIfChanged` on the next zone recheck.

### ProfileManager

Evaluates tracking profile conditions and switches GPS settings automatically. Supports five condition types: charging, Android Auto / car mode, speed above threshold, speed below threshold, and stationary. Uses a rolling speed buffer for averaged speed readings, deactivation delays (hysteresis) to prevent rapid toggling, and priority-based resolution when multiple profiles match.

### ProfileHelper

Database access layer for tracking profiles and trip events. Maintains a `TimedCache` of enabled profiles (30s TTL) and provides CRUD operations plus trip event logging.

### ConditionMonitor

Monitors charging state via `BroadcastReceiver` and Android Auto connection via the `CarConnection` API. Forwards state changes to `ProfileManager` for condition evaluation.

### ProfileConstants

Centralized constants for condition type strings (`charging`, `android_auto`, `speed_above`, `speed_below`, `stationary`), event types (`activated`, `deactivated`), cache TTL, speed buffer size, and minimum interval.

### SecureStorageHelper

Wraps Android's `EncryptedSharedPreferences` for encrypted credential storage (AES-256-GCM for values, AES-256-SIV for keys). Stores Basic Auth passwords, Bearer tokens, custom headers, and the user-imported server CA (public cert, no key material). Client certificate private keys live in Android Keystore instead, not here - see `ClientCertSslContextProvider`.

For backups, two `internal` methods support the export/import flow without exposing plaintext secrets to other modules:

- `exportPlaintextForBackup()` - returns the BACKED_UP_KEYS as a `Map<String, String>` for inclusion in the encrypted backup container.
- `importPlaintextFromBackup(secrets)` - clears all BACKED_UP_KEYS then writes the new map in a single sync `commit()`. Throws on commit failure so the restore path can report `SECRETS_PARTIAL`.

### Other Modules

| Module | Purpose |
| --- | --- |
| `LocationBootReceiver` | Auto-restarts tracking after device reboot |
| `MotionStateDetector` / `RawSensorMotionDetector` | Single detector behind a `MotionState { STATIONARY, MOVING }` interface. Backed by 30s-batched accelerometer variance (hysteresis: > 0.30 m/s² for 3s -> MOVING; < 0.15 m/s² for the configured per-zone dwell -> STATIONARY) and parallel `TYPE_SIGNIFICANT_MOTION` as a fast-path for sharp events. Fans out to both motionless-pause and stationary-profile exit consumers via one callback site in `LocationForegroundService.onMotionStateChange`. |
| `DeviceInfoHelper` | Device metadata and battery status with caching |
| `FileOperations` | File I/O, sharing via FileProvider, and clipboard access |
| `PayloadBuilder` | Builds JSON payloads with dynamic field mapping |
| `ServiceConfig` | Centralized configuration data class |
| `TimedCache` | Generic TTL cache used for queue count, device info, profiles, and network state |
| `BuildConfigModule` | Exposes build constants (SDK versions, app version) to JS |
| `AppLogger` | Centralized logger - always active, all tags prefixed with `Colota.` for logcat filtering |
| `AutoExportWorker` | WorkManager `CoroutineWorker` enqueued by `AutoExportAlarmReceiver` - performs the export (chunked writes, foreground service, retries, retention cleanup) and re-arms the next alarm in `finally` |
| `AutoExportAlarmReceiver` | Broadcast receiver fired by AlarmManager at the configured time - hands off to `AutoExportWorker` because the receiver's 10s budget can't run an export |
| `AutoExportScheduler` | Arms `AlarmManager.setAndAllowWhileIdle` for the next configured wall-clock time. Called on enable, after each worker run, after schedule edits and on boot |
| `AutoExportConfig` | Typed data class wrapping auto-export settings (interval, time-of-day, weekday, day-of-month, enabledAt) from the SQLite settings table with validation, `isExportDue()` and `nextExportTimestamp()` |
| `ExportConverters` | Native Kotlin export converters (CSV, GeoJSON, GPX, KML) with in-memory, streaming, and file-based (`exportToFile`) interfaces |
| `ShortcutHandlerActivity` | Handles app shortcut intents (start/stop tracking) without showing UI - reads config from DB via `ServiceConfig.fromDatabase()` and dispatches to `LocationForegroundService` |

## React Native Layer

### Screens

| Screen | Purpose |
| --- | --- |
| `DashboardScreen` | Live map with tracking controls, coordinates, database stats, geofence and profile status |
| `SettingsScreen` | Hub with stats card and navigation to Connection, Tracking & Sync, API Field Mapping, Tracking Profiles, Appearance and data/about screens |
| `ConnectionScreen` | Server endpoint URL, offline mode toggle and connection test |
| `TrackingSyncScreen` | GPS interval, distance filter, accuracy threshold and sync strategy preset |
| `AppearanceScreen` | Light/dark theme, unit system, time format and custom map tile URLs (light and dark) |
| `ApiSettingsScreen` | Endpoint URL, HTTP method, field mapping with backend templates |
| `AuthSettingsScreen` | Authentication method (None, Basic Auth, Bearer Token) and custom HTTP headers, with a link row to mTLS Settings |
| `MtlsSettingsScreen` | Client certificate (PKCS12 import + Android Keystore storage) and Trusted Server CA management |
| `GeofenceScreen` | Create, edit, and delete pause zones on an interactive map |
| `GeofenceEditorScreen` | Configure a zone: name, radius, record pause, WiFi pause, motionless pause and timeout, stationary heartbeat |
| `TrackingProfilesScreen` | List and manage condition-based tracking profiles |
| `ProfileEditorScreen` | Create/edit a profile's name, condition, GPS settings, priority, and deactivation delay |
| `LocationInspectorScreen` | Calendar day picker with activity dots, map tab with trip-colored tracks, trips tab with trip cards and export |
| `TripDetailScreen` | Full trip view with dedicated map, stats grid, speed and elevation profile charts, per-trip export, and per-trip delete |
| `LocationSummaryScreen` | Aggregated stats for selectable periods (week/month/30 days) with daily breakdown and tap-to-inspect navigation |
| `ExportDataScreen` | Export all tracked locations via native streaming converters as CSV, GeoJSON, GPX, or KML |
| `AutoExportScreen` | Configure scheduled auto-export: directory, format, frequency, time of day, weekday or day-of-month, export range and file retention |
| `OfflineMapsScreen` | Download and manage offline map areas - interactive bounding box picker, size estimate, progress tracking, and area deletion |
| `DataManagementScreen` | Clear sent history, delete old data, vacuum database, sync controls |
| `BackupRestoreScreen` | Create or restore a password-encrypted `.colota` archive of all data, with strength meter and no-recovery confirmation |
| `SetupImportScreen` | Confirmation screen for `colota://setup` deep link imports |
| `ActivityLogScreen` | In-app log viewer with level filtering, search, and export |
| `AboutScreen` | App version, device info, links to repository and privacy policy |

### Services

| Service | Purpose |
| --- | --- |
| `NativeLocationService` | TypeScript bridge to the native `LocationServiceModule` with typed methods for all native operations |
| `LocationServicePermission` | Sequential Android permission requests (fine location → background location → notifications → battery exemption) |
| `ProfileService` | Thin wrapper over `NativeLocationService` for tracking profile CRUD and trip event queries |
| `SettingsService` | Bridges UI state to native SQLite with type conversion (seconds↔ms, objects↔JSON) |
| `BackupService` | Thin TypeScript wrapper over the native `BackupServiceModule` exposing `pickBackupDestination`, `pickBackupSource`, `createBackup`, `restoreBackup`, `applyRestore`. Surfaces typed `BackupErrorCode` strings for screen-side messaging |
| `modalService` | Centralized alert and confirm dialogs via `showAlert()` and `showConfirm()` |

### Map Components

The app uses [MapLibre GL Native](https://github.com/maplibre/maplibre-react-native) (`@maplibre/maplibre-react-native`) for GPU-accelerated map rendering. The default tile server is a self-hosted instance at `maps.mxd.codes` serving OpenMapTiles-compatible vector tiles. A custom tile server URL can be configured in Settings - see the [tile server guide](../guides/tile-server.md). No API tokens required. Fully FOSS-compatible.

| Component | Purpose |
| --- | --- |
| `ColotaMapView` | Shared base map component wrapping MapLibre's `MapView` with OpenFreeMap vector tiles, dark mode style transformation, custom compass, and attribution |
| `DashboardMap` | Live tracking map with user marker, accuracy circle, today's track overlay with toggle button, geofence polygons with labels, auto-center, and center button |
| `TrackMap` | Location history map with trip-colored track segments, tappable point markers with detail popups, fit-to-track bounds, and trip legend |
| `CalendarPicker` | Day picker with month navigation, dot indicators for days with data, and daily distance/count display |
| `TripList` | Segmented trip cards with distance, duration, avg speed, elevation gain/loss, and per-trip or bulk export |
| `GeofenceLayers` | Shared geofence rendering (fill polygons, stroke outlines, labels) used by DashboardMap and GeofenceScreen |
| `UserLocationOverlay` | User position dot with accuracy circle, used by DashboardMap and GeofenceScreen |
| `MapCenterButton` | Reusable button overlay to re-center the map |

`OfflinePackManager.ts` handles the offline maps feature:

| Export | Purpose |
| --- | --- |
| `createOfflinePack` | Creates a MapLibre offline pack for a bounding box at z8-14 |
| `loadOfflineAreas` | Fetches all stored packs from MapLibre's `OfflineManager` and returns status info (size, complete, active) |
| `deleteOfflineArea` | Unsubscribes, pauses, and deletes a pack; resets the tile database when the last pack is removed to reclaim OS storage |
| `willExceedTileLimit` | Estimates whether an area would hit the 100k-tile cap before downloading |
| `estimateSizeLabel` / `estimateSizeBytes` | Pre-download size estimates using per-zoom tile counting and per-tile byte averages |
| `loadOfflineAreaBounds` / `saveOfflineAreaBounds` / `removeOfflineAreaBounds` | Persist area metadata (center, radius) to the native SQLite settings table |

Supporting utilities in `mapUtils.ts`:

| Utility | Purpose |
| --- | --- |
| `lerpColor` | Linearly interpolates between two hex colors by factor `t` - used by `getSpeedColor` |
| `getSpeedColor` | Returns a theme-aware color for a given speed (m/s) using green→yellow→red interpolation |
| `createCirclePolygon` | Generates a 64-point GeoJSON `Polygon` approximating a circle on Earth's surface (for meter-based geofence radius) |
| `buildTrackSegmentsGeoJSON` | Creates per-segment `LineString` features with pre-computed speed colors for data-driven styling |
| `buildTrackPointsGeoJSON` | Creates `Point` features with speed, timestamp, accuracy, and altitude properties |
| `buildGeofencesGeoJSON` | Creates fill polygons and label points for geofence visualization |
| `computeTrackBounds` | Computes the bounding box for a set of track locations |
| `darkifyStyle` | Transforms OpenFreeMap vector style JSON into a dark theme variant by overriding paint properties |

### Utils

| Utility | Purpose |
| --- | --- |
| `logger` | Environment-aware logging - suppresses debug/info console output in production via `__DEV__`, always logs warn/error to console. All levels are always captured in a ring buffer (2000 entries) for the Activity Log screen |
| `geo` | Haversine distance, speed/distance/duration/time formatting with configurable unit system (metric/imperial) and time format (12h/24h), auto-detected from locale on first use |
| `exportConverters` | Converts location data to CSV, GeoJSON, GPX, and KML export formats (flat and trip-aware variants) |
| `trips` | Trip segmentation via time-gap detection (15-min threshold) with distance computation, trip stats (avg speed, elevation gain/loss), and trip color assignment |
| `queueStatus` | Maps sync queue size to color indicators for the dashboard |
| `settingsValidation` | URL validation and security checks for endpoint configuration |

### Hooks

| Hook                  | Purpose                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `useLocationTracking` | Manages the foreground service lifecycle, native event subscriptions, and location state |
| `useTheme`            | Provides theme colors, mode, and toggle from ThemeProvider context                       |
| `useAutoSave`         | Debounced auto-save pattern for settings screens                                         |
| `useTimeout`          | Managed timeout with automatic cleanup on unmount                                        |

### State Management

The app uses React Context for global state:

- **ThemeProvider** - Light/dark theme with system preference sync
- **TrackingProvider** - Single source of truth for tracking state, coordinates, settings, and active profile name. Hydrates from SQLite on mount, restores the active profile from the running service on reconnect, and persists changes back through `SettingsService`.

### Data Flow

```
User taps "Start" → TrackingProvider.startTracking()
  → NativeLocationService.start(config)
    → LocationServiceModule.startService(config)
      → LocationForegroundService starts
        → GPS fix received
          → DatabaseHelper.saveLocation()
          → SyncManager.queueAndSend()
            → NetworkManager.sendToEndpoint()
          → LocationServiceModule emits "onLocationUpdate"
            → NativeEventEmitter → useLocationTracking → UI updates
```

## Shared Package

`packages/shared` is the single source of truth for:

- **Colors** - `lightColors` and `darkColors` objects with all theme colors
- **Typography** - `fontFamily` ("Inter") and `fontSizes` scale
- **Types** - `ThemeColors` interface and `ThemeMode` type

Both the mobile app and docs site import from `@colota/shared`. The package compiles TypeScript to `dist/` via `tsc` so Docusaurus can consume it without a custom webpack loader.
