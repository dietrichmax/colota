import React from "react"
import { render } from "@testing-library/react-native"
import { DEFAULT_SETTINGS, Settings } from "../../types/global"

// --- Mocks ---

const mockStartTracking = jest.fn().mockResolvedValue(undefined)
const mockStopTracking = jest.fn().mockResolvedValue(undefined)
const mockSetSettings = jest.fn().mockResolvedValue(undefined)

let mockSettings: Settings = { ...DEFAULT_SETTINGS }
let mockTracking = false
let mockCoords: { latitude: number; longitude: number } | null = null

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings,
    tracking: mockTracking,
    startTracking: mockStartTracking,
    stopTracking: mockStopTracking,
    setSettings: mockSetSettings,
    activeProfileName: "Default"
  }),
  useCoords: () => mockCoords
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
      primaryDark: "#115E59",
      border: "#e5e7eb",
      text: "#000",
      textSecondary: "#6b7280",
      textLight: "#9ca3af",
      background: "#fff",
      info: "#3b82f6",
      success: "#22c55e",
      error: "#ef4444",
      card: "#fff",
      backgroundElevated: "#f9fafb",
      placeholder: "#9ca3af",
      textOnPrimary: "#fff"
    }
  })
}))

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn()
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
    checkCurrentPauseZone: jest.fn().mockResolvedValue(null)
  }
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    DashboardMap: () => R.createElement(View, { testID: "DashboardMap" }),
    CoordinateDisplay: () => R.createElement(View, { testID: "CoordinateDisplay" }),
    DatabaseStatistics: () => R.createElement(View, { testID: "DatabaseStatistics" }),
    ServerConnection: () => R.createElement(View, { testID: "ServerConnection" }),
    QuickAccess: () => R.createElement(View, { testID: "QuickAccess" }),
    WelcomeCard: () => R.createElement(View, { testID: "WelcomeCard" }),
    Container: ({ children }: any) => R.createElement(View, null, children),
    Button: ({ title, onPress }: any) => R.createElement(Pressable, { onPress }, R.createElement(Text, null, title))
  }
})

import { DashboardScreen } from "../DashboardScreen"

const mockNavigation = { navigate: jest.fn() } as any

describe("DashboardScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSettings = { ...DEFAULT_SETTINGS }
    mockTracking = false
    mockCoords = null
  })

  it("shows Start Tracking button when not tracking", () => {
    mockTracking = false

    const { getByText } = render(<DashboardScreen navigation={mockNavigation} />)

    expect(getByText("Start Tracking")).toBeTruthy()
  })

  it("shows Stop Tracking button when tracking", () => {
    mockTracking = true

    const { getByText } = render(<DashboardScreen navigation={mockNavigation} />)

    expect(getByText("Stop Tracking")).toBeTruthy()
  })

  it("shows CoordinateDisplay when tracking with valid coords", () => {
    mockTracking = true
    mockCoords = { latitude: 52.52, longitude: 13.405 }

    const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

    expect(getByTestId("CoordinateDisplay")).toBeTruthy()
  })

  it("hides CoordinateDisplay when not tracking", () => {
    mockTracking = false
    mockCoords = { latitude: 52.52, longitude: 13.405 }

    const { queryByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

    expect(queryByTestId("CoordinateDisplay")).toBeNull()
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

  it("renders DatabaseStatistics component", () => {
    const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

    expect(getByTestId("DatabaseStatistics")).toBeTruthy()
  })

  it("renders ServerConnection component", () => {
    const { getByTestId } = render(<DashboardScreen navigation={mockNavigation} />)

    expect(getByTestId("ServerConnection")).toBeTruthy()
  })
})
