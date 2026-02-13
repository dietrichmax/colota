/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { Platform, PermissionsAndroid, Alert } from "react-native"
import NativeLocationService from "./NativeLocationService"

/**
 * Permission status for location tracking
 */
export interface PermissionStatus {
  location: boolean
  background: boolean
  notifications: boolean
  batteryOptimized: boolean
}

/** Android version for background location (Android 10) */
const ANDROID_10 = 29

/** Android version for notifications (Android 13) */
const ANDROID_13 = 33

/**
 * Requests all necessary permissions for location tracking.
 *
 * Requests in sequence:
 * 1. Fine location (always required)
 * 2. Background location (Android 10+)
 * 3. Notifications (Android 13+)
 * 4. Battery optimization exemption
 *
 * Shows alerts explaining each permission and returns false if any critical permission is denied.
 *
 * @returns True if all required permissions granted
 *
 * @example
 * ```ts
 * if (await ensurePermissions()) {
 *   startLocationTracking();
 * }
 * ```
 */
export async function ensurePermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true

  try {
    // 1. Fine location (required)
    if (!(await requestFineLocation())) return false

    // 2. Background location (Android 10+)
    if (Platform.Version >= ANDROID_10) {
      if (!(await requestBackgroundLocation())) return false
    }

    // 3. Notifications (Android 13+)
    if (Platform.Version >= ANDROID_13) {
      if (!(await requestNotificationPermission())) return false
    }

    // 4. Battery optimization exemption (optional but recommended)
    await requestBatteryOptimizationExemption()

    return true
  } catch (err) {
    console.error("[PermissionService] Permission request error:", err)
    Alert.alert("Permission Error", "Failed to request permissions. Please try again.", [{ text: "OK" }])
    return false
  }
}

/**
 * Requests fine location permission
 */
async function requestFineLocation(): Promise<boolean> {
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
    title: "Location Permission",
    message: "Colota needs access to your location to track your position.",
    buttonPositive: "Allow",
    buttonNegative: "Deny"
  })

  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    Alert.alert("Permission Required", "Location permission is required for this app to function.", [{ text: "OK" }])
    return false
  }

  return true
}

/**
 * Requests background location permission (Android 10+)
 */
async function requestBackgroundLocation(): Promise<boolean> {
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION, {
    title: "Background Location Permission",
    message:
      "To track your location continuously, Colota needs permission to access your location in the background, even when you are not actively using it.",
    buttonPositive: "Allow",
    buttonNegative: "Deny"
  })

  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    Alert.alert(
      "Background Permission Denied",
      "Background location permission is needed for continuous tracking. The app may stop when closed or in the background.",
      [{ text: "OK" }]
    )
    return false
  }

  return true
}

/**
 * Requests notification permission (Android 13+)
 */
async function requestNotificationPermission(): Promise<boolean> {
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS, {
    title: "Notification Permission",
    message: "Colota needs permission to show notifications while tracking your location.",
    buttonPositive: "Allow",
    buttonNegative: "Deny"
  })

  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    Alert.alert(
      "Notification Permission Denied",
      "Without notification permission, you will not see tracking status updates.",
      [{ text: "OK" }]
    )
    return false
  }

  return true
}

/**
 * Requests battery optimization exemption (non-blocking)
 */
async function requestBatteryOptimizationExemption(): Promise<void> {
  try {
    const isOptimized = await NativeLocationService.isIgnoringBatteryOptimizations()
    if (!isOptimized) {
      await NativeLocationService.requestIgnoreBatteryOptimizations()
    }
  } catch (err) {
    console.error("[PermissionService] Battery optimization request failed:", err)
    // Non-critical, don't block
  }
}

/**
 * Checks current permission status without requesting.
 *
 * Useful for checking before starting tracking or displaying status in settings.
 *
 * @example
 * ```ts
 * const status = await checkPermissions();
 * if (!status.location) console.log('Location not granted');
 * ```
 */
export async function checkPermissions(): Promise<PermissionStatus> {
  if (Platform.OS !== "android") {
    return {
      location: true,
      background: true,
      notifications: true,
      batteryOptimized: true
    }
  }

  const [location, background, notifications, batteryOptimized] = await Promise.all([
    checkFineLocation(),
    checkBackgroundLocation(),
    checkNotifications(),
    checkBatteryOptimization()
  ])

  return {
    location,
    background,
    notifications,
    batteryOptimized
  }
}

/**
 * Check fine location permission
 */
async function checkFineLocation(): Promise<boolean> {
  return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
}

/**
 * Gets Android version as a number
 */
function getAndroidVersion(): number {
  if (Platform.OS !== "android") return 0
  return typeof Platform.Version === "number" ? Platform.Version : parseInt(Platform.Version, 10) || 0
}

/**
 * Check background location permission (Android 10+)
 */
async function checkBackgroundLocation(): Promise<boolean> {
  if (getAndroidVersion() < ANDROID_10) return true

  return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION)
}

/**
 * Check notification permission (Android 13+)
 */
async function checkNotifications(): Promise<boolean> {
  if (getAndroidVersion() < ANDROID_13) return true

  return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
}

/**
 * Check battery optimization status
 */
async function checkBatteryOptimization(): Promise<boolean> {
  try {
    return await NativeLocationService.isIgnoringBatteryOptimizations()
  } catch (err) {
    console.error("[PermissionService] Battery optimization check failed:", err)
    return false
  }
}
