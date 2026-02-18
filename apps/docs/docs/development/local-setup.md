---
sidebar_position: 2
---

# Local Development Setup

## Prerequisites

- **Node.js** ≥ 20
- **npm** ≥ 9 (ships with Node.js)
- **Java Development Kit** (JDK) 17
- **Android SDK** (API level 36)
  - Build Tools 36.0.0
  - Android SDK Platform 36
- **Android Studio** (recommended for emulator and SDK management)

## Clone and Install

```bash
git clone https://github.com/dietrichmax/colota.git
cd colota
npm install
```

This installs dependencies for all workspace packages (`apps/mobile`, `apps/docs`, `packages/shared`).

## Build the Shared Package

The shared package must be compiled before other packages can use it:

```bash
cd packages/shared
npm run build
```

This runs `tsc` and outputs compiled JavaScript to `packages/shared/dist/`.

## Run the Mobile App

### Start Metro Bundler

```bash
cd apps/mobile
npx react-native start
```

### Build and Run on Android

In a separate terminal:

```bash
cd apps/mobile
npx react-native run-android
```

Or open `apps/mobile/android/` in Android Studio and run from there.

### Build Flavors

The app has two product flavors:

| Flavor | Description         | Location Provider                                  |
| ------ | ------------------- | -------------------------------------------------- |
| `gms`  | Google Play variant | FusedLocationProviderClient (Google Play Services) |
| `foss` | F-Droid variant     | Native LocationManager (no Google dependencies)    |

Build commands:

```bash
npm run android:debug          # GMS debug (default)
npm run android:debug:foss     # FOSS debug
npm run android:release        # GMS release
npm run android:release:foss   # FOSS release
npm run android:release:all    # Both release APKs
```

### Environment Variables

The app reads build configuration from `apps/mobile/android/app/build.gradle`. Key settings:

| Property            | Default      | Description                |
| ------------------- | ------------ | -------------------------- |
| `applicationId`     | `com.Colota` | Android package identifier |
| `minSdkVersion`     | 26           | Minimum Android 8.0        |
| `targetSdkVersion`  | 36           | Target Android 16          |
| `compileSdkVersion` | 36           | Compile against Android 16 |

## Run the Docs Site

```bash
cd apps/docs
npm start
```

This starts a local development server at `http://localhost:3000` with hot reload.

To build for production:

```bash
cd apps/docs
npm run build
```

## Project Structure

```
colota/
├── .maestro/
│   └── screenshots/                 # Maestro UI flows for screenshot capture
├── apps/
│   ├── mobile/
│   │   ├── android/                 # Android native project
│   │   │   └── app/src/
│   │   │       ├── main/java/com/colota/
│   │   │       │   ├── bridge/      # React Native bridge
│   │   │       │   ├── service/     # Foreground service, config & notifications
│   │   │       │   ├── data/        # SQLite & geofencing
│   │   │       │   ├── sync/        # Network sync & payloads
│   │   │       │   ├── util/        # Helpers & encryption
│   │   │       │   └── location/    # LocationProvider interface
│   │   │       ├── gms/java/com/colota/location/   # GMS implementation
│   │   │       └── foss/java/com/colota/location/  # Native implementation
│   │   ├── src/
│   │   │   ├── screens/             # 9 app screens
│   │   │   ├── components/          # UI and feature components
│   │   │   ├── hooks/               # Custom React hooks
│   │   │   ├── services/            # Native bridge services
│   │   │   ├── contexts/            # React Context providers
│   │   │   ├── utils/               # Logger, validation, converters
│   │   │   ├── styles/              # Re-exports from @colota/shared
│   │   │   └── types/               # TypeScript type definitions
│   │   └── App.tsx                  # Entry point with navigation
│   └── docs/
│       ├── docs/                    # Markdown documentation
│       ├── src/                     # Custom Docusaurus components
│       └── docusaurus.config.ts     # Site configuration
├── packages/
│   └── shared/
│       └── src/
│           ├── colors.ts            # Theme color definitions
│           ├── typography.ts        # Font family and sizes
│           └── index.ts             # Barrel exports
├── scripts/                         # Version bump and screenshot sync
└── screenshots/
    └── mobile/original/             # Screenshot source of truth
```

## Running Tests

### JavaScript Tests

Run the React Native test suite (Jest):

```bash
npm test -w @colota/mobile
```

### Kotlin Unit Tests

Run native Android unit tests for both build flavors:

```bash
cd apps/mobile/android
./gradlew testGmsDebugUnitTest testFossDebugUnitTest
```

Test files are located in `apps/mobile/android/app/src/test/java/com/Colota/`. The tests cover:

- **SyncManager** — Instant/periodic sync modes, retry logic, Wi-Fi only gating, backoff
- **NetworkManager** — HTTPS enforcement, private host detection, header masking, query strings
- **DatabaseHelper** — Data model, cutoff calculations, batch operations
- **SecureStorageHelper** — Basic Auth, Bearer token, custom headers, JSON parsing
- **DeviceInfoHelper** — Battery threshold logic, status code mapping, percentage calculation
- **NotificationHelper** — Status text generation, throttling, movement filter, deduplication
- **LocationForegroundService** — Battery shutdown, accuracy filtering, zone state machine
- **ServiceConfig** — Database/Intent/ReadableMap parsing, defaults, round-trips
- **PayloadBuilder** — JSON payload construction and field map parsing
- **GeofenceHelper** — Haversine distance calculations and radius checks
- **TimedCache** — TTL cache logic

### Linting and Type Checking

```bash
npm run lint -w @colota/mobile        # ESLint
npx -w @colota/mobile tsc --noEmit    # TypeScript type check
```

## Common Tasks

### Adding a New Screen

1. Create the screen component in `apps/mobile/src/screens/`
2. Add the route to the navigator stack in `apps/mobile/App.tsx`
3. Import and use hooks from `src/hooks/` for tracking state and theme

### Modifying Native Modules

1. Edit the Kotlin file in `apps/mobile/android/app/src/main/java/com/colota/<subpackage>/`
2. If adding a new method to `LocationServiceModule` (`bridge/`), expose it via `@ReactMethod`
3. Add the corresponding TypeScript method in `apps/mobile/src/services/NativeLocationService.ts`
4. Rebuild the Android app (`npx react-native run-android`)

### Updating Theme Colors

1. Edit `packages/shared/src/colors.ts`
2. Run `npm run build` in `packages/shared/`
3. Both the mobile app and docs site will pick up the changes

### Bumping the Version

Use the version bump script to update all packages and the Android build in one command:

```bash
npm run version:bump 1.2.0
```

This updates `version` in all `package.json` files, `versionName` in `build.gradle`, and auto-increments `versionCode`.

### Generating Screenshots

App screenshots live in `screenshots/mobile/original/` (single source of truth) and are synced to the docs site and Fastlane store metadata.

**Capture**: Trigger the "Generate Screenshots" workflow manually from GitHub Actions. It starts an Android emulator, runs [Maestro](https://maestro.mobile.dev) flows from `.maestro/screenshots/`, and commits the updated screenshots.

**Sync only** (copies existing screenshots to docs + store without recapturing):

```bash
npm run screenshots:sync
```

### Adding Documentation

1. Create a Markdown file in `apps/docs/docs/`
2. Add the page to `apps/docs/sidebars.ts`
3. Preview with `npm start` in `apps/docs/`
