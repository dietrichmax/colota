import React from "react"
import { renderHook, act } from "@testing-library/react-native"
import { DEFAULT_SETTINGS } from "../../types/global"

jest.mock("../../services/NativeLocationService", () => ({
  getAllSettings: jest.fn().mockResolvedValue({}),
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn(),
  saveSetting: jest.fn().mockResolvedValue(undefined),
  isServiceRunning: jest.fn().mockResolvedValue(false),
  isTrackingActive: jest.fn().mockResolvedValue(false),
  getActiveProfileName: jest.fn().mockResolvedValue(null)
}))

jest.mock("../../services/SettingsService", () => ({
  updateMultiple: jest.fn().mockResolvedValue(undefined),
  updateSetting: jest.fn().mockResolvedValue(true)
}))

jest.mock("../../components/ui/LocationDisclosureModal", () => ({
  LocationDisclosureModal: () => null
}))

jest.mock("../../components/ui/LocalNetworkDisclosureModal", () => ({
  LocalNetworkDisclosureModal: () => null
}))

jest.mock("../../components/ui/AppModal", () => ({
  AppModal: () => null
}))

const mockStartTracking = jest.fn().mockResolvedValue(undefined)
const mockStopTracking = jest.fn()
const mockRestartTracking = jest.fn().mockResolvedValue(undefined)
const mockReconnect = jest.fn()

jest.mock("../../hooks/useLocationTracking", () => ({
  useLocationTracking: jest.fn(() => ({
    coords: null,
    tracking: false,
    startTracking: mockStartTracking,
    stopTracking: mockStopTracking,
    restartTracking: mockRestartTracking,
    reconnect: mockReconnect,
    settings: require("../../types/global").DEFAULT_SETTINGS
  }))
}))

jest.mock("../../utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}))

import { TrackingProvider, useTracking, parseRawSettings } from "../TrackingProvider"
import NativeLocationService from "../../services/NativeLocationService"
import SettingsService from "../../services/SettingsService"
import { logger } from "../../utils/logger"

const mockGetAllSettings = NativeLocationService.getAllSettings as jest.Mock
const mockUpdateMultiple = SettingsService.updateMultiple as jest.Mock
const mockGetActiveProfileName = NativeLocationService.getActiveProfileName as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAllSettings.mockResolvedValue({})
})

const settleHydration = async () => {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 100))
  })
}

const wrapper = ({ children }: { children: React.ReactNode }) => <TrackingProvider>{children}</TrackingProvider>

describe("useTracking", () => {
  it("throws when used outside TrackingProvider", () => {
    const spy = jest.spyOn(console, "error").mockImplementation()

    expect(() => {
      renderHook(() => useTracking())
    }).toThrow("useTracking must be used within TrackingProvider")

    spy.mockRestore()
  })

  it("provides default settings on initial render", async () => {
    mockGetAllSettings.mockResolvedValueOnce({})

    const { result } = renderHook(() => useTracking(), { wrapper })

    expect(result.current.settings.interval).toBe(DEFAULT_SETTINGS.interval)
    expect(result.current.settings.endpoint).toBe(DEFAULT_SETTINGS.endpoint)
  })

  it("hydrates settings from native storage", async () => {
    mockGetAllSettings.mockResolvedValueOnce({
      interval: "10000",
      minUpdateDistance: "25.5",
      endpoint: "https://test.com/api",
      isOfflineMode: "true",
      filterInaccurateLocations: "false",
      syncPreset: "balanced",
      fieldMap: '{"lat":"latitude","lon":"longitude","acc":"accuracy"}',
      customFields: '[{"key":"_type","value":"location"}]',
      apiTemplate: "dawarich"
    })

    const { result } = renderHook(() => useTracking(), { wrapper })

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 100))
    })

    expect(result.current.settings.interval).toBe(10)
    expect(result.current.settings.distance).toBe(25.5)
    expect(result.current.settings.endpoint).toBe("https://test.com/api")
    expect(result.current.settings.isOfflineMode).toBe(true)
    expect(result.current.settings.filterInaccurateLocations).toBe(false)
    expect(result.current.settings.fieldMap.lat).toBe("latitude")
    expect(result.current.settings.customFields).toEqual([{ key: "_type", value: "location" }])
    expect(result.current.settings.apiTemplate).toBe("dawarich")
  })

  it("calls SettingsService.updateMultiple when setSettings is called", async () => {
    mockGetAllSettings.mockResolvedValueOnce({})

    const { result } = renderHook(() => useTracking(), { wrapper })

    await settleHydration()

    const newSettings = { ...DEFAULT_SETTINGS, interval: 30, endpoint: "https://new.com" }

    await act(async () => {
      await result.current.setSettings(newSettings)
    })

    expect(mockUpdateMultiple).toHaveBeenCalledWith(newSettings)
  })

  it("initializes DB with defaults when storage is empty", async () => {
    mockGetAllSettings.mockResolvedValueOnce({})

    renderHook(() => useTracking(), { wrapper })

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 100))
    })

    expect(mockUpdateMultiple).toHaveBeenCalledWith(DEFAULT_SETTINGS)
  })

  it("sets error state when hydration fails", async () => {
    mockGetAllSettings.mockRejectedValue(new Error("DB read failed"))

    const { result } = renderHook(() => useTracking(), { wrapper })

    await settleHydration()

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe("DB read failed")
    expect(result.current.isLoading).toBe(false)
    expect(logger.error).toHaveBeenCalledWith("[TrackingContext] Hydration failed:", expect.any(Error))
  })

  it("does not seed defaults over the database when the settings read fails", async () => {
    // A failed read must not land in the empty-map branch, which overwrites every stored setting.
    mockGetAllSettings.mockRejectedValue(new Error("DB read failed"))

    renderHook(() => useTracking(), { wrapper })

    await settleHydration()

    expect(mockUpdateMultiple).not.toHaveBeenCalled()
  })

  it("hydrates a first run even when seeding the defaults fails", async () => {
    // An empty table is a real first run, so the UI must not stay gated on the write succeeding.
    mockGetAllSettings.mockResolvedValueOnce({})
    mockUpdateMultiple.mockRejectedValueOnce(new Error("disk full"))

    const { result } = renderHook(() => useTracking(), { wrapper })

    await settleHydration()

    expect(result.current.settingsHydrated).toBe(true)
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it("refuses to start tracking before the settings read lands", async () => {
    // start() sends every key, so an unhydrated start runs the service on DEFAULT_SETTINGS.
    mockGetAllSettings.mockReturnValueOnce(new Promise(() => {}))

    const { result } = renderHook(() => useTracking(), { wrapper })

    await act(async () => {
      await expect(result.current.startTracking()).rejects.toThrow("Settings are not loaded")
    })

    expect(mockStartTracking).not.toHaveBeenCalled()
  })

  it("refuses to save before the settings read lands", async () => {
    mockGetAllSettings.mockReturnValueOnce(new Promise(() => {}))

    const { result } = renderHook(() => useTracking(), { wrapper })

    await act(async () => {
      await expect(result.current.setSettings(DEFAULT_SETTINGS)).rejects.toThrow("Settings are not loaded")
    })

    expect(mockUpdateMultiple).not.toHaveBeenCalled()
  })

  it("keeps saving when hydration fails after the read landed", async () => {
    // The stored settings are on screen at that point, so blocking saves would be wrong.
    mockGetAllSettings.mockResolvedValueOnce({ endpoint: "https://kept.example/api", tracking_enabled: "true" })
    mockGetActiveProfileName.mockRejectedValueOnce(new Error("bridge died"))

    const { result } = renderHook(() => useTracking(), { wrapper })

    await settleHydration()

    await act(async () => {
      await result.current.setSettings({ ...DEFAULT_SETTINGS, endpoint: "https://kept.example/api" })
    })

    expect(mockUpdateMultiple).toHaveBeenCalled()
  })

  it("refuses to save while the settings read has failed", async () => {
    // Every screen saves the whole Settings object, so one edit here would persist the defaults.
    mockGetAllSettings.mockRejectedValue(new Error("DB read failed"))

    const { result } = renderHook(() => useTracking(), { wrapper })

    await settleHydration()

    await act(async () => {
      await expect(result.current.setSettings({ ...DEFAULT_SETTINGS, hasCompletedSetup: true })).rejects.toThrow(
        "Settings are not loaded"
      )
    })

    expect(mockUpdateMultiple).not.toHaveBeenCalled()
  })

  it("sets isLoading to false after successful hydration", async () => {
    mockGetAllSettings.mockResolvedValueOnce({ interval: "5000" })

    const { result } = renderHook(() => useTracking(), { wrapper })

    expect(result.current.isLoading).toBe(true)

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 100))
    })

    expect(result.current.isLoading).toBe(false)
  })

  it("reconnects when tracking was active in native storage", async () => {
    mockGetAllSettings.mockResolvedValueOnce({
      interval: "5000",
      tracking_enabled: "true"
    })

    renderHook(() => useTracking(), { wrapper })

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 100))
    })

    expect(mockReconnect).toHaveBeenCalled()
  })

  it("does not reconnect when tracking was not active", async () => {
    mockGetAllSettings.mockResolvedValueOnce({
      interval: "5000",
      tracking_enabled: "false"
    })

    renderHook(() => useTracking(), { wrapper })

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 100))
    })

    expect(mockReconnect).not.toHaveBeenCalled()
  })

  it("sets error when setSettings persistence fails", async () => {
    mockGetAllSettings.mockResolvedValueOnce({ interval: "5000" })

    const { result } = renderHook(() => useTracking(), { wrapper })

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 100))
    })

    mockUpdateMultiple.mockRejectedValueOnce(new Error("Write failed"))

    await act(async () => {
      try {
        await result.current.setSettings({ ...DEFAULT_SETTINGS, interval: 99 })
      } catch {
        // expected
      }
    })

    expect(result.current.error?.message).toBe("Write failed")
    expect(logger.error).toHaveBeenCalledWith("[TrackingContext] Persistence failed:", expect.any(Error))
  })

  it("clears previous error on successful setSettings", async () => {
    mockGetAllSettings.mockResolvedValueOnce({ interval: "5000" })

    const { result } = renderHook(() => useTracking(), { wrapper })

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 100))
    })

    mockUpdateMultiple.mockRejectedValueOnce(new Error("fail"))

    await act(async () => {
      try {
        await result.current.setSettings({ ...DEFAULT_SETTINGS })
      } catch {
        // expected
      }
    })

    expect(result.current.error).toBeTruthy()

    mockUpdateMultiple.mockResolvedValueOnce(undefined)

    await act(async () => {
      await result.current.setSettings({ ...DEFAULT_SETTINGS, interval: 10 })
    })

    expect(result.current.error).toBeNull()
  })

  it("updates activeProfileName when onProfileSwitch event fires", async () => {
    mockGetAllSettings.mockResolvedValueOnce({ interval: "5000" })

    const { DeviceEventEmitter } = require("react-native")
    const { result } = renderHook(() => useTracking(), { wrapper })

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 100))
    })

    expect(result.current.activeProfileName).toBeNull()

    await act(async () => {
      DeviceEventEmitter.emit("onProfileSwitch", { profileName: "Charging" })
    })

    expect(result.current.activeProfileName).toBe("Charging")
  })

  it("clears activeProfileName when onProfileSwitch fires with null", async () => {
    mockGetAllSettings.mockResolvedValueOnce({ interval: "5000" })

    const { DeviceEventEmitter } = require("react-native")
    const { result } = renderHook(() => useTracking(), { wrapper })

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 100))
    })

    await act(async () => {
      DeviceEventEmitter.emit("onProfileSwitch", { profileName: "Charging" })
    })

    expect(result.current.activeProfileName).toBe("Charging")

    await act(async () => {
      DeviceEventEmitter.emit("onProfileSwitch", { profileName: null })
    })

    expect(result.current.activeProfileName).toBeNull()
  })

  it("clears activeProfileName when stopTracking is called", async () => {
    mockGetAllSettings.mockResolvedValueOnce({ interval: "5000" })

    const { DeviceEventEmitter } = require("react-native")
    const { result } = renderHook(() => useTracking(), { wrapper })

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 100))
    })

    await act(async () => {
      DeviceEventEmitter.emit("onProfileSwitch", { profileName: "Fast Driving" })
    })

    expect(result.current.activeProfileName).toBe("Fast Driving")

    await act(async () => {
      result.current.stopTracking()
    })

    expect(result.current.activeProfileName).toBeNull()
  })

  it("restores activeProfileName on reconnect when tracking was active", async () => {
    mockGetActiveProfileName.mockResolvedValueOnce("Charging")
    mockGetAllSettings.mockResolvedValueOnce({
      interval: "5000",
      tracking_enabled: "true"
    })

    const { result } = renderHook(() => useTracking(), { wrapper })

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 100))
    })

    expect(mockGetActiveProfileName).toHaveBeenCalled()
    expect(result.current.activeProfileName).toBe("Charging")
  })
})

describe("parseRawSettings", () => {
  it("round-trips dawarichMode from raw SQLite", () => {
    const settings = parseRawSettings({ dawarichMode: "batch" })
    expect(settings.dawarichMode).toBe("batch")
  })

  it("round-trips overlandBatchSize from raw SQLite", () => {
    const settings = parseRawSettings({ overlandBatchSize: "200" })
    expect(settings.overlandBatchSize).toBe(200)
  })

  it("falls back to defaults when dawarich keys are missing", () => {
    const settings = parseRawSettings({})
    expect(settings.dawarichMode).toBe(DEFAULT_SETTINGS.dawarichMode)
    expect(settings.overlandBatchSize).toBe(DEFAULT_SETTINGS.overlandBatchSize)
  })

  it("falls back to default when overlandBatchSize is non-numeric", () => {
    const settings = parseRawSettings({ overlandBatchSize: "not-a-number" })
    // parseInt("not-a-number", 10) returns NaN, but we should not propagate NaN
    expect(Number.isFinite(settings.overlandBatchSize)).toBe(true)
  })
})
