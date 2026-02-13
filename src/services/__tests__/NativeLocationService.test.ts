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
        databaseSizeMB: 1.5
      }),
      getTableData: jest.fn().mockResolvedValue([]),
      getMostRecentLocation: jest.fn().mockResolvedValue(null),
      manualFlush: jest.fn().mockResolvedValue(true),
      clearSentHistory: jest.fn().mockResolvedValue(undefined),
      clearQueue: jest.fn().mockResolvedValue(10),
      clearAllLocations: jest.fn().mockResolvedValue(50),
      deleteOlderThan: jest.fn().mockResolvedValue(25),
      vacuumDatabase: jest.fn().mockResolvedValue(undefined),
      getGeofences: jest.fn().mockResolvedValue([]),
      createGeofence: jest.fn().mockResolvedValue(1),
      updateGeofence: jest.fn().mockResolvedValue(true),
      deleteGeofence: jest.fn().mockResolvedValue(true),
      checkCurrentSilentZone: jest.fn().mockResolvedValue(null),
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
      getAuthHeaders: jest.fn().mockResolvedValue({})
    },
    BuildConfigModule: {
      MIN_SDK_VERSION: 26,
      TARGET_SDK_VERSION: 34,
      COMPILE_SDK_VERSION: 34,
      BUILD_TOOLS_VERSION: "34.0.0",
      KOTLIN_VERSION: "1.9.0",
      NDK_VERSION: "25.1.8937393",
      VERSION_NAME: "1.0.0",
      VERSION_CODE: 1
    }
  }
}))

import { NativeModules } from "react-native"
import NativeLocationService from "../NativeLocationService"

const nativeMock = NativeModules.LocationServiceModule as Record<string, jest.Mock>

beforeEach(() => {
  jest.clearAllMocks()
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
        maxRetries: 5,
        filterInaccurateLocations: false,
        accuracyThreshold: 50,
        isOfflineMode: false,
        customFields: [],
        apiTemplate: "custom" as const,
        syncPreset: "instant" as const
      }

      await NativeLocationService.start(settings)

      expect(nativeMock.startService).toHaveBeenCalledWith(
        expect.objectContaining({
          interval: 5000,
          minUpdateDistance: 10
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

  describe("getStats", () => {
    it("returns database stats", async () => {
      const stats = await NativeLocationService.getStats()
      expect(stats).toEqual({
        queued: 5,
        sent: 100,
        total: 105,
        today: 20,
        databaseSizeMB: 1.5
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

  describe("geofence operations", () => {
    it("createGeofence passes correct parameters", async () => {
      await NativeLocationService.createGeofence({
        name: "Home",
        lat: 48.1,
        lon: 11.5,
        radius: 100,
        enabled: true,
        pauseTracking: true
      })

      expect(nativeMock.createGeofence).toHaveBeenCalledWith("Home", 48.1, 11.5, 100, true)
    })

    it("deleteGeofence passes id", async () => {
      await NativeLocationService.deleteGeofence(42)
      expect(nativeMock.deleteGeofence).toHaveBeenCalledWith(42)
    })
  })

  describe("file operations", () => {
    it("writeFile returns file path", async () => {
      const path = await NativeLocationService.writeFile("test.csv", "data")
      expect(path).toBe("/cache/test.csv")
    })
  })
})
