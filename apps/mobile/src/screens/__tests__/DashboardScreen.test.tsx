import React from "react"
import { act, render, fireEvent, waitFor } from "@testing-library/react-native"
import { DEFAULT_SETTINGS, Settings } from "../../types/global"
import {
  MAP_HERO_FRACTION,
  MAP_HERO_MIN_HEIGHT,
  MAP_HERO_PEEK,
  MAP_HERO_SHEET_RESERVE,
  motion,
  size
} from "../../constants"

// --- Mocks ---

const mockStartTracking = jest.fn().mockResolvedValue(undefined)
const mockStopTracking = jest.fn().mockResolvedValue(undefined)
const mockSetSettings = jest.fn().mockResolvedValue(undefined)
const mockIsLocationEnabled = jest.fn().mockResolvedValue(true)
const mockOpenLocationSettings = jest.fn().mockResolvedValue(true)
const mockShowConfirm = jest.fn().mockResolvedValue(false)
const mockShowAlert = jest.fn()
const mockIsBatteryCritical = jest.fn().mockResolvedValue(false)

let mockSettings: Settings = { ...DEFAULT_SETTINGS }
let mockTracking = false
let mockSettingsHydrated = true
let mockCoords: { latitude: number; longitude: number } | null = null
let mockWindowHeight = 800

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings,
    tracking: mockTracking,
    startTracking: mockStartTracking,
    stopTracking: mockStopTracking,
    setSettings: mockSetSettings,
    activeProfileName: "Default",
    settingsHydrated: mockSettingsHydrated
  }),
  useCoords: () => mockCoords
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: require("@colota/shared").lightColors,
    mode: "light"
  })
}))

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 })
}))

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 400, height: mockWindowHeight, scale: 2, fontScale: 1 })
}))

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require("react")
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => cb(), [])
  }
}))

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getStats: jest.fn().mockResolvedValue({
      queued: 0,
      sent: 5,
      total: 10,
      today: 3,
      databaseSizeMB: 0.5
    }),
    checkCurrentPauseZone: jest.fn().mockResolvedValue(null),
    isBatteryCritical: (...args: unknown[]) => mockIsBatteryCritical(...args),
    isLocationEnabled: (...args: unknown[]) => mockIsLocationEnabled(...args),
    openLocationSettings: (...args: unknown[]) => mockOpenLocationSettings(...args)
  }
}))

jest.mock("../../services/modalService", () => ({
  showConfirm: (...args: unknown[]) => mockShowConfirm(...args),
  showAlert: (...args: unknown[]) => mockShowAlert(...args)
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    DashboardMap: ({ onToggleExpand, ...props }: any) =>
      R.createElement(
        View,
        { testID: "DashboardMap", ...props },
        onToggleExpand ? R.createElement(Pressable, { testID: "expand-map", onPress: onToggleExpand }) : null
      ),
    CoordinateDisplay: () => R.createElement(View, { testID: "CoordinateDisplay" }),
    DatabaseStatistics: () => R.createElement(View, { testID: "DatabaseStatistics" }),
    ConnectionStatus: () => R.createElement(View, { testID: "ConnectionStatus" }),
    WelcomeCard: () => R.createElement(View, { testID: "WelcomeCard" }),
    Container: ({ children }: any) => R.createElement(View, { testID: "Container" }, children),
    Card: ({ children, style }: any) => R.createElement(View, { testID: "sheet", style }, children),
    Divider: () => R.createElement(View, { testID: "divider" }),
    MapOverlay: ({ children, onPress, testID, accessibilityLabel }: any) =>
      R.createElement(Pressable, { onPress, testID, accessibilityLabel }, children),
    Button: ({ title, onPress, disabled, testID }: any) =>
      R.createElement(
        Pressable,
        { onPress, disabled, testID, accessibilityState: { disabled: !!disabled } },
        R.createElement(Text, null, title)
      )
  }
})

import { DashboardScreen } from "../DashboardScreen"

const mockNavigation = { navigate: jest.fn() } as any

const flatten = (style: any): Record<string, unknown> =>
  Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean).map(flatten)) : (style ?? {})

// The seam is an Animated.Value once the expand control drives it, so the height is read
// through the node rather than compared as a plain number.
const heightOf = (node: any): number => {
  const height = flatten(node.props.style).height as any
  return typeof height === "number" ? height : height.__getValue()
}

describe("DashboardScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSettings = { ...DEFAULT_SETTINGS }
    mockTracking = false
    mockSettingsHydrated = true
    mockCoords = null
    mockWindowHeight = 800
    mockIsLocationEnabled.mockResolvedValue(true)
    mockOpenLocationSettings.mockResolvedValue(true)
    mockShowConfirm.mockResolvedValue(false)
    mockIsBatteryCritical.mockResolvedValue(false)
  })

  describe("map hero", () => {
    // The map used to be the ScrollView's first child, which forced the scrollEnabled touch
    // hack; as a sibling it neither steals the scroll nor needs one.
    it("renders the map outside the scrolling sheet", () => {
      const { getByTestId, UNSAFE_getByType } = render(<DashboardScreen navigation={mockNavigation} />)
      const { ScrollView } = require("react-native")

      const scroll = UNSAFE_getByType(ScrollView)
      const map = getByTestId("DashboardMap")
      expect(scroll.findAll((node: any) => node === map)).toEqual([])
      expect(scroll.props.scrollEnabled).toBeUndefined()
    })

    it("gives the map 52 percent of what the tab bar leaves", () => {
      mockWindowHeight = 900
      const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

      const available = 900 - (size.row + 16)
      expect(heightOf(getByTestId("map-hero"))).toBe(Math.round(available * MAP_HERO_FRACTION))
    })

    it("holds the floor on a short-but-not-compact window", () => {
      mockWindowHeight = 600
      const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

      expect(heightOf(getByTestId("map-hero"))).toBe(MAP_HERO_MIN_HEIGHT)
    })

    // A landscape phone or a split-screen half: the floor would eat the sheet whole, so the
    // reserve wins and the first heading, the coordinate line and the figure stay on screen.
    it("drops the floor at compact height and reserves the sheet", () => {
      mockWindowHeight = 400
      const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

      const available = 400 - (size.row + 16)
      expect(heightOf(getByTestId("map-hero"))).toBe(Math.round(available - MAP_HERO_SHEET_RESERVE))
    })

    // The seam moves, so the map, the pill and the sheet cannot each carry their own copy of it.
    it("moves the seam to the peek when the map is expanded and back on a second press", () => {
      jest.useFakeTimers()
      try {
        mockWindowHeight = 900
        const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

        const collapsed = heightOf(getByTestId("map-hero"))
        const available = 900 - (size.row + 16)

        act(() => fireEvent.press(getByTestId("expand-map")))
        act(() => {
          jest.advanceTimersByTime(motion.onScreen.duration * 2)
        })
        expect(heightOf(getByTestId("map-hero"))).toBe(available - MAP_HERO_PEEK)

        act(() => fireEvent.press(getByTestId("expand-map")))
        act(() => {
          jest.advanceTimersByTime(motion.onScreen.duration * 2)
        })
        expect(heightOf(getByTestId("map-hero"))).toBe(collapsed)
      } finally {
        jest.useRealTimers()
      }
    })

    it("clears the Start pill with the sheet's top padding", () => {
      const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

      expect(flatten(getByTestId("sheet").props.style).paddingTop).toBeGreaterThanOrEqual(size.touch / 2)
    })
  })

  describe("the Start control", () => {
    it("shows Start tracking when not tracking", () => {
      const { getByText } = render(<DashboardScreen navigation={mockNavigation} />)

      expect(getByText("Start tracking")).toBeTruthy()
    })

    it("shows Stop when tracking", () => {
      mockTracking = true

      const { getByText, queryByText } = render(<DashboardScreen navigation={mockNavigation} />)

      expect(getByText("Stop")).toBeTruthy()
      expect(queryByText("Start tracking")).toBeNull()
    })

    // M3 forbids disabling the primary floating action and a greyed pill over map tiles has no
    // contrast guarantee, so a blocked start stays pressable and says why.
    it("stays enabled while the battery is critical and explains the refusal", async () => {
      mockIsBatteryCritical.mockResolvedValue(true)

      const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)
      await waitFor(() => expect(mockIsBatteryCritical).toHaveBeenCalled())

      const pill = getByTestId("tracking-toggle-btn")
      expect(pill.props.accessibilityState?.disabled).toBeFalsy()

      fireEvent.press(pill)

      await waitFor(() => expect(mockShowAlert).toHaveBeenCalledWith("Battery too low", expect.any(String), "warning"))
      expect(mockStartTracking).not.toHaveBeenCalled()
    })

    it("stays enabled while settings have not been read and explains the refusal", async () => {
      // start() sends every key, and fromReadableMap prefers a present empty endpoint over the stored one.
      mockSettingsHydrated = false

      const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)
      const pill = getByTestId("tracking-toggle-btn")
      expect(pill.props.accessibilityState?.disabled).toBeFalsy()

      fireEvent.press(pill)

      await waitFor(() =>
        expect(mockShowAlert).toHaveBeenCalledWith("Settings are still loading", expect.any(String), "warning")
      )
      expect(mockStartTracking).not.toHaveBeenCalled()
    })

    it("starts tracking directly when location services are enabled", async () => {
      const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)
      fireEvent.press(getByTestId("tracking-toggle-btn"))

      await waitFor(() => expect(mockStartTracking).toHaveBeenCalled())
      expect(mockShowConfirm).not.toHaveBeenCalled()
      expect(mockOpenLocationSettings).not.toHaveBeenCalled()
    })

    it("opens location settings and skips start when the user picks 'Location settings'", async () => {
      mockIsLocationEnabled.mockResolvedValue(false)
      mockShowConfirm.mockResolvedValue(true)

      const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)
      fireEvent.press(getByTestId("tracking-toggle-btn"))

      await waitFor(() => expect(mockOpenLocationSettings).toHaveBeenCalled())
      expect(mockStartTracking).not.toHaveBeenCalled()
    })

    it("starts tracking anyway when the user dismisses the location warning", async () => {
      mockIsLocationEnabled.mockResolvedValue(false)
      mockShowConfirm.mockResolvedValue(false)

      const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)
      fireEvent.press(getByTestId("tracking-toggle-btn"))

      await waitFor(() => expect(mockStartTracking).toHaveBeenCalled())
      expect(mockOpenLocationSettings).not.toHaveBeenCalled()
    })

    it("stops tracking without a confirm step", async () => {
      mockTracking = true

      const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)
      fireEvent.press(getByTestId("tracking-toggle-btn"))

      await waitFor(() => expect(mockStopTracking).toHaveBeenCalled())
      expect(mockShowConfirm).not.toHaveBeenCalled()
    })
  })

  describe("the sheet", () => {
    it("shows CoordinateDisplay when tracking", () => {
      mockTracking = true
      mockCoords = { latitude: 52.52, longitude: 13.405 }

      const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

      expect(getByTestId("CoordinateDisplay")).toBeTruthy()
    })

    it("hides CoordinateDisplay when not tracking", () => {
      mockCoords = { latitude: 52.52, longitude: 13.405 }

      const { queryByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

      expect(queryByTestId("CoordinateDisplay")).toBeNull()
    })

    it("hides WelcomeCard while settings have not been read", () => {
      // Unhydrated settings read as a first run, and dismissing the card would save the defaults.
      mockSettings = { ...DEFAULT_SETTINGS, hasCompletedSetup: false }
      mockSettingsHydrated = false

      const { queryByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

      expect(queryByTestId("WelcomeCard")).toBeNull()
    })

    it("shows WelcomeCard when hasCompletedSetup is false", () => {
      mockSettings = { ...DEFAULT_SETTINGS, hasCompletedSetup: false }

      const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

      expect(getByTestId("WelcomeCard")).toBeTruthy()
    })

    it("hides WelcomeCard when hasCompletedSetup is true", () => {
      mockSettings = { ...DEFAULT_SETTINGS, hasCompletedSetup: true }

      const { queryByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

      expect(queryByTestId("WelcomeCard")).toBeNull()
    })

    it("renders DatabaseStatistics", () => {
      const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

      expect(getByTestId("DatabaseStatistics")).toBeTruthy()
    })

    it("renders ConnectionStatus", () => {
      const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

      expect(getByTestId("ConnectionStatus")).toBeTruthy()
    })

    it("hides ConnectionStatus when offline mode is enabled", () => {
      mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }

      const { queryByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

      expect(queryByTestId("ConnectionStatus")).toBeNull()
    })

    it("still renders DatabaseStatistics when offline mode is enabled", () => {
      mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }

      const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

      expect(getByTestId("DatabaseStatistics")).toBeTruthy()
    })
  })

  it("hands the map the interval the state chip reads", () => {
    mockSettings = { ...DEFAULT_SETTINGS, interval: 30 }

    const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

    expect(getByTestId("DashboardMap").props.interval).toBe(30)
  })

  it("revalidates locationEnabled when AppState transitions to active", async () => {
    const { AppState } = require("react-native")
    const addSpy = jest.spyOn(AppState, "addEventListener")

    render(<DashboardScreen navigation={mockNavigation} />)

    // Wait for the initial isLocationEnabled call from useFocusEffect
    await waitFor(() => expect(mockIsLocationEnabled).toHaveBeenCalled())
    const callsAfterMount = mockIsLocationEnabled.mock.calls.length

    const changeHandler = addSpy.mock.calls.find(([event]) => event === "change")?.[1] as (s: string) => void
    expect(changeHandler).toBeDefined()

    changeHandler("background")
    expect(mockIsLocationEnabled).toHaveBeenCalledTimes(callsAfterMount)

    changeHandler("active")
    await waitFor(() => expect(mockIsLocationEnabled).toHaveBeenCalledTimes(callsAfterMount + 1))

    addSpy.mockRestore()
  })
})
