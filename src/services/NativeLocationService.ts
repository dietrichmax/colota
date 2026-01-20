/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { NativeModules } from "react-native";
import { DatabaseStats, Geofence, Settings } from "../types/global";

const { LocationServiceModule, BuildConfigModule } = NativeModules;

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
      throw new Error(
        "[NativeLocationService] Module not available. Check native linking."
      );
    }
  }

  /**
   * Wraps async native calls with error handling
   */
  private static async safeExecute<T>(
    operation: () => Promise<T>,
    fallback: T,
    errorPrefix: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      console.error(`[NativeLocationService] ${errorPrefix}:`, error);
      return fallback;
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
    this.ensureModule();

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
    };

    console.log(
      `[NativeLocationService] Starting service - interval: ${settings.interval}s, distance: ${settings.distance}m, sync: ${settings.syncInterval}s`
    );

    try {
      await LocationServiceModule.startService(config);
      console.log("[NativeLocationService] ✅ Service started");
    } catch (error) {
      console.error("[NativeLocationService] ❌ Start failed:", error);
      throw error;
    }
  }

  /**
   * Stops the foreground service and GPS polling
   */
  static stop(): void {
    if (!LocationServiceModule) {
      console.warn("[NativeLocationService] Module not available");
      return;
    }

    console.log("[NativeLocationService] Stopping service");
    LocationServiceModule.stopService();
  }

  /**
   * Checks if the foreground service is currently running
   */
  static async isServiceRunning(): Promise<boolean> {
    this.ensureModule();
    return this.safeExecute(
      () => LocationServiceModule.isServiceRunning(),
      false,
      "isServiceRunning failed"
    );
  }

  /**
   * Checks if tracking is enabled (from persistent settings)
   */
  static async isTrackingActive(): Promise<boolean> {
    this.ensureModule();
    const state = await this.getSetting("tracking_enabled", "false");
    return state === "true";
  }

  // ============================================================================
  // QUEUE OPERATIONS
  // ============================================================================

  /**
   * Forces immediate upload of all pending locations
   * @returns True if flush succeeded
   */
  static async manualFlush(): Promise<boolean> {
    this.ensureModule();
    console.log("[NativeLocationService] Triggering manual flush");
    try {
      const result = await LocationServiceModule.manualFlush();
      console.log("[NativeLocationService] ✅ Flush completed");
      return result;
    } catch (error) {
      console.error("[NativeLocationService] ❌ Flush failed:", error);
      throw error;
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
  static async getTableData(
    tableName: string,
    limit: number,
    offset: number = 0
  ): Promise<any[]> {
    this.ensureModule();
    return this.safeExecute(
      () => LocationServiceModule.getTableData(tableName, limit, offset),
      [],
      `getTableData(${tableName}) failed`
    );
  }

  /**
   * Returns database health summary
   */
  static async getStats(): Promise<DatabaseStats> {
    this.ensureModule();
    return LocationServiceModule.getStats();
  }

  /**
   * Gets count of locations waiting for transmission
   */
  static async getQueuedCount(): Promise<number> {
    this.ensureModule();
    return this.safeExecute(
      () => LocationServiceModule.getQueuedLocationsCount(),
      0,
      "getQueuedCount failed"
    );
  }

  /**
   * Gets count of successfully sent locations
   */
  static async getSentCount(): Promise<number> {
    this.ensureModule();
    return this.safeExecute(
      () => LocationServiceModule.getSentCount(),
      0,
      "getSentCount failed"
    );
  }

  /**
   * Gets count of locations captured today
   */
  static async getTodayCount(): Promise<number> {
    this.ensureModule();
    return this.safeExecute(
      () => LocationServiceModule.getTodayCount(),
      0,
      "getTodayCount failed"
    );
  }

  /**
   * Gets database file size in bytes
   */
  static async getDatabaseSize(): Promise<number> {
    this.ensureModule();
    return this.safeExecute(
      () => LocationServiceModule.getDatabaseSize(),
      0,
      "getDatabaseSize failed"
    );
  }

  /**
   * Fetches all locations for export
   * @param limit Maximum records to export (default: 5000)
   */
  static async getExportData(limit: number = 5000): Promise<any[]> {
    this.ensureModule();
    return this.safeExecute(
      () => LocationServiceModule.getTableData("locations", limit, 0),
      [],
      "getExportData failed"
    );
  }

  /**
   * Gets the most recent location from the database
   */
  static async getMostRecentLocation(): Promise<any | null> {
    this.ensureModule();
    return this.safeExecute(
      () => LocationServiceModule.getMostRecentLocation(),
      null,
      "getMostRecentLocation failed"
    );
  }

  // ============================================================================
  // CLEANUP OPERATIONS
  // ============================================================================

  /**
   * Deletes all successfully sent locations
   */
  static async clearSentHistory(): Promise<void> {
    this.ensureModule();
    console.log("[NativeLocationService] Clearing sent history");
    await LocationServiceModule.clearSentHistory();
  }

  /**
   * Deletes all queued (unsent) locations
   * @returns Count of deleted records
   */
  static async clearQueue(): Promise<number> {
    this.ensureModule();
    console.log("[NativeLocationService] Clearing queue");
    return LocationServiceModule.clearQueue();
  }

  /**
   * Deletes all location data (sent + queued)
   * @returns Count of deleted records
   */
  static async clearAllLocations(): Promise<number> {
    this.ensureModule();
    console.log("[NativeLocationService] Clearing all locations");
    return LocationServiceModule.clearAllLocations();
  }

  /**
   * Deletes locations older than specified days
   * @param days Age threshold in days
   * @returns Count of deleted records
   */
  static async deleteOlderThan(days: number): Promise<number> {
    this.ensureModule();
    console.log(
      `[NativeLocationService] Deleting locations older than ${days} days`
    );
    return LocationServiceModule.deleteOlderThan(days);
  }

  /**
   * Runs SQLite VACUUM to reclaim disk space
   */
  static async vacuumDatabase(): Promise<void> {
    this.ensureModule();
    console.log("[NativeLocationService] Vacuuming database");
    await LocationServiceModule.vacuumDatabase();
  }

  // ============================================================================
  // GEOFENCE OPERATIONS
  // ============================================================================

  /**
   * Fetches all geofences
   */
  static async getGeofences(): Promise<Geofence[]> {
    this.ensureModule();
    return this.safeExecute(
      () => LocationServiceModule.getGeofences(),
      [],
      "getGeofences failed"
    );
  }

  /**
   * Creates a new geofence
   * @returns Geofence ID
   */
  static async createGeofence(
    geofence: Omit<Geofence, "id" | "createdAt">
  ): Promise<number> {
    this.ensureModule();
    console.log("[NativeLocationService] Creating geofence:", geofence.name);
    return LocationServiceModule.createGeofence(
      geofence.name,
      geofence.lat,
      geofence.lon,
      geofence.radius,
      geofence.pauseTracking
    );
  }

  /**
   * Updates an existing geofence (partial updates supported)
   */
  static async updateGeofence(
    update: Partial<Geofence> & { id: number }
  ): Promise<boolean> {
    this.ensureModule();

    if (!update.id) {
      throw new Error("Geofence ID is required");
    }

    console.log("[NativeLocationService] Updating geofence:", update.id);
    return LocationServiceModule.updateGeofence(
      update.id,
      update.name ?? null,
      update.lat ?? null,
      update.lon ?? null,
      update.radius ?? null,
      update.enabled ?? null,
      update.pauseTracking ?? null
    );
  }

  /**
   * Deletes a geofence
   */
  static async deleteGeofence(id: number): Promise<boolean> {
    this.ensureModule();
    console.log("[NativeLocationService] Deleting geofence:", id);
    return LocationServiceModule.deleteGeofence(id);
  }

  /**
   * Checks if device is currently inside a silent zone
   * @returns Silent zone name or null
   */
  static async checkCurrentSilentZone(): Promise<string | null> {
    this.ensureModule();
    return this.safeExecute(
      () => LocationServiceModule.checkCurrentSilentZone(),
      null,
      "checkCurrentSilentZone failed"
    );
  }

  // ============================================================================
  // SETTINGS OPERATIONS
  // ============================================================================

  /**
   * Saves a persistent setting
   */
  static async saveSetting(key: string, value: string): Promise<void> {
    this.ensureModule();
    await LocationServiceModule.saveSetting(key, value);
  }

  /**
   * Retrieves a setting by key
   */
  static async getSetting(
    key: string,
    defaultValue: string = ""
  ): Promise<string | null> {
    this.ensureModule();
    return LocationServiceModule.getSetting(key, defaultValue || null);
  }

  /**
   * Retrieves all settings as key-value pairs
   */
  static async getAllSettings(): Promise<Record<string, string>> {
    this.ensureModule();
    return this.safeExecute(
      () => LocationServiceModule.getAllSettings(),
      {},
      "getAllSettings failed"
    );
  }

  // ============================================================================
  // BATTERY OPTIMIZATION
  // ============================================================================

  /**
   * Checks if app is exempt from battery optimization
   */
  static async isIgnoringBatteryOptimizations(): Promise<boolean> {
    this.ensureModule();
    return this.safeExecute(
      () => LocationServiceModule.isIgnoringBatteryOptimizations(),
      false,
      "isIgnoringBatteryOptimizations failed"
    );
  }

  /**
   * Requests battery optimization exemption
   * Opens system dialog for user approval
   */
  static async requestIgnoreBatteryOptimizations(): Promise<boolean> {
    this.ensureModule();
    console.log(
      "[NativeLocationService] Requesting battery optimization exemption"
    );
    return this.safeExecute(
      () => LocationServiceModule.requestIgnoreBatteryOptimizations(),
      false,
      "requestIgnoreBatteryOptimizations failed"
    );
  }

  // ============================================================================
  // BUILD CONFIGURATION
  // ============================================================================

  /**
   * Gets build configuration constants
   * @returns Build config object with SDK versions, tools versions, etc.
   */
  static getBuildConfig(): {
    MIN_SDK_VERSION: number;
    TARGET_SDK_VERSION: number;
    COMPILE_SDK_VERSION: number;
    BUILD_TOOLS_VERSION: string;
    KOTLIN_VERSION: string;
    NDK_VERSION: string;
    VERSION_NAME: string;
    VERSION_CODE: number;
  } | null {
    if (!BuildConfigModule) {
      console.warn("[NativeLocationService] BuildConfigModule not available");
      return null;
    }
    return BuildConfigModule;
  }
}

export default NativeLocationService;
