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
npm install
cd apps/mobile/android
```

### GMS variant (Google Play Services)

```bash
./gradlew assembleGmsRelease
```

Output: `app/build/outputs/apk/gms/release/app-gms-release.apk`

### FOSS variant (no Google Play Services)

```bash
./gradlew assembleFossRelease
```

Output: `app/build/outputs/apk/foss/release/app-foss-release.apk`

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

Use `npm run android:debug:foss` to build and run the FOSS variant instead.
