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

- `src/main/java/com/colota/` — Shared code: `bridge/`, `service/`, `data/`, `sync/`, `util/`, `location/` (interface)
- `src/gms/java/com/colota/location/` — Google Play Services location provider
- `src/foss/java/com/colota/location/` — Native Android location provider

### LocationServiceModule

The primary React Native bridge module (exposed as `"LocationServiceModule"`). Handles all JS-to-native communication for:

- Service control (`startService`, `stopService`)
- Database queries (`getStats`, `getTableData`, `getLocationsByDateRange`, `getQueuedLocationsCount`)
- Geofence CRUD operations
- Settings persistence
- Device info, file operations, authentication

Emits events back to JavaScript:

- `onLocationUpdate` — new GPS fix received
- `onTrackingStopped` — service stopped (user action or OOM kill)
- `onSyncError` — 3+ consecutive sync failures
- `onPauseZoneChange` — entered or exited a geofence pause zone

### LocationProvider Abstraction

Location services are abstracted behind a `LocationProvider` interface (`location/LocationProvider.kt`), with flavor-specific implementations:

- **GMS** (`src/gms/`) — `GmsLocationProvider` wraps Google Play Services `FusedLocationProviderClient`
- **FOSS** (`src/foss/`) — `NativeLocationProvider` wraps Android's native `LocationManager` with `GPS_PROVIDER` and `NETWORK_PROVIDER` fallback

Each flavor provides a `LocationProviderFactory` that returns the correct implementation. The service and bridge code in `src/main/` uses only the interface.

### LocationForegroundService

An Android foreground service that runs continuously for GPS tracking. Manages:

- GPS location capture via the `LocationProvider` abstraction
- Pause zone detection (geofencing)
- Battery critical shutdown (1-4% while discharging)
- Location accuracy filtering
- Queuing data for server sync

### NotificationHelper

Handles all notification logic for the tracking service:

- Channel creation and notification building
- Status text generation (coordinates, sync status, pause zones)
- Throttled updates (10s minimum interval, 2m minimum movement)
- Deduplication to avoid unnecessary notification redraws

### DatabaseHelper

SQLite database singleton with four tables:

| Table       | Purpose                           |
| ----------- | --------------------------------- |
| `locations` | All recorded GPS locations        |
| `queue`     | Locations pending upload          |
| `settings`  | App configuration key-value pairs |
| `geofences` | Pause zone definitions            |

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

### SecureStorageHelper

Wraps Android's `EncryptedSharedPreferences` for AES-256-GCM encrypted credential storage (Basic Auth passwords, Bearer tokens, custom headers).

### Other Modules

| Module                 | Purpose                                                   |
| ---------------------- | --------------------------------------------------------- |
| `LocationBootReceiver` | Auto-restarts tracking after device reboot                |
| `DeviceInfoHelper`     | Device metadata and battery status with caching           |
| `FileOperations`       | File I/O for data export via FileProvider                 |
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
| `SettingsService` | Bridges UI state to native SQLite with type conversion (seconds↔ms, objects↔JSON) |

### Utils

| Utility | Purpose |
| --- | --- |
| `logger` | Environment-aware logging — suppresses debug/info in production via `__DEV__`, always logs warn/error |
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

- **ThemeProvider** — Light/dark theme with system preference sync
- **TrackingProvider** — Single source of truth for tracking state, coordinates, and settings. Hydrates from SQLite on mount and persists changes back through `SettingsService`.

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

- **Colors** — `lightColors` and `darkColors` objects with all theme colors
- **Typography** — `fontFamily` ("Inter") and `fontSizes` scale
- **Types** — `ThemeColors` interface and `ThemeMode` type

Both the mobile app and docs site import from `@colota/shared`. The package compiles TypeScript to `dist/` via `tsc` so Docusaurus can consume it without a custom webpack loader.
