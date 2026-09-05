import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"

// --- Mocks ---

const mockToggleTheme = jest.fn()

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    mode: "light",
    toggleTheme: mockToggleTheme,
    colors: {
      primary: "#0d9488",
      primaryDark: "#115E59",
      border: "#e5e7eb",
      text: "#000",
      textSecondary: "#6b7280",
      textLight: "#9ca3af",
      background: "#fff",
      card: "#fff",
      backgroundElevated: "#f9fafb",
      placeholder: "#9ca3af"
    }
  })
}))

const mockSaveSetting = jest.fn().mockResolvedValue(undefined)

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    saveSetting: (key: string, value: string) => mockSaveSetting(key, value),
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
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    SettingRow: ({ label, children }: any) => R.createElement(View, null, R.createElement(Text, null, label), children)
  }
})

import { AppearanceScreen } from "../AppearanceScreen"

const mockNavigation = { navigate: jest.fn() } as any

describe("AppearanceScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("renders dark mode, units and time format rows", () => {
    const { getByText, getByTestId } = render(<AppearanceScreen navigation={mockNavigation} />)

    expect(getByText("Dark Mode")).toBeTruthy()
    expect(getByText("Units")).toBeTruthy()
    expect(getByText("Time Format")).toBeTruthy()
    expect(getByTestId("dark-mode-switch")).toBeTruthy()
  })

  it("shows unit system chips with Metric and Imperial", () => {
    const { getByText } = render(<AppearanceScreen navigation={mockNavigation} />)

    expect(getByText("Metric")).toBeTruthy()
    expect(getByText("Imperial")).toBeTruthy()
  })

  it("shows time format chips with 24h and 12h", () => {
    const { getByText } = render(<AppearanceScreen navigation={mockNavigation} />)

    expect(getByText("24h")).toBeTruthy()
    expect(getByText("12h")).toBeTruthy()
  })

  it("saves unit system when chip is pressed", async () => {
    const { getByText } = render(<AppearanceScreen navigation={mockNavigation} />)

    fireEvent.press(getByText("Imperial"))

    await waitFor(() => {
      expect(mockSaveSetting).toHaveBeenCalledWith("unitSystem", "imperial")
    })
  })

  it("saves time format when chip is pressed", async () => {
    const { getByText } = render(<AppearanceScreen navigation={mockNavigation} />)

    fireEvent.press(getByText("12h"))

    await waitFor(() => {
      expect(mockSaveSetting).toHaveBeenCalledWith("timeFormat", "12h")
    })
  })

  it("toggles theme when dark mode switch is pressed", () => {
    const { getByTestId } = render(<AppearanceScreen navigation={mockNavigation} />)

    fireEvent(getByTestId("dark-mode-switch"), "valueChange", true)

    expect(mockToggleTheme).toHaveBeenCalled()
  })

  it("toggles the map tile server panel when pressed", () => {
    const { getByTestId, queryByTestId } = render(<AppearanceScreen navigation={mockNavigation} />)

    expect(queryByTestId("map-style-url-light")).toBeNull()

    fireEvent.press(getByTestId("map-tile-server-toggle"))

    expect(queryByTestId("map-style-url-light")).toBeTruthy()
    expect(queryByTestId("map-style-url-dark")).toBeTruthy()
  })
})
