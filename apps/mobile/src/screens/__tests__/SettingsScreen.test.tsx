import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
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
    colors: require("@colota/shared").lightColors
  })
}))

const mockGetStats = jest.fn().mockResolvedValue({
  queued: 5,
  sent: 42,
  total: 100,
  today: 10,
  databaseSizeMB: 1.2
})

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getStats: (...args: any[]) => mockGetStats(...args),
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
    Notice: ({ testID, title, message, onPress }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress },
        R.createElement(Text, null, title),
        message ? R.createElement(Text, null, message) : null
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
    mockGetStats.mockResolvedValue({ queued: 5, sent: 42, total: 100, today: 10, databaseSizeMB: 1.2 })
  })

  it("renders grouped section headers", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("Display")).toBeTruthy()
    expect(getByText("Data")).toBeTruthy()
  })

  // --- Summary rows ---

  // The stats strip is gone, so the queue only reaches the user through this line.
  // A missing count here means a backlog is invisible until Data Management is opened.
  it("carries the queue, the sent count and the interval in the Connection sub line", async () => {
    mockSettings = { ...DEFAULT_SETTINGS, endpoint: "https://api.example.com/track", interval: 5 }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("api.example.com · 5 queued · 42 sent · every 5 s")).toBeTruthy()
    })
  })

  it("shows 'No server configured' when endpoint is empty and not offline", () => {
    mockSettings = { ...DEFAULT_SETTINGS, endpoint: "", isOfflineMode: false }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText(/No server configured/)).toBeTruthy()
  })

  // Nothing is queued for a server that was never asked for, so the offline line
  // reports the day's count instead of a queue that cannot drain.
  it("reports today's count instead of a queue in offline mode", async () => {
    mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("Offline - saved locally · 10 today")).toBeTruthy()
    })
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

  // --- Queue notice ---

  // The banner is the only thing that pulls a user into Data Management before the
  // queue turns into a stall, so it must appear exactly at the threshold, not past it.
  it("raises the warning notice at the high queue threshold and opens Data Management", async () => {
    mockGetStats.mockResolvedValue({ queued: 50, sent: 1, total: 51, today: 3, databaseSizeMB: 1 })

    const { getByTestId, getByText } = render(<SettingsScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText("50 locations waiting")).toBeTruthy()
    })

    fireEvent.press(getByTestId("queue-notice"))

    expect(mockNavigate).toHaveBeenCalledWith("Data Management")
  })

  it("keeps the notice away while the queue is still draining normally", async () => {
    mockGetStats.mockResolvedValue({ queued: 49, sent: 1, total: 50, today: 3, databaseSizeMB: 1 })

    const { queryByTestId, getByText } = render(<SettingsScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText(/49 queued/)).toBeTruthy()
    })
    expect(queryByTestId("queue-notice")).toBeNull()
  })

  it("never raises the queue notice in offline mode, where nothing is waiting to send", async () => {
    mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }
    mockGetStats.mockResolvedValue({ queued: 500, sent: 0, total: 500, today: 3, databaseSizeMB: 1 })

    const { queryByTestId, getByText } = render(<SettingsScreen {...mockProps} />)

    await waitFor(() => {
      expect(getByText(/Offline - saved locally/)).toBeTruthy()
    })
    expect(queryByTestId("queue-notice")).toBeNull()
  })

  // --- Navigation ---

  it("navigates to Appearance", () => {
    const { getByTestId } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByTestId("nav-appearance"))

    expect(mockNavigate).toHaveBeenCalledWith("Appearance")
  })

  it("navigates to Connection", () => {
    const { getByTestId } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByTestId("nav-connection"))

    expect(mockNavigate).toHaveBeenCalledWith("Connection")
  })

  it("navigates to Tracking & Sync", () => {
    const { getByTestId } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByTestId("nav-tracking-sync"))

    expect(mockNavigate).toHaveBeenCalledWith("Tracking & Sync")
  })

  it("navigates to Tracking Profiles", () => {
    const { getByTestId } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByTestId("nav-tracking-profiles"))

    expect(mockNavigate).toHaveBeenCalledWith("Tracking Profiles")
  })

  it("navigates to Data Management", () => {
    const { getByTestId } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByTestId("nav-data-management"))

    expect(mockNavigate).toHaveBeenCalledWith("Data Management")
  })

  it("navigates to API Config", () => {
    const { getByTestId } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByTestId("nav-api-config"))

    expect(mockNavigate).toHaveBeenCalledWith("API Config")
  })

  // The row label must read the same as the header the route paints, or the user
  // arrives on a screen that appears to be a different one.
  it("labels the API row as its own screen title", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("API field mapping")).toBeTruthy()
  })

  // --- Offline mode ---

  it("hides the API field mapping link when offline mode is enabled", () => {
    mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }

    const { queryByTestId } = render(<SettingsScreen {...mockProps} />)

    expect(queryByTestId("nav-api-config")).toBeNull()
  })

  it("still shows Connection, Tracking Profiles and Data Management in offline mode", () => {
    mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("Connection")).toBeTruthy()
    expect(getByText("Tracking Profiles")).toBeTruthy()
    expect(getByText("Data Management")).toBeTruthy()
  })
})
