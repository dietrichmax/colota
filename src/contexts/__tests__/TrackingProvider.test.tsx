import React from "react"
import { renderHook, act } from "@testing-library/react-native"
import { DEFAULT_SETTINGS } from "../../types/global"

// Mock the services
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

// Mock useLocationTracking hook — use require() inside factory to avoid out-of-scope reference
jest.mock("../../hooks/useLocationTracking", () => ({
  useLocationTracking: jest.fn(() => ({
    coords: null,
    tracking: false,
    startTracking: jest.fn().mockResolvedValue(undefined),
    stopTracking: jest.fn(),
    restartTracking: jest.fn().mockResolvedValue(undefined),
    reconnect: jest.fn(),
    settings: require("../../types/global").DEFAULT_SETTINGS
  }))
}))

import { TrackingProvider, useTracking } from "../TrackingProvider"
import NativeLocationService from "../../services/NativeLocationService"
import SettingsService from "../../services/SettingsService"

const mockGetAllSettings = NativeLocationService.getAllSettings as jest.Mock
const mockUpdateMultiple = SettingsService.updateMultiple as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

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

    const wrapper = ({ children }: { children: React.ReactNode }) => <TrackingProvider>{children}</TrackingProvider>

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

    const wrapper = ({ children }: { children: React.ReactNode }) => <TrackingProvider>{children}</TrackingProvider>

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

    const wrapper = ({ children }: { children: React.ReactNode }) => <TrackingProvider>{children}</TrackingProvider>

    const { result } = renderHook(() => useTracking(), { wrapper })

    const newSettings = { ...DEFAULT_SETTINGS, interval: 30, endpoint: "https://new.com" }

    await act(async () => {
      await result.current.setSettings(newSettings)
    })

    expect(mockUpdateMultiple).toHaveBeenCalledWith(newSettings)
  })
})
