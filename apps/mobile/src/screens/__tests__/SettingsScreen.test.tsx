import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { Linking } from "react-native"
import { DEFAULT_SETTINGS, Settings } from "../../types/global"

// --- Mocks ---

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => (() => void) | void) => require("react").useEffect(() => cb(), [])
}))

let mockSettings: Settings = { ...DEFAULT_SETTINGS }
let mockTracking = false
let mockActiveProfileName: string | null = null

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings,
    setSettings: jest.fn(),
    updateSettingsLocal: jest.fn(),
    restartTracking: jest.fn(),
    tracking: mockTracking,
    activeProfileName: mockActiveProfileName
  })
}))

// The real getters fall back to the host locale, which decides the assertion otherwise.
jest.mock("../../utils/geo", () => ({
  ...jest.requireActual("../../utils/geo"),
  getUnitSystem: () => "metric",
  getTimeFormat: () => "24h"
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    mode: "light",
    preference: "dark",
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

const mockGetStats = jest.fn()
const mockGetProfiles = jest.fn()

jest.mock("../../services/ProfileService", () => ({
  ProfileService: {
    getProfiles: (...args: unknown[]) => mockGetProfiles(...args)
  }
}))

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getStats: (...args: unknown[]) => mockGetStats(...args),
    saveSetting: jest.fn().mockResolvedValue(undefined),
    getSetting: jest.fn().mockResolvedValue(null)
  }
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Button: function (props: any) {
      return require("react").createElement(
        require("react-native").Pressable,
        { testID: props.testID, onPress: props.onPress, disabled: props.disabled, accessibilityRole: "button" },
        require("react").createElement(require("react-native").Text, null, props.title)
      )
    },
    Toggle: function (props: any) {
      return require("react").createElement(require("react-native").Switch, {
        testID: props.testID,
        value: props.value,
        onValueChange: props.onValueChange,
        disabled: props.disabled,
        accessibilityLabel: props.accessibilityLabel
      })
    },
    Container: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    QueueWarning: ({ queueCount, onPress }: any) =>
      queueCount > 50
        ? R.createElement(
            Pressable,
            { testID: "queue-warning", onPress },
            R.createElement(Text, null, `warning ${queueCount}`)
          )
        : null,
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
    mockGetStats.mockResolvedValue({ queued: 5, sent: 42, total: 100, today: 10, databaseSizeMB: 1.2 })
    mockGetProfiles.mockResolvedValue([])
    mockSettings = { ...DEFAULT_SETTINGS }
    mockTracking = false
    mockActiveProfileName = null
  })

  it("renders grouped section headers", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("Tracking")).toBeTruthy()
    expect(getByText("Display")).toBeTruthy()
    expect(getByText("Data")).toBeTruthy()
    expect(getByText("Colota")).toBeTruthy()
  })

  it("carries what is stored on the row that opens it, not what was sent", async () => {
    // Data management already lists sent in its own grid, and on a healthy setup sent equals
    // recorded, so the pair would read the same number twice. Size never does.
    const { findByText } = render(<SettingsScreen {...mockProps} />)

    expect(await findByText("100 recorded · 1.2 MB")).toBeTruthy()
  })

  it("shows the current appearance rather than listing what the screen holds", () => {
    // Reading the settings it opens costs nothing: both getters are cached module reads.
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("Dark · Metric · 24h")).toBeTruthy()
  })

  it("describes the screen while nothing is recorded, since zero is not worth reporting", async () => {
    mockGetStats.mockResolvedValue({ queued: 0, sent: 0, total: 0, today: 0, databaseSizeMB: 0 })

    const { findByText } = render(<SettingsScreen {...mockProps} />)

    expect(await findByText("View queue and clear data")).toBeTruthy()
  })

  it("surfaces the queue warning once it is over the threshold", async () => {
    mockGetStats.mockResolvedValue({ queued: 120, sent: 42, total: 100, today: 10, databaseSizeMB: 1.2 })

    const { findByTestId } = render(<SettingsScreen {...mockProps} />)

    expect(await findByTestId("queue-warning")).toBeTruthy()
  })

  it("keeps the queue out of sight until it is backing up", async () => {
    // The stats strip showed a queue of 5 as prominently as a queue of 500. Below the threshold
    // the count belongs in the Connection row, and only above it does the queue earn a surface.
    const { queryByTestId } = render(<SettingsScreen {...mockProps} />)

    await waitFor(() => expect(queryByTestId("queue-warning")).toBeNull())
  })

  // --- Summary rows ---

  it("carries the host and the queue on the Connection row", async () => {
    // The strip above the list used to hold the queue; the row holds it now, so the strip could go.
    mockSettings = { ...DEFAULT_SETTINGS, endpoint: "https://api.example.com/track" }

    const { findByText } = render(<SettingsScreen {...mockProps} />)

    expect(await findByText("api.example.com · 5 queued")).toBeTruthy()
  })

  it("drops the queued segment when there is nothing waiting", async () => {
    mockGetStats.mockResolvedValue({ queued: 0, sent: 42, total: 100, today: 10, databaseSizeMB: 1.2 })
    mockSettings = { ...DEFAULT_SETTINGS, endpoint: "https://api.example.com/track" }

    const { findByText } = render(<SettingsScreen {...mockProps} />)

    expect(await findByText("api.example.com")).toBeTruthy()
  })

  it("shows 'No server configured' when endpoint is empty and not offline", () => {
    mockSettings = { ...DEFAULT_SETTINGS, endpoint: "", isOfflineMode: false }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("No server configured")).toBeTruthy()
  })

  it("counts today's points instead of a queue in offline mode", async () => {
    mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }

    const { findByText } = render(<SettingsScreen {...mockProps} />)

    expect(await findByText("Offline - saved locally · 10 today")).toBeTruthy()
  })

  it("names the profile overriding the tracking settings, not how many exist", async () => {
    // A count is inventory: someone with two profiles already knows that. Which one is running is
    // the thing that changes and the thing that explains the interval they are seeing.
    mockGetProfiles.mockResolvedValue([{ id: 1 }, { id: 2 }])
    mockActiveProfileName = "Charging"

    const { findByText } = render(<SettingsScreen {...mockProps} />)

    expect(await findByText("Charging active")).toBeTruthy()
  })

  it("says none is active rather than going quiet when profiles exist but none matches", async () => {
    mockGetProfiles.mockResolvedValue([{ id: 1 }])

    const { findByText } = render(<SettingsScreen {...mockProps} />)

    expect(await findByText("No profile active")).toBeTruthy()
  })

  it("describes the feature while no profile exists, because there is no state to show", async () => {
    const { findByText } = render(<SettingsScreen {...mockProps} />)

    expect(await findByText("Switch GPS settings by condition")).toBeTruthy()
  })

  it("names both cadences on the row that names both, rather than only the GPS one", () => {
    // interval is the GPS cadence and syncInterval the upload one; the row read only the first.
    mockSettings = { ...DEFAULT_SETTINGS, interval: 30, syncInterval: 300 }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("Every 30 s, any movement · syncs every 5 min")).toBeTruthy()
  })

  it("says instantly rather than every 0s when nothing is batched", () => {
    mockSettings = { ...DEFAULT_SETTINGS, interval: 5, syncInterval: 0 }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("Every 5 s, any movement · syncs each fix")).toBeTruthy()
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

    fireEvent.press(getByText("Tracking & sync"))

    expect(mockNavigate).toHaveBeenCalledWith("Tracking & Sync")
  })

  it("navigates to Tracking Profiles", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByText("Tracking profiles"))

    expect(mockNavigate).toHaveBeenCalledWith("Tracking Profiles")
  })

  it("navigates to Data Management", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByText("Data management"))

    expect(mockNavigate).toHaveBeenCalledWith("Data Management")
  })

  it("navigates to Request Format", () => {
    const { getByText } = render(<SettingsScreen {...mockProps} />)

    fireEvent.press(getByText("Request format"))

    expect(mockNavigate).toHaveBeenCalledWith("Request Format")
  })

  // --- Offline mode ---

  it("hides the request format link when offline mode is enabled", () => {
    mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }

    const { queryByText } = render(<SettingsScreen {...mockProps} />)

    expect(queryByText("Request format")).toBeNull()
  })

  it("still shows Connection, Tracking Profiles and Data Management in offline mode", () => {
    mockSettings = { ...DEFAULT_SETTINGS, isOfflineMode: true }

    const { getByText } = render(<SettingsScreen {...mockProps} />)

    expect(getByText("Connection")).toBeTruthy()
    expect(getByText("Tracking profiles")).toBeTruthy()
    expect(getByText("Data management")).toBeTruthy()
  })

  describe("the Colota section", () => {
    beforeEach(() => {
      jest.spyOn(Linking, "openURL").mockResolvedValue(true as any)
    })

    it("opens the release notes from What's new", async () => {
      const { getByTestId } = render(<SettingsScreen {...mockProps} />)

      fireEvent.press(getByTestId("nav-whats-new"))

      await waitFor(() => {
        expect(Linking.openURL).toHaveBeenCalledWith("https://colota.app/releases")
      })
    })

    it("sends Rate the app to the Play listing", async () => {
      // market:// resolves inside the Play app; a device without it falls back to the web page.
      const { getByTestId } = render(<SettingsScreen {...mockProps} />)

      fireEvent.press(getByTestId("nav-rate"))

      await waitFor(() => {
        expect(Linking.openURL).toHaveBeenCalledWith("market://details?id=com.Colota")
      })
    })

    it("keeps the legal detail on its own screen", () => {
      const { getByTestId } = render(<SettingsScreen {...mockProps} />)

      fireEvent.press(getByTestId("nav-legal"))

      expect(mockNavigate).toHaveBeenCalledWith("Legal")
    })
  })
})
