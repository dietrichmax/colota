---
sidebar_position: 8
---

# Contributing

## Reporting Issues

1. Check if the issue already exists in [GitHub Issues](https://github.com/dietrichmax/colota/issues)
2. Provide device info (model, Android version, Colota version)
3. Include logs if possible: `adb logcat | grep Colota`
4. Describe steps to reproduce

## Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/batch-export`
3. Make your changes with clear commit messages
4. Add or update tests for new/changed functions, hooks, and components
5. Test on a real device
6. Open a Pull Request

See the [Development Guide](/docs/development/architecture) for architecture details and [Local Setup](/docs/development/local-setup) for building from source.

## Code Style

- **TypeScript / React Native** for the UI layer
- **Kotlin** for native Android modules
- Follow existing patterns in the codebase
- Use `logger` instead of `console.log` - import from `src/utils/logger`
- Test both build flavors if your changes touch native code:
  ```bash
  cd apps/mobile/android
  ./gradlew assembleGmsDebug assembleFossDebug
  ```
- Run before submitting:
  ```bash
  npm run lint -w @colota/mobile
  npx -w @colota/mobile tsc --noEmit
  npm test -w @colota/mobile
  cd apps/mobile/android && ./gradlew testGmsDebugUnitTest testFossDebugUnitTest
  ```

## Project Structure

```
colota/
├── apps/
│   ├── mobile/          # React Native Android app
│   │   ├── android/     # Native Kotlin modules
│   │   └── src/         # React Native TypeScript
│   └── docs/            # Docusaurus documentation
├── packages/
│   └── shared/          # Shared colors and types
├── screenshots/         # App screenshots
└── package.json         # Monorepo root
```
