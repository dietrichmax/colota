/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { Platform, PermissionsAndroid, Alert } from "react-native"
import NativeLocationService from "./NativeLocationService"
import { showAlert } from "./modalService"
import { logger } from "../utils/logger"

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
 * Callback registered by LocationDisclosureModal to show the themed disclosure.
 * Falls back to Alert.alert if no modal is registered (e.g. in tests).
 */
type DisclosureCallback = () => Promise<boolean>
let _disclosureCallback: DisclosureCallback | null = null

/**
 * Registers the disclosure modal callback.
 * Called by LocationDisclosureModal on mount.
 */
export function registerDisclosureCallback(cb: DisclosureCallback) {
  _disclosureCallback = cb
}

/**
 * Requests all necessary permissions for location tracking.
 *
 * Shows a prominent disclosure first (required by Google Play),
 * then requests permissions. Skips if all permissions are already granted.
 *
 * @returns True if all required permissions granted
 */
export async function ensurePermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true

  try {
    // Skip disclosure + requests if everything is already granted
    const status = await checkPermissions()
    if (status.location && status.background && status.notifications) {
      await requestBatteryOptimizationExemption()
      return true
    }

    // Prominent disclosure (required by Google Play User Data policy)
    const consented = _disclosureCallback ? await _disclosureCallback() : await fallbackDisclosure()
    if (!consented) return false

    // Fine location
    if (!status.location) {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
      if (result !== PermissionsAndroid.RESULTS.GRANTED) return false
    }

    // Background location (Android 10+)
    if (Platform.Version >= ANDROID_10 && !status.background) {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION)
      if (result !== PermissionsAndroid.RESULTS.GRANTED) return false
    }

    // Notifications (Android 13+, non-blocking)
    if (Platform.Version >= ANDROID_13 && !status.notifications) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
    }

    // Battery optimization exemption (optional)
    await requestBatteryOptimizationExemption()

    return true
  } catch (err) {
    logger.error("[PermissionService] Permission request error:", err)
    showAlert("Permission Error", "Failed to request permissions. Please try again.", "error")
    return false
  }
}

/**
 * Fallback disclosure using Alert (for tests or if modal not mounted).
 */
function fallbackDisclosure(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Location Data Collection",
      "Colota collects location data to enable GPS tracking and sending your position to your configured server, even when the app is closed or not in use.\n\nNo data is shared with third parties.",
      [
        { text: "Not Now", style: "cancel", onPress: () => resolve(false) },
        { text: "Agree", onPress: () => resolve(true) }
      ],
      { cancelable: false }
    )
  })
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
    logger.error("[PermissionService] Battery optimization request failed:", err)
  }
}

/**
 * Checks current permission status without requesting.
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

async function checkFineLocation(): Promise<boolean> {
  return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
}

function getAndroidVersion(): number {
  if (Platform.OS !== "android") return 0
  return typeof Platform.Version === "number" ? Platform.Version : parseInt(Platform.Version, 10) || 0
}

async function checkBackgroundLocation(): Promise<boolean> {
  if (getAndroidVersion() < ANDROID_10) return true
  return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION)
}

async function checkNotifications(): Promise<boolean> {
  if (getAndroidVersion() < ANDROID_13) return true
  return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
}

async function checkBatteryOptimization(): Promise<boolean> {
  try {
    return await NativeLocationService.isIgnoringBatteryOptimizations()
  } catch (err) {
    logger.error("[PermissionService] Battery optimization check failed:", err)
    return false
  }
}
