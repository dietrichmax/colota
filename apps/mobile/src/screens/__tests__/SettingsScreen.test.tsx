import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { DEFAULT_SETTINGS, Settings } from "../../types/global"

// --- Mocks ---

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => (() => void) | void) => require("react").useEffect(() => cb(), [])
}))

let mockSettings: Settings = { ...DEFAULT_SETTINGS }
let mockTracking = false

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings,
    setSettings: jest.fn(),
    updateSettingsLocal: jest.fn(),
    restartTracking: jest.fn(),
    tracking: mockTracking
  })
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    mode: "light",
    toggleTheme: jest.fn(),
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

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getStats: jest.fn().mockResolvedValue({
      queued: 5,
      sent: 42,
      total: 100,
      today: 10,
      databaseSizeMB: 1.2
    }),
    saveSetting: jest.fn().mockResolvedValue(undefined),
    getSetting: jest.fn().mockResolvedValue(null)
  }
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    StatsCard: ({ queueCount, sentCount }: any) =>
      R.createElement(
        View,
        { testID: "StatsCard" },
        R.createElement(Text, null, `${queueCount}`),
        R.createElement(Text, null, `${sentCount}`)
      ),
    ListItem: ({ testID, label, sub, onPress }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress },
        R.createElement(Text, null, label),
        sub ? R.createElement(Text, null, sub) : null
      )
  }
})

import { SettingsScreen } from "../SettingsScreen"

const mockNavigate = jest.fn()
const mockProps = { navigation: { navigate: mockNavigate }, route: { key: "Settings", name: "Settings" } } as any

describe("SettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSettings = { ...DEFAULT_SETTINGS }
    mockTracking = false
  })

  it("renders grouped section headers", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("Display")).toBeTruthy()
    expect(getByText("Data")).toBeTruthy()
  })

  it("renders StatsCard with stats", () => {
    const { getByTestId } = render(<SettingsScreen {...mockProps} />)

    expect(getByTestId("StatsCard")).toBeTruthy()
  })

  // --- Summary rows ---

  it("shows the endpoint host as the Connection summary", () => {
    mockSettings = { ...DEFAULT_SETTINGS, endpoint: "https://api.example.com/track" }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("api.example.com")).toBeTruthy()
  })

  it("shows 'No server configured' when endpoint is empty and not offline", () => {
    mockSettings = { ...DEFAULT_SETTINGS, endpoint: "", isOfflineMode: false }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("No server configured")).toBeTruthy()
  })

  it("shows 'Offline' as the Connection summary in offline mode", () => {
    mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("Offline - saved locally")).toBeTruthy()
  })

  it("shows the preset label as the Sync Strategy summary", () => {
    mockSettings = { ...DEFAULT_SETTINGS, syncPreset: "balanced" }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText(/Balanced/)).toBeTruthy()
  })

  it("shows a custom summary when syncPreset is custom", () => {
    mockSettings = { ...DEFAULT_SETTINGS, syncPreset: "custom", interval: 45 }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("Custom · every 45s")).toBeTruthy()
  })

  // --- Navigation ---

  it("navigates to Appearance", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByText("Appearance"))

    expect(mockNavigate).toHaveBeenCalledWith("Appearance")
  })

  it("navigates to Connection", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByText("Connection"))

    expect(mockNavigate).toHaveBeenCalledWith("Connection")
  })

  it("navigates to Tracking & Sync", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByText("Tracking & Sync"))

    expect(mockNavigate).toHaveBeenCalledWith("Tracking & Sync")
  })

  it("navigates to Tracking Profiles", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByText("Tracking Profiles"))

    expect(mockNavigate).toHaveBeenCalledWith("Tracking Profiles")
  })

  it("navigates to Data Management", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByText("Data Management"))

    expect(mockNavigate).toHaveBeenCalledWith("Data Management")
  })

  it("navigates to API Config", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByText("API Field Mapping"))

    expect(mockNavigate).toHaveBeenCalledWith("API Config")
  })

  // --- Offline mode ---

  it("hides API Field Mapping link when offline mode is enabled", () => {
    mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }

    const { queryByText } = render(<SettingsScreen {...mockProps} />)

    expect(queryByText("API Field Mapping")).toBeNull()
  })

  it("still shows Connection, Tracking Profiles and Data Management in offline mode", () => {
    mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("Connection")).toBeTruthy()
    expect(getByText("Tracking Profiles")).toBeTruthy()
    expect(getByText("Data Management")).toBeTruthy()
  })
})
