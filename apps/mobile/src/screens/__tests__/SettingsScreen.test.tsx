import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { DEFAULT_SETTINGS, Settings } from "../../types/global"

// --- Mocks ---

let mockSettings: Settings = { ...DEFAULT_SETTINGS }
const mockSetSettings = jest.fn()
const mockUpdateSettingsLocal = jest.fn()
const mockRestartTracking = jest.fn()
let mockTracking = false

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings,
    setSettings: mockSetSettings,
    updateSettingsLocal: mockUpdateSettingsLocal,
    restartTracking: mockRestartTracking,
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

jest.mock("../../hooks/useAutoSave", () => ({
  useAutoSave: () => ({
    saving: false,
    saveSuccess: false,
    debouncedSaveAndRestart: jest.fn(),
    immediateSaveAndRestart: jest.fn()
  })
}))

const mockSaveSetting = jest.fn().mockResolvedValue(undefined)

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
    saveSetting: (...args: any[]) => mockSaveSetting(...args),
    getSetting: jest.fn().mockResolvedValue(null)
  }
}))

jest.mock("../../utils/geo", () => ({
  ...jest.requireActual("../../utils/geo"),
  getUnitSystem: () => "metric",
  getTimeFormat: () => "24h",
  loadDisplayPreferences: jest.fn().mockResolvedValue(undefined)
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    SettingRow: ({ label, children }: any) => R.createElement(View, null, R.createElement(Text, null, label), children),
    StatsCard: ({ queueCount, sentCount }: any) =>
      R.createElement(
        View,
        { testID: "StatsCard" },
        R.createElement(Text, null, `${queueCount}`),
        R.createElement(Text, null, `${sentCount}`)
      )
  }
})

jest.mock("../../components/features/settings/ConnectionSettings", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    ConnectionSettings: () => R.createElement(View, { testID: "ConnectionSettings" })
  }
})

jest.mock("../../components/features/settings/SyncStrategySettings", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    SyncStrategySettings: () => R.createElement(View, { testID: "SyncStrategySettings" })
  }
})

jest.mock("../../components/ui/FloatingSaveIndicator", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    FloatingSaveIndicator: () => R.createElement(View, { testID: "FloatingSaveIndicator" })
  }
})

import { SettingsScreen } from "../SettingsScreen"

const mockNavigate = jest.fn()
const mockNavigation = { navigate: mockNavigate } as any

describe("SettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSettings = { ...DEFAULT_SETTINGS }
    mockTracking = false
  })

  it("renders title and main sections", () => {
    const { getByText } = render(<SettingsScreen navigation={mockNavigation} />)

    expect(getByText("Settings")).toBeTruthy()
    expect(getByText("Appearance")).toBeTruthy()
    expect(getByText("Advanced")).toBeTruthy()
  })

  it("renders StatsCard with stats", async () => {
    const { getByTestId } = render(<SettingsScreen navigation={mockNavigation} />)

    expect(getByTestId("StatsCard")).toBeTruthy()
  })

  it("renders ConnectionSettings and SyncStrategySettings", () => {
    const { getByTestId } = render(<SettingsScreen navigation={mockNavigation} />)

    expect(getByTestId("ConnectionSettings")).toBeTruthy()
    expect(getByTestId("SyncStrategySettings")).toBeTruthy()
  })

  // --- Chip selectors ---

  it("shows unit system chips with Metric selected by default", () => {
    const { getByText } = render(<SettingsScreen navigation={mockNavigation} />)

    expect(getByText("Metric")).toBeTruthy()
    expect(getByText("Imperial")).toBeTruthy()
  })

  it("shows time format chips with 24h and 12h", () => {
    const { getByText } = render(<SettingsScreen navigation={mockNavigation} />)

    expect(getByText("24h")).toBeTruthy()
    expect(getByText("12h")).toBeTruthy()
  })

  it("saves unit system when chip is pressed", async () => {
    const { getByText } = render(<SettingsScreen navigation={mockNavigation} />)

    fireEvent.press(getByText("Imperial"))

    await waitFor(() => {
      expect(mockSaveSetting).toHaveBeenCalledWith("unitSystem", "imperial")
    })
  })

  it("saves time format when chip is pressed", async () => {
    const { getByText } = render(<SettingsScreen navigation={mockNavigation} />)

    fireEvent.press(getByText("12h"))

    await waitFor(() => {
      expect(mockSaveSetting).toHaveBeenCalledWith("timeFormat", "12h")
    })
  })

  // --- Navigation ---

  it("navigates to Tracking Profiles", () => {
    const { getByText } = render(<SettingsScreen navigation={mockNavigation} />)

    fireEvent.press(getByText("Tracking Profiles"))

    expect(mockNavigate).toHaveBeenCalledWith("Tracking Profiles")
  })

  it("navigates to Data Management", () => {
    const { getByText } = render(<SettingsScreen navigation={mockNavigation} />)

    fireEvent.press(getByText("Data Management"))

    expect(mockNavigate).toHaveBeenCalledWith("Data Management")
  })

  it("navigates to API Config", () => {
    const { getByText } = render(<SettingsScreen navigation={mockNavigation} />)

    fireEvent.press(getByText("API Field Mapping"))

    expect(mockNavigate).toHaveBeenCalledWith("API Config")
  })

  // --- Offline mode ---

  it("hides API Field Mapping link when offline mode is enabled", () => {
    mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }

    const { queryByText } = render(<SettingsScreen navigation={mockNavigation} />)

    expect(queryByText("API Field Mapping")).toBeNull()
  })

  it("still shows Tracking Profiles and Data Management in offline mode", () => {
    mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }

    const { getByText } = render(<SettingsScreen navigation={mockNavigation} />)

    expect(getByText("Tracking Profiles")).toBeTruthy()
    expect(getByText("Data Management")).toBeTruthy()
  })
})
