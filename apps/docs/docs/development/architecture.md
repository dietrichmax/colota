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

- `src/main/java/com/colota/` - Shared code: `bridge/`, `service/`, `data/`, `sync/`, `util/`, `location/` (interface)
- `src/gms/java/com/colota/location/` - Google Play Services location provider
- `src/foss/java/com/colota/location/` - Native Android location provider

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

### LocationProvider Abstraction

Location services are abstracted behind a `LocationProvider` interface (`location/LocationProvider.kt`), with flavor-specific implementations:

- **GMS** (`src/gms/`) - `GmsLocationProvider` wraps Google Play Services `FusedLocationProviderClient`
- **FOSS** (`src/foss/`) - `NativeLocationProvider` wraps Android's native `LocationManager` with `GPS_PROVIDER` and `NETWORK_PROVIDER` fallback

Each flavor provides a `LocationProviderFactory` that instantiates and returns the correct implementation at runtime. The service and bridge code in `src/main/` depends only on the `LocationProvider` interface, never on a concrete class.

### LocationForegroundService

An Android foreground service that runs continuously for GPS tracking. Manages:

- GPS location capture via the `LocationProvider` abstraction
- Pause zone detection (geofencing)
- Anchor points - synthetic locations at geofence centers on zone enter/exit for clean track endpoints
- Battery critical shutdown (below 5% while discharging)
- Location accuracy filtering
- Stationary detection - pauses GPS after 60s without movement and arms `MotionDetector` to resume on motion
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

### SyncManager

Orchestrates batch location uploads with:

- Configurable batch size (50 items per batch, 10 concurrent HTTP requests)
- Exponential backoff on failure
- Periodic sync scheduling
- Manual flush support

### NetworkManager

HTTP client. Validates endpoints, enforces HTTPS for public hosts, injects auth headers, caches connectivity checks, and detects unmetered connections for Wi-Fi only sync.

### GeofenceHelper

Manages pause zones using the **haversine formula** for distance calculations. Maintains an in-memory cache of geofences that invalidates on CRUD changes.

### ProfileManager

Evaluates tracking profile conditions and switches GPS settings automatically. Supports four condition types: charging, Android Auto / car mode, speed above threshold, and speed below threshold. Uses a rolling speed buffer for averaged speed readings, deactivation delays (hysteresis) to prevent rapid toggling, and priority-based resolution when multiple profiles match.

### ProfileHelper

Database access layer for tracking profiles and trip events. Maintains a `TimedCache` of enabled profiles (30s TTL) and provides CRUD operations plus trip event logging.

### ConditionMonitor

Monitors charging state via `BroadcastReceiver` and Android Auto connection via the `CarConnection` API. Forwards state changes to `ProfileManager` for condition evaluation.

### ProfileConstants

Centralized constants for condition type strings (`charging`, `android_auto`, `speed_above`, `speed_below`), event types (`activated`, `deactivated`), cache TTL, speed buffer size, and minimum interval.

### SecureStorageHelper

Wraps Android's `EncryptedSharedPreferences` for encrypted credential storage (AES-256-GCM for values, AES-256-SIV for keys). Stores Basic Auth passwords, Bearer tokens, and custom headers.

### Other Modules

| Module | Purpose |
| --- | --- |
| `BootReceiver` | Auto-restarts tracking after device reboot |
| `MotionDetector` | Wraps `TYPE_SIGNIFICANT_MOTION` sensor - arms a one-shot hardware trigger that fires when the device starts moving, used to resume GPS after a stationary pause |
| `DeviceInfoHelper` | Device metadata and battery status with caching |
| `FileOperations` | File I/O, sharing via FileProvider, and clipboard access |
| `PayloadBuilder` | Builds JSON payloads with dynamic field mapping |
| `ServiceConfig` | Centralized configuration data class |
| `TimedCache` | Generic TTL cache used for queue count, device info, geofences, profiles, and network state |
| `BuildConfigModule` | Exposes build constants (SDK versions, app version) to JS |
| `AppLogger` | Centralized logger - logs when debug mode is enabled or in debug builds, errors always log |
| `AutoExportWorker` | WorkManager `CoroutineWorker` for scheduled exports - checks `AutoExportConfig.isExportDue()` on each run, streams chunked writes, verifies output, and cleans up old files beyond retention limit |
| `AutoExportScheduler` | Schedules a daily (24h) check worker via WorkManager with battery-not-low constraint - frequency logic (daily/weekly/monthly) is handled at runtime by the worker |
| `AutoExportConfig` | Typed data class wrapping auto-export settings from the SQLite settings table with validation, `isExportDue()`, and `nextExportTimestamp()` |
| `ExportConverters` | Native Kotlin export converters (CSV, GeoJSON, GPX, KML) with in-memory, streaming, and file-based (`exportToFile`) interfaces |

## React Native Layer

### Screens

| Screen | Purpose |
| --- | --- |
| `DashboardScreen` | Live map with tracking controls, coordinates, database stats, geofence and profile status |
| `SettingsScreen` | GPS interval, distance filter, sync strategy, offline mode, accuracy threshold, unit system, time format |
| `ApiSettingsScreen` | Endpoint URL, HTTP method, field mapping with backend templates |
| `AuthSettingsScreen` | Authentication method (None, Basic Auth, Bearer Token) and custom HTTP headers |
| `GeofenceScreen` | Create, edit, and delete pause zones on an interactive map |
| `TrackingProfilesScreen` | List and manage condition-based tracking profiles |
| `ProfileEditorScreen` | Create/edit a profile's name, condition, GPS settings, priority, and deactivation delay |
| `LocationInspectorScreen` | Calendar day picker with activity dots, map tab with trip-colored tracks, trips tab with trip cards and export |
| `TripDetailScreen` | Full trip view with dedicated map, stats grid, speed and elevation profile charts, and per-trip export |
| `LocationSummaryScreen` | Aggregated stats for selectable periods (week/month/30 days) with daily breakdown and tap-to-inspect navigation |
| `ExportDataScreen` | Export all tracked locations via native streaming converters as CSV, GeoJSON, GPX, or KML |
| `AutoExportScreen` | Configure scheduled auto-export: directory, format, frequency, export range, and file retention |
| `OfflineMapsScreen` | Download and manage offline map areas - interactive radius picker, detail level selection (Standard/Hiking), progress tracking, and area deletion |
| `DataManagementScreen` | Clear sent history, delete old data, vacuum database, sync controls |
| `SetupImportScreen` | Confirmation screen for `colota://setup` deep link imports |
| `AboutScreen` | App version, device info, links to repository and privacy policy |

### Services

| Service | Purpose |
| --- | --- |
| `NativeLocationService` | TypeScript bridge to the native `LocationServiceModule` with typed methods for all native operations |
| `LocationServicePermission` | Sequential Android permission requests (fine location → background location → notifications → battery exemption) |
| `ProfileService` | Thin wrapper over `NativeLocationService` for tracking profile CRUD and trip event queries |
| `SettingsService` | Bridges UI state to native SQLite with type conversion (seconds↔ms, objects↔JSON) |
| `modalService` | Centralized alert and confirm dialogs via `showAlert()` and `showConfirm()` |

### Map Components

The app uses [MapLibre GL Native](https://github.com/maplibre/maplibre-react-native) (`@maplibre/maplibre-react-native`) for GPU-accelerated map rendering with [OpenFreeMap](https://openfreemap.org) vector tiles. No API tokens required. Fully FOSS-compatible.

| Component | Purpose |
| --- | --- |
| `ColotaMapView` | Shared base map component wrapping MapLibre's `MapView` with OpenFreeMap vector tiles, dark mode style transformation, custom compass, and attribution |
| `DashboardMap` | Live tracking map with user marker, accuracy circle, geofence polygons with labels, auto-center, and center button |
| `TrackMap` | Location history map with trip-colored track segments, tappable point markers with detail popups, fit-to-track bounds, and trip legend |
| `CalendarPicker` | Day picker with month navigation, dot indicators for days with data, and daily distance/count display |
| `TripList` | Segmented trip cards with distance, duration, avg speed, elevation gain/loss, and per-trip or bulk export |
| `GeofenceLayers` | Shared geofence rendering (fill polygons, stroke outlines, labels) used by DashboardMap and GeofenceScreen |
| `UserLocationOverlay` | User position dot with accuracy circle, used by DashboardMap and GeofenceScreen |
| `MapCenterButton` | Reusable button overlay to re-center the map |

`OfflinePackManager.ts` handles the offline maps feature:

| Export | Purpose |
| --- | --- |
| `createOfflinePack` | Creates a MapLibre offline pack for a center + radius bounding box at a given detail level (Standard = z8-14, Hiking = z8-16) |
| `loadOfflineAreas` | Fetches all stored packs from MapLibre's `OfflineManager` and returns status info (size, complete, active) |
| `deleteOfflineArea` | Unsubscribes, pauses, deletes a pack, and clears the ambient tile cache |
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
| `logger` | Environment-aware logging - suppresses debug/info in production via `__DEV__`, always logs warn/error |
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
