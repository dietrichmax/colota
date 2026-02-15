import React from "react"
import { renderHook, act } from "@testing-library/react-native"
import { DEFAULT_SETTINGS } from "../../types/global"

jest.mock("../../services/NativeLocationService", () => ({
  getAllSettings: jest.fn().mockResolvedValue({}),
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn(),
  saveSetting: jest.fn().mockResolvedValue(undefined),
  isServiceRunning: jest.fn().mockResolvedValue(false),
  isTrackingActive: jest.fn().mockResolvedValue(false)
}))

jest.mock("../../services/SettingsService", () => ({
  updateMultiple: jest.fn().mockResolvedValue(undefined),
  updateSetting: jest.fn().mockResolvedValue(true)
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

import { TrackingProvider, useTracking } from "../TrackingProvider"
import NativeLocationService from "../../services/NativeLocationService"
import SettingsService from "../../services/SettingsService"
import { logger } from "../../utils/logger"

const mockGetAllSettings = NativeLocationService.getAllSettings as jest.Mock
const mockUpdateMultiple = SettingsService.updateMultiple as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

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
    mockGetAllSettings.mockRejectedValueOnce(new Error("DB read failed"))

    const { result } = renderHook(() => useTracking(), { wrapper })

    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 100))
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe("DB read failed")
    expect(result.current.isLoading).toBe(false)
    expect(logger.error).toHaveBeenCalledWith("[TrackingContext] Hydration failed:", expect.any(Error))
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
})
