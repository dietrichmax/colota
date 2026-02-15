/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import NativeLocationService from "./NativeLocationService"
import { Settings } from "../types/global"
import { logger } from "../utils/logger"

/**
 * Bridge between UI state and native SQLite configuration.
 * Handles type conversion and key mapping for native storage.
 */
export const SettingsService = {
  /**
   * Saves a single setting to native storage.
   * Handles type conversion and key mapping.
   * Throws on failure so callers can handle errors explicitly.
   */
  updateSetting: async (key: keyof Settings, value: any): Promise<void> => {
    let stringValue: string

    switch (key) {
      case "interval":
        // UI: seconds → Native: milliseconds
        stringValue = (Number(value) * 1000).toString()
        break

      case "fieldMap":
      case "customFields":
        // Object → JSON string
        stringValue = JSON.stringify(value)
        break

      case "distance":
        // JS key: 'distance' → Native key: 'minUpdateDistance'
        await NativeLocationService.saveSetting("minUpdateDistance", value.toString())
        // Also save as 'distance' for JS hydration
        stringValue = value.toString()
        break

      case "syncInterval":
      case "retryInterval":
      case "maxRetries":
      case "accuracyThreshold":
        // Already in correct format (numbers)
        stringValue = String(value)
        break

      case "filterInaccurateLocations":
      case "isOfflineMode":
        // Boolean → "true"/"false"
        stringValue = String(value)
        break

      default:
        // Handles 'endpoint', 'syncPreset', etc.
        stringValue = String(value)
    }

    await NativeLocationService.saveSetting(key, stringValue)
  },

  /**
   * Updates multiple settings in parallel.
   * Throws if any individual setting fails to persist.
   */
  updateMultiple: async (settingsUpdate: Partial<Settings>): Promise<void> => {
    const entries = Object.entries(settingsUpdate)
    logger.debug(`[SettingsService] Batch updating ${entries.length} settings`)

    const results = await Promise.allSettled(
      entries.map(([key, val]) => SettingsService.updateSetting(key as keyof Settings, val))
    )

    const failures = results.filter((r) => r.status === "rejected")
    if (failures.length > 0) {
      failures.forEach((f) => logger.error("[SettingsService] Setting failed:", (f as PromiseRejectedResult).reason))
      throw new Error(`Failed to save ${failures.length} of ${entries.length} settings`)
    }

    logger.debug("[SettingsService] Batch update completed")
  }
}

export default SettingsService
