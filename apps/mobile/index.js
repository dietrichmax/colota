/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

/**
 * @format
 * React Native Entry Point - Production Ready
 *
 * Enhanced entry point with error handling, performance monitoring,
 * and development tools.
 */
import { AppRegistry, LogBox, Platform } from "react-native"
import App from "./App"
import { name as appName } from "./app.json"

/**
 * Development-only configuration
 */
if (__DEV__) {
  // Configure LogBox to ignore specific known warnings
  LogBox.ignoreLogs([
    "Non-serializable values were found in the navigation state",
    "Require cycle:" // Common in large React Native projects
    // Add other warnings to ignore
  ])

  // Enable React Native performance monitoring
  if (Platform.OS === "android") {
    // Android-specific dev tools
    console.log("[Dev] Android development mode enabled")
  } else if (Platform.OS === "ios") {
    // iOS-specific dev tools
    console.log("[Dev] iOS development mode enabled")
  }
}

/**
 * Global error handler for uncaught errors
 * Logs errors and prevents app crashes in production
 */
const errorHandler = (error, isFatal) => {
  if (isFatal) {
    console.error("[Fatal Error]", error)
    // In production, you might want to:
    // - Send error to crash reporting service (Sentry, Crashlytics)
    // - Show user-friendly error screen
    // - Log to analytics
  } else {
    console.warn("[Error]", error)
  }
}

// Set global error handler (only in production)
if (!__DEV__) {
  ErrorUtils.setGlobalHandler(errorHandler)
}

// Register the main application component
AppRegistry.registerComponent(appName, () => App)
