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
gradlew assembleRelease    # or ./gradlew on Linux/macOS
```

The APK will be at `apps/mobile/android/app/build/outputs/apk/release/`.

## Development

To run the app in development mode:

```bash
cd colota
npm install
cd apps/mobile
npm start          # Start Metro bundler
npm run android    # Build and install on connected device
```
