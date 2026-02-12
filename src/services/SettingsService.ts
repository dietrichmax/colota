/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import NativeLocationService from "./NativeLocationService"
import { Settings } from "../types/global"

/**
 * Bridge between UI state and native SQLite configuration.
 * Handles type conversion and key mapping for native storage.
 */
export const SettingsService = {
  /**
   * Saves a single setting to native storage
   * Handles type conversion and key mapping
   */
  updateSetting: async (key: keyof Settings, value: any): Promise<boolean> => {
    try {
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
      return true
    } catch (err) {
      console.error(`[SettingsService] Failed to save ${key}:`, err)
      return false
    }
  },

  /**
   * Updates multiple settings in parallel
   */
  updateMultiple: async (settingsUpdate: Partial<Settings>): Promise<void> => {
    const keys = Object.keys(settingsUpdate)
    console.log(`[SettingsService] Batch updating ${keys.length} settings`)

    const promises = Object.entries(settingsUpdate).map(([key, val]) =>
      SettingsService.updateSetting(key as keyof Settings, val)
    )

    await Promise.all(promises)
    console.log("[SettingsService] ✅ Batch update completed")
  }
}

export default SettingsService
