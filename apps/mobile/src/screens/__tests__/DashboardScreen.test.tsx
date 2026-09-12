import React from "react"
import { render, fireEvent, waitFor, act } from "@testing-library/react-native"
import { DeviceEventEmitter, StatusBar, StyleSheet } from "react-native"
import { DEFAULT_SETTINGS, Settings } from "../../types/global"
import { size, space } from "../../constants"

const mockStartTracking = jest.fn().mockResolvedValue(undefined)
const mockStopTracking = jest.fn().mockResolvedValue(undefined)
const mockSetSettings = jest.fn().mockResolvedValue(undefined)
const mockIsLocationEnabled = jest.fn()
const mockIsBatteryCritical = jest.fn()
const mockOpenLocationSettings = jest.fn()
const mockGetMostRecentLocation = jest.fn()
const mockGetSetting = jest.fn()
const mockSaveSetting = jest.fn()
const mockGetStats = jest.fn()
const mockGetProfiles = jest.fn()
const mockCheckPermissions = jest.fn()
const mockEnsurePermissions = jest.fn()
const mockShowConfirm = jest.fn()

let mockSettings: Settings = { ...DEFAULT_SETTINGS }
let mockTracking = false
let mockSettingsHydrated = true
let mockCoords: { latitude: number; longitude: number; accuracy: number; timestamp: number } | null = null
let mockActiveProfileName: string | null = null
let mockActiveProfileId: number | null = null
let mockInsets = { top: 24, bottom: 0, left: 0, right: 0 }

const grantedPermissions = {
  location: true,
  background: true,
  notifications: true,
  batteryOptimized: true,
  localNetwork: true
}

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings,
    tracking: mockTracking,
    startTracking: mockStartTracking,
    stopTracking: mockStopTracking,
    setSettings: mockSetSettings,
    activeProfileName: mockActiveProfileName,
    activeProfileId: mockActiveProfileId,
    settingsHydrated: mockSettingsHydrated
  }),
  useCoords: () => mockCoords
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors, isDark: false })
}))

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockInsets
}))

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require("react")
    useEffect(() => cb(), [cb])
  },
  useIsFocused: () => true
}))

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getStats: (...args: unknown[]) => mockGetStats(...args),
    checkCurrentPauseZone: jest.fn().mockResolvedValue(null),
    isBatteryCritical: (...args: unknown[]) => mockIsBatteryCritical(...args),
    isLocationEnabled: (...args: unknown[]) => mockIsLocationEnabled(...args),
    openLocationSettings: (...args: unknown[]) => mockOpenLocationSettings(...args),
    getMostRecentLocation: (...args: unknown[]) => mockGetMostRecentLocation(...args),
    getSetting: (...args: unknown[]) => mockGetSetting(...args),
    saveSetting: (...args: unknown[]) => mockSaveSetting(...args),
    getProfiles: (...args: unknown[]) => mockGetProfiles(...args)
  }
}))

jest.mock("../../services/LocationServicePermission", () => ({
  checkPermissions: (...args: unknown[]) => mockCheckPermissions(...args),
  ensurePermissions: (...args: unknown[]) => mockEnsurePermissions(...args)
}))

jest.mock("../../services/modalService", () => ({
  showConfirm: (...args: unknown[]) => mockShowConfirm(...args)
}))

jest.mock("../../components/features/map/TrackToggleButton", () => {
  const R = require("react")
  const { Pressable } = require("react-native")
  return {
    TrackToggleButton: (props: any) =>
      R.createElement(Pressable, {
        testID: "track-toggle",
        accessibilityRole: "button",
        onPress: props.onPress,
        active: props.active,
        anchored: props.anchored
      })
  }
})

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    DashboardMap: (props: any) => R.createElement(View, { testID: "DashboardMap", ...props }),
    DashboardBanner: (props: any) =>
      R.createElement(
        View,
        { testID: "DashboardBanner", ...props },
        R.createElement(Pressable, { testID: "banner-action", accessibilityRole: "button", onPress: props.onAction })
      ),
    DashboardDock: (props: any) => R.createElement(View, { testID: "DashboardDock", ...props }),
    Container: ({ children }: any) => R.createElement(View, null, children),
    Button: ({ title, onPress, disabled, variant, loading, floating, shape, icon }: any) =>
      R.createElement(
        View,
        { testID: "pill", variant, loading, floating, shape, icon },
        R.createElement(
          Pressable,
          { onPress, disabled, accessibilityRole: "button", accessibilityState: { disabled: !!disabled } },
          R.createElement(Text, null, title)
        )
      )
  }
})

import { DashboardScreen } from "../DashboardScreen"

const mockSetOptions = jest.fn()
const mockNavigation = { navigate: jest.fn(), setOptions: mockSetOptions } as any

const renderScreen = () => render(<DashboardScreen navigation={mockNavigation} />)

const settle = () => waitFor(() => expect(mockCheckPermissions).toHaveBeenCalled())

describe("DashboardScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSettings = { ...DEFAULT_SETTINGS }
    mockTracking = false
    mockSettingsHydrated = true
    mockCoords = null
    mockActiveProfileName = null
    mockActiveProfileId = null
    mockInsets = { top: 24, bottom: 0, left: 0, right: 0 }
    mockIsLocationEnabled.mockResolvedValue(true)
    mockIsBatteryCritical.mockResolvedValue(false)
    mockOpenLocationSettings.mockResolvedValue(true)
    mockGetMostRecentLocation.mockResolvedValue(null)
    mockGetSetting.mockResolvedValue("false")
    mockSaveSetting.mockResolvedValue(undefined)
    mockGetStats.mockResolvedValue({ queued: 0, sent: 0, total: 0, today: 0, databaseSizeMB: 0 })
    mockGetProfiles.mockResolvedValue([])
    mockCheckPermissions.mockResolvedValue(grantedPermissions)
    mockEnsurePermissions.mockResolvedValue(true)
    mockShowConfirm.mockResolvedValue(false)
  })

  it("hides the header, because the map is the screen's own chrome and a tab root cannot be stranded", async () => {
    renderScreen()
    await settle()

    expect(mockSetOptions).toHaveBeenCalledWith({ headerShown: false })
  })

  it("offers Start as the teal pill with the Play glyph while idle", async () => {
    const { getByText, getByTestId } = renderScreen()
    await settle()

    expect(getByText("Start tracking")).toBeTruthy()
    expect(getByTestId("pill").props.variant).toBe("primary")
    expect(getByTestId("pill").props.shape).toBe("pill")
    expect(getByTestId("pill").props.floating).toBe(true)
    expect(getByTestId("pill").props.icon.displayName).toBe("Play")
  })

  it("turns the pill to the danger hue with the Square glyph while tracking, so a mis-tap reads as a stop", async () => {
    mockTracking = true

    const { getByText, getByTestId } = renderScreen()
    await settle()

    expect(getByText("Stop tracking")).toBeTruthy()
    expect(getByTestId("pill").props.variant).toBe("danger")
    expect(getByTestId("pill").props.icon.displayName).toBe("Square")
  })

  it("shows Start as loading rather than disabled until the settings have been read", async () => {
    // start() sends every key, and fromReadableMap prefers a present empty endpoint over the stored one.
    mockSettingsHydrated = false

    const { getByText, getByTestId } = renderScreen()
    await settle()

    expect(getByTestId("pill").props.loading).toBe(true)
    expect(getByText("Start tracking")).not.toBeDisabled()
  })

  it("disables Start only for a critical battery, with the banner as its reason", async () => {
    mockIsBatteryCritical.mockResolvedValue(true)

    const { getByText, getByTestId } = renderScreen()
    await waitFor(() => expect(getByText("Start tracking")).toBeDisabled())

    expect(getByTestId("DashboardBanner").props.condition).toBe("battery")
  })

  it("keeps Stop enabled while tracking even if the battery reads critical, because the service is already running", async () => {
    mockTracking = true
    mockIsBatteryCritical.mockResolvedValue(true)

    const { getByText, queryByTestId } = renderScreen()
    await settle()

    await act(async () => {
      DeviceEventEmitter.emit("onChargingStateChanged", {})
    })
    await waitFor(() => expect(mockIsBatteryCritical).toHaveBeenCalled())

    expect(getByText("Stop tracking")).not.toBeDisabled()
    expect(queryByTestId("DashboardBanner")).toBeNull()
  })

  it("hands the dock the first-run flag only once settings are read, since unhydrated settings look like a first run", async () => {
    mockSettings = { ...DEFAULT_SETTINGS, hasCompletedSetup: false }
    mockSettingsHydrated = false

    const { getByTestId } = renderScreen()
    await settle()

    expect(getByTestId("DashboardDock").props.firstRun).toBe(false)
  })

  it("marks the dock as first run while setup is incomplete and drops it once it is done", async () => {
    mockSettings = { ...DEFAULT_SETTINGS, hasCompletedSetup: false }
    const fresh = renderScreen()
    await settle()
    expect(fresh.getByTestId("DashboardDock").props.firstRun).toBe(true)
    fresh.unmount()

    mockSettings = { ...DEFAULT_SETTINGS, hasCompletedSetup: true }
    const done = renderScreen()
    await settle()
    expect(done.getByTestId("DashboardDock").props.firstRun).toBe(false)
  })

  it("tells the dock to drop the server row in offline mode", async () => {
    mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }

    const { getByTestId } = renderScreen()
    await settle()

    expect(getByTestId("DashboardDock").props.isOfflineMode).toBe(true)
    expect(getByTestId("DashboardDock").props.endpoint).toBe(DEFAULT_SETTINGS.endpoint)
  })

  it("labels the interval row with the fix and sync cadence from settings while no profile is active", async () => {
    mockSettings = { ...DEFAULT_SETTINGS, interval: 30, syncInterval: 300 }
    const batched = renderScreen()
    await settle()
    expect(batched.getByTestId("DashboardDock").props.intervalText).toBe("Every 30 s · Sync 5 min")
    batched.unmount()

    mockSettings = { ...DEFAULT_SETTINGS, interval: 5, syncInterval: 0 }
    const instant = renderScreen()
    await settle()
    expect(instant.getByTestId("DashboardDock").props.intervalText).toBe("Every 5 s · Instant sync")
    expect(mockGetProfiles).not.toHaveBeenCalled()
  })

  it("labels the interval row with the active profile's fix and sync cadence, since the state line already names it", async () => {
    mockTracking = true
    mockSettings = { ...DEFAULT_SETTINGS, interval: 30, syncInterval: 300 }
    mockActiveProfileName = "Night"
    mockActiveProfileId = 7
    mockGetProfiles.mockResolvedValue([
      { id: 3, name: "Driving", interval: 10, syncInterval: 60 },
      { id: 7, name: "Night", interval: 300, syncInterval: 900 }
    ])

    const { getByTestId } = renderScreen()
    await waitFor(() => expect(getByTestId("DashboardDock").props.intervalText).toBe("Every 5 min · Sync 15 min"))
  })

  it("falls back to the settings pair when the active profile id matches no saved profile", async () => {
    mockTracking = true
    mockSettings = { ...DEFAULT_SETTINGS, interval: 30, syncInterval: 300 }
    mockActiveProfileId = 99
    mockGetProfiles.mockResolvedValue([{ id: 7, name: "Night", interval: 300, syncInterval: 900 }])

    const { getByTestId } = renderScreen()
    await waitFor(() => expect(mockGetProfiles).toHaveBeenCalled())

    expect(getByTestId("DashboardDock").props.intervalText).toBe("Every 30 s · Sync 5 min")
  })

  it("starts tracking directly when location services are enabled", async () => {
    const { getByText } = renderScreen()
    await settle()
    fireEvent.press(getByText("Start tracking"))

    await waitFor(() => expect(mockStartTracking).toHaveBeenCalled())
    expect(mockShowConfirm).not.toHaveBeenCalled()
    expect(mockOpenLocationSettings).not.toHaveBeenCalled()
  })

  it("opens location settings and skips start when the user picks Location settings", async () => {
    mockIsLocationEnabled.mockResolvedValue(false)
    mockShowConfirm.mockResolvedValue(true)

    const { getByText, getByTestId } = renderScreen()
    await settle()
    fireEvent.press(getByText("Start tracking"))

    await waitFor(() => expect(mockOpenLocationSettings).toHaveBeenCalled())
    expect(mockStartTracking).not.toHaveBeenCalled()
    expect(getByTestId("DashboardMap").props.recentreSignal).toBe(0)
  })

  it("signals the map to recentre on each Start, so the tap shows on the map before the first fix does", async () => {
    const { getByText, getByTestId } = renderScreen()
    await settle()
    expect(getByTestId("DashboardMap").props.recentreSignal).toBe(0)

    fireEvent.press(getByText("Start tracking"))
    await waitFor(() => expect(mockStartTracking).toHaveBeenCalled())

    expect(getByTestId("DashboardMap").props.recentreSignal).toBe(1)
  })

  it("starts tracking anyway when the user dismisses the location warning", async () => {
    mockIsLocationEnabled.mockResolvedValue(false)
    mockShowConfirm.mockResolvedValue(false)

    const { getByText } = renderScreen()
    await settle()
    fireEvent.press(getByText("Start tracking"))

    await waitFor(() => expect(mockStartTracking).toHaveBeenCalled())
    expect(mockOpenLocationSettings).not.toHaveBeenCalled()
  })

  it("stops tracking from the pill", async () => {
    mockTracking = true

    const { getByText } = renderScreen()
    await settle()
    fireEvent.press(getByText("Stop tracking"))

    await waitFor(() => expect(mockStopTracking).toHaveBeenCalled())
  })

  it("revalidates location services and permissions when the app returns to the foreground, never per fix", async () => {
    const { AppState } = require("react-native")
    const addSpy = jest.spyOn(AppState, "addEventListener")

    renderScreen()
    await settle()
    await waitFor(() => expect(mockIsLocationEnabled).toHaveBeenCalled())
    const locationCalls = mockIsLocationEnabled.mock.calls.length
    const permissionCalls = mockCheckPermissions.mock.calls.length

    const changeHandler = addSpy.mock.calls.find(([event]) => event === "change")?.[1] as (s: string) => void
    expect(changeHandler).toBeDefined()

    await act(async () => changeHandler("background"))
    expect(mockIsLocationEnabled).toHaveBeenCalledTimes(locationCalls)
    expect(mockCheckPermissions).toHaveBeenCalledTimes(permissionCalls)

    await act(async () => changeHandler("active"))
    expect(mockIsLocationEnabled).toHaveBeenCalledTimes(locationCalls + 1)
    expect(mockCheckPermissions).toHaveBeenCalledTimes(permissionCalls + 1)
  })

  it("checks permissions once on focus so a revoked grant shows before the tap", async () => {
    renderScreen()
    await settle()

    expect(mockCheckPermissions).toHaveBeenCalledTimes(1)
  })

  it("never asks for database statistics, because nothing on the dashboard prints them", async () => {
    renderScreen()
    await settle()

    expect(mockGetStats).not.toHaveBeenCalled()
  })

  it("reads the last known fix on focus while idle and hands it to the map and the dock", async () => {
    mockGetMostRecentLocation.mockResolvedValue({
      latitude: 48.1,
      longitude: 11.5,
      accuracy: 12.5,
      timestamp: 1_700_000_000
    })

    const { getByTestId } = renderScreen()
    const expected = { latitude: 48.1, longitude: 11.5, accuracy: 12.5, timestamp: 1_700_000_000 }
    await waitFor(() => expect(getByTestId("DashboardMap").props.lastKnown).toEqual(expected))

    expect(getByTestId("DashboardDock").props.lastKnown).toEqual(expected)
  })

  it("hands the map an unread marker before the database answers, so a zone fit cannot beat a fix", async () => {
    mockGetMostRecentLocation.mockReturnValue(new Promise(() => {}))

    const { getByTestId } = renderScreen()
    await settle()

    expect(getByTestId("DashboardMap").props.lastKnown).toBeUndefined()
    expect(getByTestId("DashboardDock").props.lastKnown).toBeNull()
  })

  it("reads the last known fix while tracking too, so the map opens where the service last was instead of on the world", async () => {
    mockTracking = true
    mockGetMostRecentLocation.mockResolvedValue({
      latitude: 48.1,
      longitude: 11.5,
      accuracy: 4,
      timestamp: 1_700_000_000
    })

    const { getByTestId } = renderScreen()

    await waitFor(() =>
      expect(getByTestId("DashboardMap").props.lastKnown).toEqual({
        latitude: 48.1,
        longitude: 11.5,
        accuracy: 4,
        timestamp: 1_700_000_000
      })
    )
  })

  it("reads the battery-stop flag while idle so the state line stays honest after the banner clears", async () => {
    mockGetSetting.mockImplementation((key: string) => Promise.resolve(key === "stopped_by_battery" ? "true" : "false"))

    const { getByTestId } = renderScreen()
    await waitFor(() => expect(getByTestId("DashboardDock").props.stoppedByBattery).toBe(true))
  })

  it("hands the dock the live fix's accuracy and time while tracking", async () => {
    mockTracking = true
    mockCoords = { latitude: 48.1, longitude: 11.5, accuracy: 4.2, timestamp: 1_700_000_000 }

    const { getByTestId } = renderScreen()
    await settle()

    expect(getByTestId("DashboardDock").props.hasFix).toBe(true)
    expect(getByTestId("DashboardDock").props.coords).toEqual({ accuracy: 4.2, timestamp: 1_700_000_000 })
  })

  describe("banner", () => {
    it("shows nothing while every prerequisite holds", async () => {
      const { queryByTestId } = renderScreen()
      await settle()

      expect(queryByTestId("DashboardBanner")).toBeNull()
    })

    it("puts a missing location grant above location services and battery, because nothing works without it", async () => {
      mockCheckPermissions.mockResolvedValue({ ...grantedPermissions, location: false })
      mockIsLocationEnabled.mockResolvedValue(false)
      mockIsBatteryCritical.mockResolvedValue(true)

      const { getByTestId } = renderScreen()
      await waitFor(() => expect(getByTestId("DashboardBanner").props.condition).toBe("permission"))
    })

    it("puts location services above battery", async () => {
      mockIsLocationEnabled.mockResolvedValue(false)
      mockIsBatteryCritical.mockResolvedValue(true)

      const { getByTestId } = renderScreen()
      await waitFor(() => expect(getByTestId("DashboardBanner").props.condition).toBe("locationOff"))
    })

    it("names a missing background grant only while tracking, when it actually costs fixes", async () => {
      mockCheckPermissions.mockResolvedValue({ ...grantedPermissions, background: false })

      const idle = renderScreen()
      await settle()
      expect(idle.queryByTestId("DashboardBanner")).toBeNull()
      idle.unmount()

      mockTracking = true
      const live = renderScreen()
      await waitFor(() => expect(live.getByTestId("DashboardBanner").props.condition).toBe("background"))
    })

    it("sits below the status inset, never over the clock", async () => {
      mockIsLocationEnabled.mockResolvedValue(false)

      const { getByTestId } = renderScreen()
      await waitFor(() => expect(getByTestId("DashboardBanner")).toBeTruthy())

      expect(getByTestId("DashboardBanner").props.top).toBe(24 + 12)
    })

    it("opens the location settings from the location-off action", async () => {
      mockIsLocationEnabled.mockResolvedValue(false)

      const { getByTestId } = renderScreen()
      await waitFor(() => expect(getByTestId("DashboardBanner")).toBeTruthy())
      fireEvent.press(getByTestId("banner-action"))

      expect(mockOpenLocationSettings).toHaveBeenCalled()
      expect(mockEnsurePermissions).not.toHaveBeenCalled()
    })

    it("runs the disclosure-gated permission flow from Grant and re-reads the grants after it", async () => {
      mockCheckPermissions.mockResolvedValue({ ...grantedPermissions, location: false })

      const { getByTestId } = renderScreen()
      await waitFor(() => expect(getByTestId("DashboardBanner").props.condition).toBe("permission"))
      const checksBefore = mockCheckPermissions.mock.calls.length

      fireEvent.press(getByTestId("banner-action"))

      await waitFor(() => expect(mockEnsurePermissions).toHaveBeenCalled())
      await waitFor(() => expect(mockCheckPermissions).toHaveBeenCalledTimes(checksBefore + 1))
      expect(mockOpenLocationSettings).not.toHaveBeenCalled()
    })

    it("disappears the moment its condition clears", async () => {
      const { AppState } = require("react-native")
      const addSpy = jest.spyOn(AppState, "addEventListener")
      mockIsLocationEnabled.mockResolvedValue(false)

      const { getByTestId, queryByTestId } = renderScreen()
      await waitFor(() => expect(getByTestId("DashboardBanner")).toBeTruthy())

      mockIsLocationEnabled.mockResolvedValue(true)
      const changeHandler = addSpy.mock.calls.find(([event]) => event === "change")?.[1] as (s: string) => void
      await act(async () => changeHandler("active"))

      expect(queryByTestId("DashboardBanner")).toBeNull()
    })
  })

  describe("map framing", () => {
    it("keeps the position dot out from under the dock, the banner and the disc column", async () => {
      const { getByTestId } = renderScreen()
      await settle()

      act(() => {
        fireEvent(getByTestId("dashboard-stack"), "layout", { nativeEvent: { layout: { height: 200 } } })
      })

      expect(getByTestId("DashboardMap").props.cameraPadding).toEqual({
        top: 24 + 16,
        bottom: 200 + 16 + 16,
        left: 16,
        right: 16 + 40 + 16
      })
      expect(getByTestId("DashboardMap").props.controlsBottom).toBe(16 + 200 + 8)
      expect(getByTestId("DashboardMap").props.controlsEnd).toBe(16)
    })

    it("pads the stack, the banner and the disc column by the side insets, so a landscape navigation bar covers none of them", async () => {
      mockInsets = { top: 24, bottom: 0, left: 0, right: 48 }
      mockIsLocationEnabled.mockResolvedValue(false)

      const { getByTestId } = renderScreen()
      await waitFor(() => expect(getByTestId("DashboardBanner")).toBeTruthy())

      const stack = StyleSheet.flatten(getByTestId("dashboard-stack").props.style)
      expect(stack.left).toBe(16)
      expect(stack.right).toBe(16 + 48)
      expect(getByTestId("DashboardBanner").props.left).toBe(16)
      expect(getByTestId("DashboardBanner").props.right).toBe(16 + 48)
      expect(getByTestId("DashboardMap").props.controlsEnd).toBe(16 + 48)
      expect(getByTestId("DashboardMap").props.cameraPadding.right).toBe(16 + 48 + 40 + 16)
    })

    it("adds the banner's height to the top inset only while a banner is up", async () => {
      mockIsLocationEnabled.mockResolvedValue(false)

      const { getByTestId } = renderScreen()
      await waitFor(() => expect(getByTestId("DashboardBanner")).toBeTruthy())

      act(() => {
        fireEvent(getByTestId("DashboardBanner"), "layout", { nativeEvent: { layout: { height: 56 } } })
      })

      expect(getByTestId("DashboardMap").props.cameraPadding.top).toBe(24 + 56 + 12 + 16)
    })
  })

  describe("today's track", () => {
    it("holds the Route slot empty idle with no points, so the pill never moves", async () => {
      const { queryByTestId, getByTestId } = renderScreen()
      await settle()

      expect(queryByTestId("track-toggle")).toBeNull()
      expect(StyleSheet.flatten(getByTestId("route-slot").props.style).width).toBe(size.iconColumn)
    })

    it("lifts the Route disc and the pill 16 above the dock and 16 apart, one rhythm for every floating control", async () => {
      const { getByTestId } = renderScreen()
      await settle()

      expect(StyleSheet.flatten(getByTestId("route-slot").props.style).marginBottom).toBe(space.sm)
      expect(StyleSheet.flatten(getByTestId("dashboard-stack").props.style).gap).toBe(space.sm)
    })

    it("offers the Route toggle in the action row while tracking and persists a flip", async () => {
      mockTracking = true
      mockGetSetting.mockImplementation((key: string) => Promise.resolve(key === "showTrack" ? "true" : "false"))

      const { getByTestId } = renderScreen()
      await waitFor(() => expect(getByTestId("track-toggle")).toBeTruthy())
      expect(getByTestId("track-toggle").props.anchored).toBe(false)
      expect(getByTestId("track-toggle").props.active).toBe(true)
      expect(getByTestId("DashboardMap").props.showTrack).toBe(true)

      fireEvent.press(getByTestId("track-toggle"))

      expect(mockSaveSetting).toHaveBeenCalledWith("showTrack", "false")
      expect(getByTestId("DashboardMap").props.showTrack).toBe(false)
    })

    it("offers the Route toggle idle once the map reports today's points", async () => {
      const { getByTestId } = renderScreen()
      await settle()

      act(() => getByTestId("DashboardMap").props.onHasTrackChange(true))

      expect(getByTestId("track-toggle")).toBeTruthy()
    })
  })

  it("paints dark status icons over the light map style while focused", async () => {
    const { UNSAFE_getByType } = renderScreen()
    await settle()

    expect(UNSAFE_getByType(StatusBar).props.barStyle).toBe("dark-content")
  })
})
