/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { Platform, PermissionsAndroid } from "react-native"
import NativeLocationService from "./NativeLocationService"
import { showAlert } from "./modalService"
import { logger } from "../utils/logger"
import { t } from "../i18n/t"

/**
 * Permission status for location tracking
 */
export interface PermissionStatus {
  location: boolean
  background: boolean
  notifications: boolean
  batteryOptimized: boolean
  localNetwork: boolean
}

/** Android version for background location (Android 10) */
const ANDROID_10 = 29

/** Android version for notifications (Android 13) */
const ANDROID_13 = 33

/** Android 17 (API 37) - local network enforced via ACCESS_LOCAL_NETWORK */
const ANDROID_LOCAL_NETWORK = 37

/**
 * Callback registered by LocationDisclosureModal to show the themed disclosure.
 * Without one nothing is requested: the reviewed disclosure is the only one Colota shows.
 */
type DisclosureCallback = () => Promise<boolean>
let _disclosureCallback: DisclosureCallback | null = null
let _localNetworkDisclosureCallback: DisclosureCallback | null = null

/**
 * Registers the disclosure modal callback.
 * Called by LocationDisclosureModal on mount.
 */
export function registerDisclosureCallback(cb: DisclosureCallback) {
  _disclosureCallback = cb
}

/**
 * Registers the local network disclosure modal callback.
 * Called by LocalNetworkDisclosureModal on mount.
 */
export function registerLocalNetworkDisclosureCallback(cb: DisclosureCallback) {
  _localNetworkDisclosureCallback = cb
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
    const status = await checkPermissions()

    // Location grants only - including notifications here replays the disclosure on every start
    if (!status.location || !status.background) {
      // Prominent disclosure (required by Google Play User Data policy)
      const consented = _disclosureCallback ? await _disclosureCallback() : noDisclosure("location")
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

      // Notifications (Android 13+, non-blocking). Kept inside the disclosure-gated block so every
      // runtime prompt is preceded by the disclosure; Android auto-denies re-asks after two denials anyway.
      if (Platform.Version >= ANDROID_13 && !status.notifications) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)
      }
    }

    // Battery optimization exemption (optional)
    await requestBatteryOptimizationExemption()

    return true
  } catch (err) {
    logger.error("[PermissionService] Permission request error:", err)
    showAlert(t("permission.error.title"), t("permission.error.message"), "error")
    return false
  }
}

function noDisclosure(which: string): boolean {
  logger.warn(`[PermissionService] No ${which} disclosure registered, nothing requested`)
  return false
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
      batteryOptimized: true,
      localNetwork: true
    }
  }

  const [location, background, notifications, batteryOptimized, localNetwork] = await Promise.all([
    checkFineLocation(),
    checkBackgroundLocation(),
    checkNotifications(),
    checkBatteryOptimization(),
    checkLocalNetwork()
  ])

  return {
    location,
    background,
    notifications,
    batteryOptimized,
    localNetwork
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

async function checkLocalNetwork(): Promise<boolean> {
  if (getAndroidVersion() < ANDROID_LOCAL_NETWORK) return true
  return await PermissionsAndroid.check("android.permission.ACCESS_LOCAL_NETWORK" as any)
}

/**
 * Requests the local network permission for accessing private/local IP endpoints.
 * Needed on Android 16+ when the sync endpoint is a local address.
 *
 * @returns True if permission is granted (or not needed)
 */
export async function ensureLocalNetworkPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true
  if (getAndroidVersion() < ANDROID_LOCAL_NETWORK) return true

  try {
    const granted = await checkLocalNetwork()
    if (granted) return true

    // Show themed disclosure modal first
    const consented = _localNetworkDisclosureCallback
      ? await _localNetworkDisclosureCallback()
      : noDisclosure("local network")
    if (!consented) return false

    const result = await PermissionsAndroid.request("android.permission.ACCESS_LOCAL_NETWORK" as any)
    return result === PermissionsAndroid.RESULTS.GRANTED
  } catch (err) {
    logger.error("[PermissionService] Local network permission request failed:", err)
    return false
  }
}
