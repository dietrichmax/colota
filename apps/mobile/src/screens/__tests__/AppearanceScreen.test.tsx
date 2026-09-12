import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"

// --- Mocks ---

const mockSetPreference = jest.fn()
const mockSetWallpaperColors = jest.fn()
const theme = { wallpaperColors: false, wallpaperColorsAvailable: true, wallpaperPaletteReady: true }

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    mode: "light",
    preference: "system",
    setPreference: mockSetPreference,
    wallpaperColors: theme.wallpaperColors,
    setWallpaperColors: mockSetWallpaperColors,
    wallpaperColorsAvailable: theme.wallpaperColorsAvailable,
    wallpaperPaletteReady: theme.wallpaperPaletteReady,
    colors: require("@colota/shared").lightColors
  })
}))

const mockSaveSetting = jest.fn().mockResolvedValue(undefined)
const mockGetSetting = jest.fn().mockResolvedValue(null)

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    saveSetting: (key: string, value: string) => mockSaveSetting(key, value),
    getSetting: (key: string) => mockGetSetting(key),
    getBuildConfig: () => ({ APP_LANGUAGE: "en-GB" })
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
        accessibilityState: { disabled: !!props.disabled },
        onPress: () => props.onValueChange(!props.value)
      })
    },
    FieldMessage: ({ children, variant }: any) =>
      R.createElement(Text, { accessibilityValue: { text: variant ?? "info" } }, children),
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
    theme.wallpaperPaletteReady = true
    mockGetSetting.mockResolvedValue(null)
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

  // A failed read must not hide the only control that turns the setting off.
  it("keeps the wallpaper row when the palette read has not landed, and disables it", () => {
    theme.wallpaperPaletteReady = false

    const { getByTestId } = render(<AppearanceScreen navigation={mockNavigation} />)

    expect(getByTestId("wallpaper-colors-toggle").props.accessibilityState.disabled).toBe(true)
  })

  it("hands the wallpaper choice to the theme, which owns the palette", () => {
    const { getByTestId } = render(<AppearanceScreen navigation={mockNavigation} />)

    fireEvent.press(getByTestId("wallpaper-colors-toggle"))

    expect(mockSetWallpaperColors).toHaveBeenCalledWith(true)
  })

  it("puts the units the choice produces under the label", async () => {
    const { getByText, queryByText } = render(<AppearanceScreen navigation={mockNavigation} />)

    expect(getByText("km · km/h · m")).toBeTruthy()

    fireEvent.press(getByText("Imperial"))

    await waitFor(() => expect(getByText("mi · mph · ft")).toBeTruthy())
    expect(queryByText("km · km/h · m")).toBeNull()
  })

  it("puts a clock in the chosen format under the time format label", async () => {
    const { getByText } = render(<AppearanceScreen navigation={mockNavigation} />)
    const { clockSample } = require("../../utils/appearance")

    expect(getByText(clockSample("24h"))).toBeTruthy()

    fireEvent.press(getByText("12h"))

    await waitFor(() => expect(getByText(clockSample("12h"))).toBeTruthy())
  })

  it("names the host serving tiles rather than describing the setting", async () => {
    const { findByText } = render(<AppearanceScreen navigation={mockNavigation} />)

    expect(await findByText("maps.mxd.codes")).toBeTruthy()
  })

  it("names both hosts when the two styles come from different servers", async () => {
    mockGetSetting.mockImplementation((key: string) =>
      Promise.resolve(key === "mapStyleUrlLight" ? "https://a.example.org/l.json" : "https://b.example.org/d.json")
    )

    const { findByText } = render(<AppearanceScreen navigation={mockNavigation} />)

    expect(await findByText("a.example.org · b.example.org")).toBeTruthy()
  })

  it("toggles the map tile server panel when pressed", () => {
    const { getByTestId, queryByTestId } = render(<AppearanceScreen navigation={mockNavigation} />)

    expect(queryByTestId("map-style-url-light")).toBeNull()

    fireEvent.press(getByTestId("map-tile-server-toggle"))

    expect(queryByTestId("map-style-url-light")).toBeTruthy()
    expect(queryByTestId("map-style-url-dark")).toBeTruthy()
  })

  // A stored typo blanks every map, and only the reset undoes it.
  it("refuses a URL that is not one, and saves nothing", async () => {
    const { getByTestId, findByText } = render(<AppearanceScreen navigation={mockNavigation} />)
    fireEvent.press(getByTestId("map-tile-server-toggle"))

    fireEvent.changeText(getByTestId("map-style-url-light"), "htps://tiles.example.org")
    fireEvent(getByTestId("map-style-url-light"), "blur")

    expect(await findByText("Starts with http:// or https:// and names a host.")).toBeTruthy()
    expect(mockSaveSetting).not.toHaveBeenCalledWith("mapStyleUrlLight", expect.anything())
  })

  it("saves a good URL and moves the host on the row", async () => {
    const { getByTestId, findByText } = render(<AppearanceScreen navigation={mockNavigation} />)
    fireEvent.press(getByTestId("map-tile-server-toggle"))

    fireEvent.changeText(getByTestId("map-style-url-light"), "https://tiles.example.org/light.json")
    fireEvent(getByTestId("map-style-url-light"), "blur")

    await waitFor(() =>
      expect(mockSaveSetting).toHaveBeenCalledWith("mapStyleUrlLight", "https://tiles.example.org/light.json")
    )
    expect(await findByText(/tiles\.example\.org/)).toBeTruthy()
  })

  it("accepts an emptied field as a return to the default", async () => {
    mockGetSetting.mockResolvedValue("https://tiles.example.org/light.json")
    const { getByTestId } = render(<AppearanceScreen navigation={mockNavigation} />)
    fireEvent.press(getByTestId("map-tile-server-toggle"))

    fireEvent.changeText(getByTestId("map-style-url-light"), "")
    fireEvent(getByTestId("map-style-url-light"), "blur")

    await waitFor(() => expect(mockSaveSetting).toHaveBeenCalledWith("mapStyleUrlLight", ""))
  })

  it("offers the reset only once something custom is stored", async () => {
    const { getByTestId, queryByTestId } = render(<AppearanceScreen navigation={mockNavigation} />)
    fireEvent.press(getByTestId("map-tile-server-toggle"))

    expect(queryByTestId("map-style-reset-btn")).toBeNull()

    mockGetSetting.mockResolvedValue("https://tiles.example.org/light.json")
    const custom = render(<AppearanceScreen navigation={mockNavigation} />)
    fireEvent.press(custom.getByTestId("map-tile-server-toggle"))

    await waitFor(() => expect(custom.getByTestId("map-style-reset-btn")).toBeTruthy())
  })
})
