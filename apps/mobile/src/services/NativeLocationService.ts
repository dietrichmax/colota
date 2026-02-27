/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { NativeModules } from "react-native"
import {
  AuthConfig,
  DailyStat,
  DatabaseStats,
  Geofence,
  Settings,
  TrackingProfile,
  SavedTrackingProfile
} from "../types/global"
import { logger } from "../utils/logger"

const { LocationServiceModule, BuildConfigModule } = NativeModules

/**
 * Native location service bridge.
 * Provides a TypeScript-safe interface to the native Android location tracking module.
 *
 * Handles:
 * - Data normalization (seconds → milliseconds)
 * - Bridge safety checks
 * - SQLite persistence operations
 */
class NativeLocationService {
  /**
   * Validates that the native module is available
   * @throws {Error} If LocationServiceModule is undefined
   */
  private static ensureModule(): void {
    if (!LocationServiceModule) {
      throw new Error("[NativeLocationService] Module not available. Check native linking.")
    }
  }

  /**
   * Wraps async native calls with error handling
   */
  private static async safeExecute<T>(operation: () => Promise<T>, fallback: T, errorPrefix: string): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      logger.error(`[NativeLocationService] ${errorPrefix}:`, error)
      return fallback
    }
  }

  // ============================================================================
  // SERVICE CONTROL
  // ============================================================================

  /**
   * Starts the Android foreground location service
   * @param settings Configuration for GPS polling and data transmission
   */
  static async start(settings: Settings): Promise<void> {
    this.ensureModule()

    const config = {
      interval: settings.interval * 1000, // s → ms
      minUpdateDistance: settings.distance,
      endpoint: settings.endpoint,
      fieldMap: settings.fieldMap,
      syncInterval: settings.syncInterval,
      retryInterval: settings.retryInterval,
      maxRetries: settings.maxRetries,
      filterInaccurateLocations: settings.filterInaccurateLocations,
      accuracyThreshold: settings.accuracyThreshold,
      isOfflineMode: settings.isOfflineMode,
      isWifiOnlySync: settings.isWifiOnlySync,
      httpMethod: settings.httpMethod,
      customFields: Object.fromEntries(settings.customFields.filter((f) => f.key).map((f) => [f.key, f.value]))
    }

    logger.debug(
      `[NativeLocationService] Starting service - interval: ${settings.interval}s, distance: ${settings.distance}m, sync: ${settings.syncInterval}s`
    )

    try {
      await LocationServiceModule.startService(config)
      logger.debug("[NativeLocationService] Service started")
    } catch (error) {
      logger.error("[NativeLocationService] Start failed:", error)
      throw error
    }
  }

  /**
   * Stops the foreground service and GPS polling
   */
  static stop(): void {
    if (!LocationServiceModule) {
      logger.warn("[NativeLocationService] Module not available")
      return
    }

    logger.debug("[NativeLocationService] Stopping service")
    LocationServiceModule.stopService()
  }

  /**
   * Checks if tracking is enabled (from persistent settings)
   */
  static async isTrackingActive(): Promise<boolean> {
    this.ensureModule()
    const state = await this.getSetting("tracking_enabled", "false")
    return state === "true"
  }

  // ============================================================================
  // QUEUE OPERATIONS
  // ============================================================================

  /**
   * Forces immediate upload of all pending locations
   * @returns True if flush succeeded
   */
  static async manualFlush(): Promise<boolean> {
    this.ensureModule()
    logger.debug("[NativeLocationService] Triggering manual flush")
    try {
      const result = await LocationServiceModule.manualFlush()
      logger.debug("[NativeLocationService] Flush completed")
      return result
    } catch (error) {
      logger.error("[NativeLocationService] Flush failed:", error)
      throw error
    }
  }

  // ============================================================================
  // DATABASE QUERIES
  // ============================================================================

  /**
   * Fetches raw rows from a database table
   * @param tableName 'locations', 'queue', or 'geofences'
   * @param limit Maximum rows to return
   * @param offset Pagination offset
   */
  static async getTableData(tableName: string, limit: number, offset: number = 0): Promise<any[]> {
    this.ensureModule()
    return this.safeExecute(
      () => LocationServiceModule.getTableData(tableName, limit, offset),
      [],
      `getTableData(${tableName}) failed`
    )
  }

  /**
   * Returns database health summary
   */
  static async getStats(): Promise<DatabaseStats> {
    this.ensureModule()
    return LocationServiceModule.getStats()
  }

  /**
   * Fetches all locations for export
   */
  static async getExportData(): Promise<any[]> {
    this.ensureModule()
    return this.safeExecute(
      () => LocationServiceModule.getTableData("locations", 1000000, 0),
      [],
      "getExportData failed"
    )
  }

  /**
   * Fetches locations within a date range, ordered chronologically.
   * Used for track polyline rendering on the map view.
   * @param startTimestamp Start of range (Unix seconds, inclusive)
   * @param endTimestamp End of range (Unix seconds, inclusive)
   */
  static async getLocationsByDateRange(startTimestamp: number, endTimestamp: number): Promise<any[]> {
    this.ensureModule()
    return this.safeExecute(
      () => LocationServiceModule.getLocationsByDateRange(startTimestamp, endTimestamp),
      [],
      "getLocationsByDateRange failed"
    )
  }

  /**
   * Gets the most recent location from the database
   */
  static async getMostRecentLocation(): Promise<any | null> {
    this.ensureModule()
    return this.safeExecute(() => LocationServiceModule.getMostRecentLocation(), null, "getMostRecentLocation failed")
  }

  /**
   * Returns date strings (YYYY-MM-DD) that have location data in the range.
   * Used by the calendar view to show activity dots.
   */
  static async getDaysWithData(startTimestamp: number, endTimestamp: number): Promise<string[]> {
    this.ensureModule()
    return this.safeExecute(
      () => LocationServiceModule.getDaysWithData(startTimestamp, endTimestamp),
      [],
      "getDaysWithData failed"
    )
  }

  /**
   * Returns per-day aggregated stats for a date range.
   * Each entry: { day, count, startTime, endTime, distanceMeters, tripCount }
   */
  static async getDailyStats(startTimestamp: number, endTimestamp: number): Promise<DailyStat[]> {
    this.ensureModule()
    return this.safeExecute(
      () => LocationServiceModule.getDailyStats(startTimestamp, endTimestamp),
      [],
      "getDailyStats failed"
    )
  }

  /** DEV ONLY: Insert dummy location data for testing */
  static async insertDummyData(): Promise<number> {
    this.ensureModule()
    return this.safeExecute(() => LocationServiceModule.insertDummyData(), 0, "insertDummyData failed")
  }

  // ============================================================================
  // CLEANUP OPERATIONS
  // ============================================================================

  /**
   * Deletes all successfully sent locations
   */
  static async clearSentHistory(): Promise<void> {
    this.ensureModule()
    logger.debug("[NativeLocationService] Clearing sent history")
    await LocationServiceModule.clearSentHistory()
  }

  /**
   * Deletes all queued (unsent) locations
   * @returns Count of deleted records
   */
  static async clearQueue(): Promise<number> {
    this.ensureModule()
    logger.debug("[NativeLocationService] Clearing queue")
    return LocationServiceModule.clearQueue()
  }

  /**
   * Deletes all location data (sent + queued)
   * @returns Count of deleted records
   */
  static async clearAllLocations(): Promise<number> {
    this.ensureModule()
    logger.debug("[NativeLocationService] Clearing all locations")
    return LocationServiceModule.clearAllLocations()
  }

  /**
   * Deletes locations older than specified days
   * @param days Age threshold in days
   * @returns Count of deleted records
   */
  static async deleteOlderThan(days: number): Promise<number> {
    this.ensureModule()
    logger.debug(`[NativeLocationService] Deleting locations older than ${days} days`)
    return LocationServiceModule.deleteOlderThan(days)
  }

  /**
   * Runs SQLite VACUUM to reclaim disk space
   */
  static async vacuumDatabase(): Promise<void> {
    this.ensureModule()
    logger.debug("[NativeLocationService] Vacuuming database")
    await LocationServiceModule.vacuumDatabase()
  }

  // ============================================================================
  // GEOFENCE OPERATIONS
  // ============================================================================

  /**
   * Fetches all geofences
   */
  static async getGeofences(): Promise<Geofence[]> {
    this.ensureModule()
    return this.safeExecute(() => LocationServiceModule.getGeofences(), [], "getGeofences failed")
  }

  /**
   * Creates a new geofence
   * @returns Geofence ID
   */
  static async createGeofence(geofence: Omit<Geofence, "id" | "createdAt">): Promise<number> {
    this.ensureModule()
    logger.debug("[NativeLocationService] Creating geofence:", geofence.name)
    return LocationServiceModule.createGeofence(
      geofence.name,
      geofence.lat,
      geofence.lon,
      geofence.radius,
      geofence.pauseTracking
    )
  }

  /**
   * Updates an existing geofence (partial updates supported)
   */
  static async updateGeofence(update: Partial<Geofence> & { id: number }): Promise<boolean> {
    this.ensureModule()

    if (!update.id) {
      throw new Error("Geofence ID is required")
    }

    logger.debug("[NativeLocationService] Updating geofence:", update.id)
    return LocationServiceModule.updateGeofence(
      update.id,
      update.name ?? null,
      update.lat ?? null,
      update.lon ?? null,
      update.radius ?? null,
      update.enabled ?? null,
      update.pauseTracking ?? null
    )
  }

  /**
   * Deletes a geofence
   */
  static async deleteGeofence(id: number): Promise<boolean> {
    this.ensureModule()
    logger.debug("[NativeLocationService] Deleting geofence:", id)
    return LocationServiceModule.deleteGeofence(id)
  }

  /**
   * Checks if device is currently inside a pause zone
   * @returns Pause zone name or null
   */
  static async checkCurrentPauseZone(): Promise<string | null> {
    this.ensureModule()
    return this.safeExecute(() => LocationServiceModule.checkCurrentPauseZone(), null, "checkCurrentPauseZone failed")
  }

  /**
   * Triggers immediate recheck of pause zone settings
   * Use after modifying geofence pause settings to update notification instantly
   */
  static async recheckZoneSettings(): Promise<void> {
    this.ensureModule()
    logger.debug("[NativeLocationService] Triggering zone settings recheck")
    try {
      await LocationServiceModule.recheckZoneSettings()
    } catch (error) {
      logger.error("[NativeLocationService] Recheck failed:", error)
    }
  }

  // ============================================================================
  // TRACKING PROFILES
  // ============================================================================

  /**
   * Fetches all tracking profiles
   */
  static async getProfiles(): Promise<SavedTrackingProfile[]> {
    this.ensureModule()
    const raw = await this.safeExecute(() => LocationServiceModule.getProfiles(), [], "getProfiles failed")
    return raw.map((p: any) => ({
      id: p.id,
      name: p.name,
      interval: p.intervalMs / 1000, // ms → seconds for UI
      distance: p.minUpdateDistance,
      syncInterval: p.syncIntervalSeconds,
      priority: p.priority,
      condition: {
        type: p.conditionType,
        ...(p.speedThreshold != null ? { speedThreshold: p.speedThreshold } : {})
      },
      deactivationDelay: p.deactivationDelaySeconds,
      enabled: p.enabled,
      createdAt: p.createdAt
    }))
  }

  /**
   * Creates a new tracking profile
   * @returns Profile ID
   */
  static async createProfile(profile: Omit<TrackingProfile, "id" | "createdAt">): Promise<number> {
    this.ensureModule()
    logger.debug("[NativeLocationService] Creating profile:", profile.name)
    return LocationServiceModule.createProfile({
      name: profile.name,
      intervalMs: profile.interval * 1000, // seconds → ms
      minUpdateDistance: profile.distance,
      syncIntervalSeconds: profile.syncInterval,
      priority: profile.priority,
      conditionType: profile.condition.type,
      speedThreshold: profile.condition.speedThreshold ?? null,
      deactivationDelaySeconds: profile.deactivationDelay
    })
  }

  /**
   * Updates an existing tracking profile (partial updates supported)
   */
  static async updateProfile(update: Partial<TrackingProfile> & { id: number }): Promise<boolean> {
    this.ensureModule()
    logger.debug("[NativeLocationService] Updating profile:", update.id)

    const config: any = { id: update.id }
    if (update.name !== undefined) config.name = update.name
    if (update.interval !== undefined) config.intervalMs = update.interval * 1000
    if (update.distance !== undefined) config.minUpdateDistance = update.distance
    if (update.syncInterval !== undefined) config.syncIntervalSeconds = update.syncInterval
    if (update.priority !== undefined) config.priority = update.priority
    if (update.condition !== undefined) {
      config.conditionType = update.condition.type
      config.speedThreshold = update.condition.speedThreshold ?? null
    }
    if (update.deactivationDelay !== undefined) config.deactivationDelaySeconds = update.deactivationDelay
    if (update.enabled !== undefined) config.enabled = update.enabled

    return LocationServiceModule.updateProfile(config)
  }

  /**
   * Deletes a tracking profile
   */
  static async deleteProfile(id: number): Promise<boolean> {
    this.ensureModule()
    logger.debug("[NativeLocationService] Deleting profile:", id)
    return LocationServiceModule.deleteProfile(id)
  }

  /**
   * Triggers profile re-evaluation in the foreground service
   */
  static async recheckProfiles(): Promise<void> {
    this.ensureModule()
    try {
      await LocationServiceModule.recheckProfiles()
    } catch (error) {
      logger.error("[NativeLocationService] Profile recheck failed:", error)
    }
  }

  /**
   * Returns the name of the currently active tracking profile, or null if using defaults
   */
  static async getActiveProfileName(): Promise<string | null> {
    this.ensureModule()
    return this.safeExecute(() => LocationServiceModule.getActiveProfile(), null, "getActiveProfile failed")
  }

  // ============================================================================
  // SETTINGS OPERATIONS
  // ============================================================================

  /**
   * Saves a persistent setting
   */
  static async saveSetting(key: string, value: string): Promise<void> {
    this.ensureModule()
    await LocationServiceModule.saveSetting(key, value)
  }

  /**
   * Retrieves a setting by key
   */
  static async getSetting(key: string, defaultValue: string = ""): Promise<string | null> {
    this.ensureModule()
    return LocationServiceModule.getSetting(key, defaultValue || null)
  }

  /**
   * Retrieves all settings as key-value pairs
   */
  static async getAllSettings(): Promise<Record<string, string>> {
    this.ensureModule()
    return this.safeExecute(() => LocationServiceModule.getAllSettings(), {}, "getAllSettings failed")
  }

  // ============================================================================
  // NETWORK
  // ============================================================================

  /**
   * Checks if the device has an active internet connection
   */
  static async isNetworkAvailable(): Promise<boolean> {
    this.ensureModule()
    return this.safeExecute(() => LocationServiceModule.isNetworkAvailable(), false, "isNetworkAvailable failed")
  }

  // ============================================================================
  // BATTERY OPTIMIZATION
  // ============================================================================

  /**
   * Checks if app is exempt from battery optimization
   */
  static async isIgnoringBatteryOptimizations(): Promise<boolean> {
    this.ensureModule()
    return this.safeExecute(
      () => LocationServiceModule.isIgnoringBatteryOptimizations(),
      false,
      "isIgnoringBatteryOptimizations failed"
    )
  }

  /**
   * Requests battery optimization exemption
   * Opens system dialog for user approval
   */
  static async requestIgnoreBatteryOptimizations(): Promise<boolean> {
    this.ensureModule()
    logger.debug("[NativeLocationService] Requesting battery optimization exemption")
    return this.safeExecute(
      () => LocationServiceModule.requestIgnoreBatteryOptimizations(),
      false,
      "requestIgnoreBatteryOptimizations failed"
    )
  }

  // ============================================================================
  // BUILD CONFIGURATION
  // ============================================================================

  /**
   * Gets build configuration constants
   * @returns Build config object with SDK versions, tools versions, etc.
   */
  static getBuildConfig(): {
    MIN_SDK_VERSION: number
    TARGET_SDK_VERSION: number
    COMPILE_SDK_VERSION: number
    BUILD_TOOLS_VERSION: string
    KOTLIN_VERSION: string
    NDK_VERSION: string
    VERSION_NAME: string
    VERSION_CODE: number
    FLAVOR: string
  } | null {
    if (!BuildConfigModule) {
      logger.warn("[NativeLocationService] BuildConfigModule not available")
      return null
    }
    return BuildConfigModule
  }

  // ============================================================================
  // DEVICE INFORMATION
  // ============================================================================

  /**
   * Get all device information at once
   */
  static async getDeviceInfo(): Promise<{
    model: string
    brand: string
    manufacturer: string
    device: string
    deviceId: string
    systemVersion: string
    apiLevel: number
  }> {
    this.ensureModule()
    return LocationServiceModule.getDeviceInfo()
  }

  // ============================================================================
  // FILE MANAGEMENT
  // ============================================================================

  /**
   * Writes content to a file in cache directory
   */
  static async writeFile(fileName: string, content: string): Promise<string> {
    this.ensureModule()
    return LocationServiceModule.writeFile(fileName, content)
  }

  /**
   * Shares a file using native share sheet
   */
  static async shareFile(filePath: string, mimeType: string, title: string): Promise<boolean> {
    this.ensureModule()
    return LocationServiceModule.shareFile(filePath, mimeType, title)
  }

  /**
   * Copies text to the system clipboard
   */
  static async copyToClipboard(text: string, label: string = "Colota"): Promise<void> {
    this.ensureModule()
    await LocationServiceModule.copyToClipboard(text, label)
  }

  /**
   * Deletes a file
   */
  static async deleteFile(filePath: string): Promise<boolean> {
    this.ensureModule()
    return LocationServiceModule.deleteFile(filePath)
  }

  /**
   * Gets cache directory path
   */
  static async getCacheDirectory(): Promise<string> {
    this.ensureModule()
    return LocationServiceModule.getCacheDirectory()
  }

  /**
   * Returns native (Kotlin) Logcat entries for the app's process
   */
  static async getNativeLogs(): Promise<string[]> {
    this.ensureModule()
    return LocationServiceModule.getNativeLogs()
  }

  // ============================================================================
  // SECURE STORAGE (Auth & Headers)
  // ============================================================================

  /**
   * Retrieves the full auth configuration from encrypted storage
   */
  static async getAuthConfig(): Promise<AuthConfig> {
    this.ensureModule()
    const raw = await LocationServiceModule.getAllAuthConfig()

    let customHeaders: Record<string, string> = {}
    if (raw.customHeaders) {
      try {
        customHeaders = JSON.parse(raw.customHeaders)
      } catch {
        // Corrupted JSON - reset to empty
      }
    }

    return {
      authType: raw.authType || "none",
      username: raw.username || "",
      password: raw.password || "",
      bearerToken: raw.bearerToken || "",
      customHeaders
    }
  }

  /**
   * Saves auth configuration to encrypted storage
   */
  static async saveAuthConfig(config: AuthConfig): Promise<boolean> {
    this.ensureModule()
    return LocationServiceModule.saveAuthConfig({
      authType: config.authType,
      username: config.username,
      password: config.password,
      bearerToken: config.bearerToken,
      customHeaders: JSON.stringify(config.customHeaders)
    })
  }

  /**
   * Returns computed auth + custom headers for HTTP requests
   */
  static async getAuthHeaders(): Promise<Record<string, string>> {
    this.ensureModule()
    return LocationServiceModule.getAuthHeaders()
  }
}

export default NativeLocationService
