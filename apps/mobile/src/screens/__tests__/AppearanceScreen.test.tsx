import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"

// --- Mocks ---

const mockSetPreference = jest.fn()
const mockSetWallpaperColors = jest.fn()
const theme = { wallpaperColors: false, wallpaperColorsAvailable: true }

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    mode: "light",
    preference: "system",
    setPreference: mockSetPreference,
    wallpaperColors: theme.wallpaperColors,
    setWallpaperColors: mockSetWallpaperColors,
    wallpaperColorsAvailable: theme.wallpaperColorsAvailable,
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
  const { View, Text } = require("react-native")
  return {
    ListItem: require("../../testing/componentStubs").ListItemStub,
    TextField: require("../../testing/componentStubs").TextFieldStub,
    ChipGroup: function (props: any) {
      const RN = require("react-native")
      return R.createElement(
        View,
        null,
        props.options.map(function (o: any) {
          return R.createElement(
            RN.Pressable,
            { key: o.value, testID: o.testID, onPress: () => props.onSelect(o.value) },
            R.createElement(Text, null, o.label)
          )
        })
      )
    },
    Button: function (props: any) {
      return require("react").createElement(
        require("react-native").Pressable,
        { testID: props.testID, onPress: props.onPress, disabled: props.disabled, accessibilityRole: "button" },
        require("react").createElement(require("react-native").Text, null, props.title)
      )
    },
    Toggle: function (props: any) {
      return require("react").createElement(require("react-native").Pressable, {
        testID: props.testID,
        accessibilityLabel: props.accessibilityLabel,
        disabled: props.disabled,
        onPress: () => props.onValueChange(!props.value)
      })
    },
    Container: ({ children }: any) => R.createElement(View, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    SettingRow: ({ label, hint, children }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        hint ? R.createElement(Text, null, hint) : null,
        children
      )
  }
})

import { AppearanceScreen } from "../AppearanceScreen"

const mockNavigation = { navigate: jest.fn() } as any

describe("AppearanceScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    theme.wallpaperColors = false
    theme.wallpaperColorsAvailable = true
  })

  it("renders theme, units and time format rows", () => {
    const { getByText, getByTestId } = render(<AppearanceScreen navigation={mockNavigation} />)

    expect(getByText("Theme")).toBeTruthy()
    expect(getByText("Units")).toBeTruthy()
    expect(getByText("Time format")).toBeTruthy()
    expect(getByTestId("theme-system")).toBeTruthy()
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

  it("offers system alongside light and dark, which a toggle could not", () => {
    const { getByTestId } = render(<AppearanceScreen navigation={mockNavigation} />)

    expect(getByTestId("theme-system")).toBeTruthy()
    expect(getByTestId("theme-light")).toBeTruthy()
    expect(getByTestId("theme-dark")).toBeTruthy()
  })

  it("records the picked mode rather than flipping the current one", () => {
    const { getByTestId } = render(<AppearanceScreen navigation={mockNavigation} />)

    fireEvent.press(getByTestId("theme-dark"))

    expect(mockSetPreference).toHaveBeenCalledWith("dark")
  })

  it("keeps the wallpaper palette out of the mode chips, which answer a different question", () => {
    const { getByTestId, queryByTestId } = render(<AppearanceScreen navigation={mockNavigation} />)

    expect(getByTestId("wallpaper-colors-toggle")).toBeTruthy()
    expect(queryByTestId("theme-wallpaper")).toBeNull()
  })

  it("hides the wallpaper row where the platform has no palette, rather than disabling it", () => {
    theme.wallpaperColorsAvailable = false

    const { queryByTestId } = render(<AppearanceScreen navigation={mockNavigation} />)

    expect(queryByTestId("wallpaper-colors-toggle")).toBeNull()
  })

  it("hands the wallpaper choice to the theme, which owns the palette", () => {
    const { getByTestId } = render(<AppearanceScreen navigation={mockNavigation} />)

    fireEvent.press(getByTestId("wallpaper-colors-toggle"))

    expect(mockSetWallpaperColors).toHaveBeenCalledWith(true)
  })

  it("toggles the map tile server panel when pressed", () => {
    const { getByTestId, queryByTestId } = render(<AppearanceScreen navigation={mockNavigation} />)

    expect(queryByTestId("map-style-url-light")).toBeNull()

    fireEvent.press(getByTestId("map-tile-server-toggle"))

    expect(queryByTestId("map-style-url-light")).toBeTruthy()
    expect(queryByTestId("map-style-url-dark")).toBeTruthy()
  })
})
