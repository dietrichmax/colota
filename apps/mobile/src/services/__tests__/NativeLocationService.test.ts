jest.mock("react-native", () => ({
  NativeModules: {
    LocationServiceModule: {
      startService: jest.fn().mockResolvedValue(undefined),
      stopService: jest.fn(),
      isServiceRunning: jest.fn().mockResolvedValue(true),
      getStats: jest.fn().mockResolvedValue({
        queued: 5,
        sent: 100,
        total: 105,
        today: 20,
        databaseSizeMB: 1.5,
        lastSyncTime: 0,
        lastSyncError: ""
      }),
      getTableData: jest.fn().mockResolvedValue([]),
      getLocationsByDateRange: jest.fn().mockResolvedValue([]),
      getMostRecentLocation: jest.fn().mockResolvedValue(null),
      manualFlush: jest.fn().mockResolvedValue(true),
      clearSentHistory: jest.fn().mockResolvedValue(42),
      clearQueue: jest.fn().mockResolvedValue(10),
      clearAllLocations: jest.fn().mockResolvedValue(50),
      deleteOlderThan: jest.fn().mockResolvedValue(25),
      countOlderThan: jest.fn().mockResolvedValue({ total: 3120, cutoffSeconds: 1735689600 }),
      countUnsentOlderThan: jest.fn().mockResolvedValue(96),
      deleteLocationsInRange: jest.fn().mockResolvedValue(7),
      deleteLocationsByIds: jest.fn().mockResolvedValue(1),
      vacuumDatabase: jest.fn().mockResolvedValue(undefined),
      getGeofences: jest.fn().mockResolvedValue([]),
      createGeofence: jest.fn().mockResolvedValue(1),
      updateGeofence: jest.fn().mockResolvedValue(true),
      deleteGeofence: jest.fn().mockResolvedValue(true),
      checkCurrentPauseZone: jest.fn().mockResolvedValue(null),
      recheckZoneSettings: jest.fn().mockResolvedValue(undefined),
      saveSetting: jest.fn().mockResolvedValue(undefined),
      getSetting: jest.fn().mockResolvedValue(null),
      getAllSettings: jest.fn().mockResolvedValue({}),
      isIgnoringBatteryOptimizations: jest.fn().mockResolvedValue(false),
      requestIgnoreBatteryOptimizations: jest.fn().mockResolvedValue(true),
      getDeviceInfo: jest.fn().mockResolvedValue({
        model: "Pixel 7",
        brand: "Google",
        manufacturer: "Google",
        device: "panther",
        deviceId: "panther",
        systemVersion: "14",
        apiLevel: 34
      }),
      writeFile: jest.fn().mockResolvedValue("/cache/test.csv"),
      shareFile: jest.fn().mockResolvedValue(true),
      pickExportDirectory: jest.fn().mockResolvedValue("content://com.android.externalstorage/tree/primary%3AExports"),
      scheduleAutoExport: jest.fn().mockResolvedValue(true),
      cancelAutoExport: jest.fn().mockResolvedValue(true),
      runAutoExportNow: jest.fn().mockResolvedValue(true),
      exportToFile: jest.fn().mockResolvedValue({
        filePath: "/cache/manual_export_2024-01-15_0930.geojson",
        mimeType: "application/json",
        rowCount: 150
      }),
      getAutoExportStatus: jest.fn().mockResolvedValue({
        enabled: true,
        format: "geojson",
        interval: "daily",
        uri: "content://some-uri",
        mode: "all",
        lastExportTimestamp: 1700000000,
        nextExportTimestamp: 1700086400,
        fileCount: 3
      }),
      copyToClipboard: jest.fn().mockResolvedValue(undefined),
      deleteFile: jest.fn().mockResolvedValue(true),
      getCacheDirectory: jest.fn().mockResolvedValue("/cache"),
      getAllAuthConfig: jest.fn().mockResolvedValue({
        authType: "none",
        username: "",
        password: "",
        bearerToken: "",
        customHeaders: "{}"
      }),
      saveAuthConfig: jest.fn().mockResolvedValue(true),
      getAuthHeaders: jest.fn().mockResolvedValue({}),
      isNetworkAvailable: jest.fn().mockResolvedValue(true),
      isValidEndpointProtocol: jest.fn().mockResolvedValue(true),
      isPrivateEndpoint: jest.fn().mockResolvedValue(false),
      getActiveProfile: jest.fn().mockResolvedValue(null)
    },
    BuildConfigModule: {
      MIN_SDK_VERSION: 26,
      TARGET_SDK_VERSION: 34,
      COMPILE_SDK_VERSION: 34,
      BUILD_TOOLS_VERSION: "34.0.0",
      KOTLIN_VERSION: "1.9.0",
      NDK_VERSION: "25.1.8937393",
      VERSION_NAME: "1.0.0",
      VERSION_CODE: 1,
      FLAVOR: "gms",
      getSystemPalette: jest.fn().mockResolvedValue(null)
    }
  }
}))

import { NativeModules } from "react-native"
import NativeLocationService from "../NativeLocationService"
import { SETTINGS_READ_ATTEMPTS } from "../../constants"

const nativeMock = NativeModules.LocationServiceModule as Record<string, jest.Mock>

beforeEach(() => {
  jest.clearAllMocks()
  // clearAllMocks keeps implementations, so a rejecting test would leak into the next one.
  nativeMock.getAllSettings.mockResolvedValue({})
})

describe("NativeLocationService", () => {
  describe("start", () => {
    it("converts interval from seconds to milliseconds", async () => {
      const settings = {
        interval: 5,
        distance: 10,
        endpoint: "https://example.com",
        fieldMap: { lat: "lat", lon: "lon", acc: "acc" },
        syncInterval: 0,
        retryInterval: 30,
        filterInaccurateLocations: false,
        accuracyThreshold: 50,
        isOfflineMode: false,
        syncCondition: "any" as const,
        syncSsid: "",
        customFields: [],
        apiTemplate: "custom" as const,
        syncPreset: "instant" as const,
        httpMethod: "POST" as const,
        dawarichMode: "single" as const,
        overlandBatchSize: 50,
        hasCompletedSetup: false
      }

      await NativeLocationService.start(settings)

      expect(nativeMock.startService).toHaveBeenCalledWith(
        expect.objectContaining({
          interval: 5000,
          minUpdateDistance: 10,
          httpMethod: "POST",
          apiTemplate: "custom"
        })
      )
    })

    it("passes apiTemplate and httpMethod GET to native for traccar template", async () => {
      const settings = {
        interval: 5,
        distance: 10,
        endpoint: "https://traccar.example.com:5055/",
        fieldMap: { lat: "lat", lon: "lon", acc: "accuracy" },
        syncInterval: 0,
        retryInterval: 30,
        filterInaccurateLocations: false,
        accuracyThreshold: 50,
        isOfflineMode: false,
        syncCondition: "any" as const,
        syncSsid: "",
        customFields: [],
        apiTemplate: "traccar" as const,
        syncPreset: "instant" as const,
        httpMethod: "GET" as const,
        dawarichMode: "single" as const,
        overlandBatchSize: 50,
        hasCompletedSetup: false
      }

      await NativeLocationService.start(settings)

      expect(nativeMock.startService).toHaveBeenCalledWith(
        expect.objectContaining({
          httpMethod: "GET",
          apiTemplate: "traccar"
        })
      )
    })

    it("passes apiTemplate and httpMethod POST to native for traccar JSON format", async () => {
      const settings = {
        interval: 5,
        distance: 10,
        endpoint: "http://192.168.1.1:5055/",
        fieldMap: { lat: "lat", lon: "lon", acc: "acc" },
        syncInterval: 0,
        retryInterval: 30,
        filterInaccurateLocations: false,
        accuracyThreshold: 50,
        isOfflineMode: false,
        syncCondition: "any" as const,
        syncSsid: "",
        customFields: [],
        apiTemplate: "traccar" as const,
        syncPreset: "instant" as const,
        httpMethod: "POST" as const,
        dawarichMode: "single" as const,
        overlandBatchSize: 50,
        hasCompletedSetup: false
      }

      await NativeLocationService.start(settings)

      expect(nativeMock.startService).toHaveBeenCalledWith(
        expect.objectContaining({
          httpMethod: "POST",
          apiTemplate: "traccar"
        })
      )
    })
  })

  describe("stop", () => {
    it("calls native stopService", () => {
      NativeLocationService.stop()
      expect(nativeMock.stopService).toHaveBeenCalled()
    })
  })

  describe("isServiceRunning", () => {
    it("reports the native service's own liveness", async () => {
      nativeMock.isServiceRunning.mockResolvedValueOnce(false)
      expect(await NativeLocationService.isServiceRunning()).toBe(false)
    })

    it("returns null when the bridge fails, so callers cannot mistake it for a dead service", async () => {
      nativeMock.isServiceRunning.mockRejectedValueOnce(new Error("bridge gone"))
      expect(await NativeLocationService.isServiceRunning()).toBeNull()
    })
  })

  describe("getStats", () => {
    it("returns database stats", async () => {
      const stats = await NativeLocationService.getStats()
      expect(stats).toEqual({
        queued: 5,
        sent: 100,
        total: 105,
        today: 20,
        databaseSizeMB: 1.5,
        lastSyncTime: 0,
        lastSyncError: ""
      })
    })
  })

  describe("getTableData", () => {
    it("returns empty array on error", async () => {
      nativeMock.getTableData.mockRejectedValueOnce(new Error("DB error"))
      const result = await NativeLocationService.getTableData("locations", 10)
      expect(result).toEqual([])
    })

    it("passes table name, limit, and offset", async () => {
      await NativeLocationService.getTableData("queue", 50, 10)
      expect(nativeMock.getTableData).toHaveBeenCalledWith("queue", 50, 10)
    })
  })

  describe("getAllSettings", () => {
    it("returns the stored settings", async () => {
      nativeMock.getAllSettings.mockResolvedValueOnce({ interval: "5000" })
      await expect(NativeLocationService.getAllSettings()).resolves.toEqual({ interval: "5000" })
    })

    it("recovers when a retry succeeds", async () => {
      nativeMock.getAllSettings
        .mockRejectedValueOnce(new Error("database is locked"))
        .mockResolvedValueOnce({ endpoint: "https://kept.example/api" })

      await expect(NativeLocationService.getAllSettings()).resolves.toEqual({ endpoint: "https://kept.example/api" })
      expect(nativeMock.getAllSettings).toHaveBeenCalledTimes(2)
    })

    // Hydration seeds the table with defaults on an empty result, so a read that never succeeded must reject.
    it("rejects once every attempt has failed", async () => {
      nativeMock.getAllSettings.mockRejectedValue(new Error("database is locked"))

      await expect(NativeLocationService.getAllSettings()).rejects.toThrow("database is locked")
      expect(nativeMock.getAllSettings).toHaveBeenCalledTimes(SETTINGS_READ_ATTEMPTS)
    })
  })

  describe("getAuthConfig", () => {
    it("parses JSON customHeaders from raw string", async () => {
      nativeMock.getAllAuthConfig.mockResolvedValueOnce({
        authType: "basic",
        username: "user",
        password: "pass",
        bearerToken: "",
        customHeaders: '{"X-Custom":"value"}'
      })

      const config = await NativeLocationService.getAuthConfig()
      expect(config.customHeaders).toEqual({ "X-Custom": "value" })
      expect(config.authType).toBe("basic")
    })

    it("returns empty object when customHeaders is null", async () => {
      nativeMock.getAllAuthConfig.mockResolvedValueOnce({
        authType: "none",
        username: "",
        password: "",
        bearerToken: "",
        customHeaders: null
      })

      const config = await NativeLocationService.getAuthConfig()
      expect(config.customHeaders).toEqual({})
    })
  })

  describe("saveAuthConfig", () => {
    it("stringifies customHeaders before saving", async () => {
      await NativeLocationService.saveAuthConfig({
        authType: "bearer",
        username: "",
        password: "",
        bearerToken: "tok123",
        customHeaders: { "X-Api-Key": "abc" }
      })

      expect(nativeMock.saveAuthConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          customHeaders: '{"X-Api-Key":"abc"}'
        })
      )
    })
  })

  describe("getBuildConfig", () => {
    it("returns build config when module is available", () => {
      const config = NativeLocationService.getBuildConfig()
      expect(config).toEqual(
        expect.objectContaining({
          MIN_SDK_VERSION: 26,
          VERSION_NAME: "1.0.0"
        })
      )
    })
  })

  describe("getSystemPalette", () => {
    const palette = {
      accent1_100: "#D6E3FF",
      accent1_200: "#ABC7FF",
      accent1_300: "#8AB4F8",
      accent1_600: "#2B5CB8",
      accent1_700: "#12459E",
      accent1_800: "#002E6B",
      accent1_900: "#001B3F",
      neutral1_0: "#FFFFFF",
      neutral1_50: "#F3F3F6",
      neutral1_600: "#5B5C63",
      neutral1_700: "#43444B",
      neutral1_800: "#2C2D33",
      neutral1_900: "#1A1B1F",
      neutral2_100: "#E3E2E9",
      neutral2_200: "#C7C6CE",
      neutral2_300: "#ABAAB2",
      neutral2_400: "#909097",
      neutral2_500: "#76767D",
      neutral2_600: "#5E5E65",
      neutral2_700: "#46464D",
      neutral2_800: "#2F2F35"
    }

    it("passes a complete palette through", async () => {
      ;(NativeModules.BuildConfigModule.getSystemPalette as jest.Mock).mockResolvedValueOnce(palette)

      await expect(NativeLocationService.getSystemPalette()).resolves.toEqual(palette)
    })

    it("returns null below API 31, where the native side has nothing to send", async () => {
      ;(NativeModules.BuildConfigModule.getSystemPalette as jest.Mock).mockResolvedValueOnce(null)

      await expect(NativeLocationService.getSystemPalette()).resolves.toBeNull()
    })

    it("drops a partial palette rather than letting undefined reach a style prop", async () => {
      const incomplete: Record<string, string> = { ...palette }
      delete incomplete.neutral2_500
      ;(NativeModules.BuildConfigModule.getSystemPalette as jest.Mock).mockResolvedValueOnce(incomplete)

      await expect(NativeLocationService.getSystemPalette()).resolves.toBeNull()
    })

    it("returns null when the bridge rejects, so a failed read is not a crash", async () => {
      ;(NativeModules.BuildConfigModule.getSystemPalette as jest.Mock).mockRejectedValueOnce(new Error("no resource"))

      await expect(NativeLocationService.getSystemPalette()).resolves.toBeNull()
    })
  })

  describe("geofence operations", () => {
    it("createGeofence passes correct parameters", async () => {
      await NativeLocationService.createGeofence({
        name: "Home",
        lat: 48.1,
        lon: 11.5,
        radius: 100,
        enabled: true,
        pauseTracking: true,
        pauseOnWifi: false,
        pauseOnMotionless: false,
        motionlessTimeoutMinutes: 10,
        heartbeatEnabled: false,
        heartbeatIntervalMinutes: 15
      })

      expect(nativeMock.createGeofence).toHaveBeenCalledWith("Home", 48.1, 11.5, 100, true, false, false, 10, false, 15)
    })

    it("deleteGeofence passes id", async () => {
      await NativeLocationService.deleteGeofence(42)
      expect(nativeMock.deleteGeofence).toHaveBeenCalledWith(42)
    })
  })

  describe("getActiveProfile", () => {
    it("returns the name and id when a profile is active, so a reconnecting UI can resolve its interval", async () => {
      nativeMock.getActiveProfile.mockResolvedValueOnce({ name: "Charging", id: 3 })
      const profile = await NativeLocationService.getActiveProfile()
      expect(profile).toEqual({ name: "Charging", id: 3 })
      expect(nativeMock.getActiveProfile).toHaveBeenCalled()
    })

    it("returns null when no profile is active", async () => {
      nativeMock.getActiveProfile.mockResolvedValueOnce(null)
      const profile = await NativeLocationService.getActiveProfile()
      expect(profile).toBeNull()
    })

    it("returns null on error", async () => {
      nativeMock.getActiveProfile.mockRejectedValueOnce(new Error("Native error"))
      const profile = await NativeLocationService.getActiveProfile()
      expect(profile).toBeNull()
    })
  })

  describe("deleteLocationsByIds", () => {
    it("passes the ids to the native module", async () => {
      const deleted = await NativeLocationService.deleteLocationsByIds([12, 34])
      expect(deleted).toBe(1)
      expect(nativeMock.deleteLocationsByIds).toHaveBeenCalledWith([12, 34])
    })

    it("skips the bridge call for an empty list", async () => {
      const deleted = await NativeLocationService.deleteLocationsByIds([])
      expect(deleted).toBe(0)
      expect(nativeMock.deleteLocationsByIds).not.toHaveBeenCalled()
    })
  })

  describe("the age counts", () => {
    it("hands the age to the cheap count and returns the boundary native used", async () => {
      const counted = await NativeLocationService.countOlderThan(90)

      expect(nativeMock.countOlderThan).toHaveBeenCalledWith(90)
      expect(counted).toEqual({ total: 3120, cutoffSeconds: 1735689600 })
    })

    // Separate on purpose: this one reads every matching row, so it runs on a press and never while
    // the user types. A single method would put that cost on the typing path.
    it("keeps the expensive unsent count a separate call", async () => {
      const unsent = await NativeLocationService.countUnsentOlderThan(90)

      expect(nativeMock.countUnsentOlderThan).toHaveBeenCalledWith(90)
      expect(unsent).toBe(96)
      expect(nativeMock.countOlderThan).not.toHaveBeenCalled()
    })
  })

  describe("the bulk deletes", () => {
    it("resolves how many rows each one took", async () => {
      expect(await NativeLocationService.clearSentHistory()).toBe(42)
      expect(await NativeLocationService.clearQueue()).toBe(10)
      expect(await NativeLocationService.clearAllLocations()).toBe(50)
      expect(await NativeLocationService.deleteOlderThan(90)).toBe(25)
      expect(nativeMock.deleteOlderThan).toHaveBeenCalledWith(90)
    })

    // Each is a static opening with this.ensureModule(), so a bare reference loses its receiver and
    // throws before it reaches native. Three of these shipped dead exactly that way.
    it("survives being passed as a bare callback", async () => {
      const run = async (fn: () => Promise<number>) => fn()

      await expect(run(() => NativeLocationService.clearSentHistory())).resolves.toBe(42)
      await expect(run(() => NativeLocationService.clearAllLocations())).resolves.toBe(50)
    })
  })

  describe("file operations", () => {
    it("writeFile returns file path", async () => {
      const path = await NativeLocationService.writeFile("test.csv", "data")
      expect(path).toBe("/cache/test.csv")
    })
  })

  describe("auto-export", () => {
    it("pickExportDirectory returns SAF URI", async () => {
      const uri = await NativeLocationService.pickExportDirectory()
      expect(uri).toBe("content://com.android.externalstorage/tree/primary%3AExports")
      expect(nativeMock.pickExportDirectory).toHaveBeenCalled()
    })

    it("scheduleAutoExport calls native module", async () => {
      const result = await NativeLocationService.scheduleAutoExport()
      expect(result).toBe(true)
      expect(nativeMock.scheduleAutoExport).toHaveBeenCalled()
    })

    it("cancelAutoExport calls native module", async () => {
      const result = await NativeLocationService.cancelAutoExport()
      expect(result).toBe(true)
      expect(nativeMock.cancelAutoExport).toHaveBeenCalled()
    })

    it("getAutoExportStatus returns status object", async () => {
      const status = await NativeLocationService.getAutoExportStatus()
      expect(status).toEqual({
        enabled: true,
        format: "geojson",
        interval: "daily",
        uri: "content://some-uri",
        mode: "all",
        lastExportTimestamp: 1700000000,
        nextExportTimestamp: 1700086400,
        fileCount: 3
      })
    })

    it("runAutoExportNow calls native module", async () => {
      const result = await NativeLocationService.runAutoExportNow()
      expect(result).toBe(true)
      expect(nativeMock.runAutoExportNow).toHaveBeenCalled()
    })

    it("exportToFile returns file info", async () => {
      const result = await NativeLocationService.exportToFile("geojson")
      expect(result).toEqual({
        filePath: "/cache/manual_export_2024-01-15_0930.geojson",
        mimeType: "application/json",
        rowCount: 150
      })
      expect(nativeMock.exportToFile).toHaveBeenCalledWith("geojson")
    })
  })
})
