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
- Database queries (`getStats`, `getTableData`, `getLocationsByDateRange`)
- Geofence CRUD operations
- Settings persistence
- Device info, file operations, authentication

Emits events back to JavaScript:

- `onLocationUpdate` - new GPS fix received
- `onTrackingStopped` - service stopped (user action or OOM kill)
- `onSyncError` - 3+ consecutive sync failures
- `onPauseZoneChange` - entered or exited a geofence pause zone
- `onProfileSwitch` - a tracking profile was activated or deactivated

### LocationProvider Abstraction

Location services are abstracted behind a `LocationProvider` interface (`location/LocationProvider.kt`), with flavor-specific implementations:

- **GMS** (`src/gms/`) - `GmsLocationProvider` wraps Google Play Services `FusedLocationProviderClient`
- **FOSS** (`src/foss/`) - `NativeLocationProvider` wraps Android's native `LocationManager` with `GPS_PROVIDER` and `NETWORK_PROVIDER` fallback

Each flavor provides a `LocationProviderFactory` that returns the correct implementation. The service and bridge code in `src/main/` uses only the interface.

### LocationForegroundService

An Android foreground service that runs continuously for GPS tracking. Manages:

- GPS location capture via the `LocationProvider` abstraction
- Pause zone detection (geofencing)
- Battery critical shutdown (below 5% while discharging)
- Location accuracy filtering
- Queuing data for server sync

### NotificationHelper

Handles all notification logic for the tracking service:

- Channel creation and notification building
- Dynamic title: "Colota Tracking" by default, "Colota · ProfileName" when a tracking profile is active
- Status text generation (coordinates, sync status, pause zones)
- Throttled updates (10s minimum interval, 2m minimum movement)
- Deduplication to avoid unnecessary notification redraws

### DatabaseHelper

SQLite database singleton with six tables:

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

Registers and manages `BroadcastReceiver` instances for charging state and Android Auto / car mode detection. Forwards state changes to `ProfileManager` for condition evaluation.

### ProfileConstants

Centralized constants for condition type strings (`charging`, `android_auto`, `speed_above`, `speed_below`), event types (`activated`, `deactivated`), cache TTL, speed buffer size, and minimum interval.

### SecureStorageHelper

Wraps Android's `EncryptedSharedPreferences` for AES-256-GCM encrypted credential storage (Basic Auth passwords, Bearer tokens, custom headers).

### Other Modules

| Module                 | Purpose                                                   |
| ---------------------- | --------------------------------------------------------- |
| `LocationBootReceiver` | Auto-restarts tracking after device reboot                |
| `DeviceInfoHelper`     | Device metadata and battery status with caching           |
| `FileOperations`       | File I/O, sharing via FileProvider, and clipboard access  |
| `PayloadBuilder`       | Builds JSON payloads with dynamic field mapping           |
| `ServiceConfig`        | Centralized configuration data class                      |
| `TimedCache`           | Generic TTL cache used for queue count and device info    |
| `BuildConfigModule`    | Exposes build constants (SDK versions, app version) to JS |

## React Native Layer

### Services

| Service | Purpose |
| --- | --- |
| `NativeLocationService` | TypeScript bridge to the native `LocationServiceModule` with typed methods for all native operations |
| `LocationServicePermission` | Sequential Android permission requests (fine location → background location → notifications → battery exemption) |
| `ProfileService` | Thin wrapper over `NativeLocationService` for tracking profile CRUD and trip event queries |
| `SettingsService` | Bridges UI state to native SQLite with type conversion (seconds↔ms, objects↔JSON) |

### Map Components

The app uses [MapLibre GL Native](https://github.com/maplibre/maplibre-react-native) (`@maplibre/maplibre-react-native`) for GPU-accelerated map rendering with [OpenFreeMap](https://openfreemap.org) vector tiles. No API tokens required. Fully FOSS-compatible.

| Component | Purpose |
| --- | --- |
| `ColotaMapView` | Shared base map component wrapping MapLibre's `MapView` with OpenFreeMap vector tiles, dark mode style transformation, custom compass, and attribution |
| `DashboardMap` | Live tracking map with user marker (animated pulse), accuracy circle, geofence polygons with labels, auto-center, and center button |
| `TrackMap` | Location history map with speed-colored track segments, tappable point markers with popups, start/end markers, fit-to-track bounds, and speed legend |
| `GeofenceLayers` | Shared geofence rendering (fill polygons, stroke outlines, labels) used by DashboardMap and GeofenceScreen |
| `UserLocationOverlay` | User position dot with accuracy circle and pulse animation, used by DashboardMap and GeofenceScreen |
| `MapCenterButton` | Reusable button overlay to re-center the map |

Supporting utilities in `mapUtils.ts`:

| Utility | Purpose |
| --- | --- |
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
| `geo` | Haversine distance, speed/distance formatting with locale-aware unit selection (km/h vs mph) |
| `exportConverters` | Converts location data to CSV, GeoJSON, GPX, and KML export formats |
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
