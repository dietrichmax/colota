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
4. Test on a real device
5. Open a Pull Request

See the [Development Guide](/docs/development/architecture) for architecture details and [Local Setup](/docs/development/local-setup) for building from source.

## Code Style

- **TypeScript / React Native** for the UI layer
- **Kotlin** for native Android modules
- Follow existing patterns in the codebase
- Run before submitting:
  ```bash
  npm run lint
  npx tsc --noEmit
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
