import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"

// --- Mocks ---

const mockToggleTheme = jest.fn()

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    mode: "light",
    toggleTheme: mockToggleTheme,
    colors: require("@colota/shared").lightColors
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
  const { View, Text, Pressable, TextInput } = require("react-native")
  return {
    Toggle: ({ value, onValueChange, disabled, testID, accessibilityLabel }: any) =>
      R.createElement(Pressable, {
        testID,
        disabled,
        accessibilityRole: "switch",
        accessibilityLabel,
        accessibilityState: { checked: value, disabled: !!disabled },
        onPress: () => onValueChange(!value)
      }),
    Container: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    SettingRow: ({ label, children }: any) => R.createElement(View, null, R.createElement(Text, null, label), children),
    ChipGroup: ({ label, options, selected, onSelect }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        options.map((opt: any) =>
          R.createElement(
            Pressable,
            {
              key: opt.value,
              testID: opt.testID,
              accessibilityRole: "radio",
              accessibilityState: { checked: selected === opt.value },
              onPress: () => onSelect(opt.value)
            },
            R.createElement(Text, null, opt.label)
          )
        )
      ),
    ListItem: ({ testID, label, sub, onPress }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress },
        R.createElement(Text, null, label),
        sub ? R.createElement(Text, null, sub) : null
      ),
    TextField: ({ testID, label, value, onChangeText, onBlur, placeholder }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        R.createElement(TextInput, { testID, value, onChangeText, onBlur, placeholder })
      ),
    FieldMessage: ({ children }: any) => R.createElement(Text, null, children),
    Button: ({ title, onPress, testID }: any) =>
      R.createElement(Pressable, { testID, onPress }, R.createElement(Text, null, title))
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

    expect(getByText("Dark mode")).toBeTruthy()
    expect(getByText("Units")).toBeTruthy()
    expect(getByText("Time format")).toBeTruthy()
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
    const { getByTestId } = render(<AppearanceScreen navigation={mockNavigation} />)

    fireEvent.press(getByTestId("unit-imperial"))

    await waitFor(() => {
      expect(mockSaveSetting).toHaveBeenCalledWith("unitSystem", "imperial")
    })
  })

  it("saves time format when chip is pressed", async () => {
    const { getByTestId } = render(<AppearanceScreen navigation={mockNavigation} />)

    fireEvent.press(getByTestId("time-format-12h"))

    await waitFor(() => {
      expect(mockSaveSetting).toHaveBeenCalledWith("timeFormat", "12h")
    })
  })

  it("toggles theme when dark mode switch is pressed", () => {
    const { getByTestId } = render(<AppearanceScreen navigation={mockNavigation} />)

    fireEvent.press(getByTestId("dark-mode-switch"))

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
