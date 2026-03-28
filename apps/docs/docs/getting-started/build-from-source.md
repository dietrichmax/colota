---
sidebar_position: 3
---

# Build from Source

## Requirements

- Node.js >= 20
- Android SDK
- JDK 17+

## Steps

```bash
git clone https://github.com/dietrichmax/colota.git
cd colota
npm ci
npm run build -w @colota/shared
cd apps/mobile/android
```

### GMS variant (Google Play Services)

```bash
./gradlew assembleGmsRelease
```

Output: `app/build/outputs/apk/gms/release/app-gms-arm64-v8a-release.apk` (per-ABI)

### FOSS variant (no Google Play Services)

```bash
./gradlew assembleFossRelease
```

Output: `app/build/outputs/apk/foss/release/app-foss-arm64-v8a-release.apk` (per-ABI)

### Build both

```bash
./gradlew assembleGmsRelease assembleFossRelease
```

## Development

To run the app in development mode (GMS variant by default):

```bash
cd colota
npm install
cd apps/mobile
npm start          # Start Metro bundler
npm run android    # Build and install on connected device
```

Use `npm run android:foss` to build and run the FOSS variant instead.
