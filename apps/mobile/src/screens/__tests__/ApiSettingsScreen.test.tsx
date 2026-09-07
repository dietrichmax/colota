import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { DEFAULT_SETTINGS, API_TEMPLATES, Settings } from "../../types/global"

// --- Mocks ---

const mockSetSettings = jest.fn().mockResolvedValue(undefined)
const mockRestartTracking = jest.fn().mockResolvedValue(undefined)
let mockSettings: Settings = { ...DEFAULT_SETTINGS }

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings,
    setSettings: mockSetSettings,
    restartTracking: mockRestartTracking
  })
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

const mockDebouncedSaveAndRestart = jest.fn()
const mockImmediateSaveAndRestart = jest.fn()

jest.mock("../../hooks/useAutoSave", () => ({
  useAutoSave: () => ({
    saving: false,
    saveSuccess: false,
    debouncedSaveAndRestart: mockDebouncedSaveAndRestart,
    immediateSaveAndRestart: mockImmediateSaveAndRestart
  })
}))

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    copyToClipboard: jest.fn().mockResolvedValue(undefined)
  }
}))

// Mock barrel exports to avoid native module imports
jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    IconButton: require("../../testing/componentStubs").IconButtonStub,
    TextField: require("../../testing/componentStubs").TextFieldStub,
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
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    FloatingSaveIndicator: () => null,
    Container: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    Card: ({ children }: any) => R.createElement(View, null, children),
    ListItem: ({ testID, label, sub, onPress }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress, accessibilityRole: "button" },
        R.createElement(Text, null, label),
        sub ? R.createElement(Text, null, sub) : null
      ),
    RadioRow: ({ testID, label, sub, selected, disabled, onPress }: any) =>
      R.createElement(
        Pressable,
        {
          testID,
          onPress,
          disabled,
          accessibilityRole: "radio",
          accessibilityState: { checked: selected, disabled }
        },
        R.createElement(Text, null, label),
        sub ? R.createElement(Text, null, sub) : null
      ),
    ChipGroup: ({ options, selected, onSelect }: any) =>
      R.createElement(
        View,
        null,
        options.map((opt: any) =>
          R.createElement(
            Pressable,
            { key: opt.value, onPress: () => onSelect(opt.value) },
            R.createElement(Text, null, opt.label, selected === opt.value ? " (selected)" : "")
          )
        )
      )
  }
})

import { ApiSettingsScreen } from "../ApiSettingsScreen"

const mockNavigation = { navigate: jest.fn(), setOptions: jest.fn(), goBack: jest.fn(), setParams: jest.fn() }

describe("ApiSettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSettings = { ...DEFAULT_SETTINGS }
  })

  function renderScreen(settingsOverride?: Partial<Settings>) {
    if (settingsOverride) {
      mockSettings = { ...DEFAULT_SETTINGS, ...settingsOverride }
    }
    return render(<ApiSettingsScreen navigation={mockNavigation as any} route={{ params: {} } as any} />)
  }

  /** The picker screen hands its choice back through the route, which is the only way in now. */
  function renderWithTemplate(template: string, settingsOverride?: Partial<Settings>) {
    if (settingsOverride) {
      mockSettings = { ...DEFAULT_SETTINGS, ...settingsOverride }
    }
    return render(<ApiSettingsScreen navigation={mockNavigation as any} route={{ params: { template } } as any} />)
  }

  describe("template switching", () => {
    it("names the current template on a row instead of listing eight chips", () => {
      const { getByTestId, getByText } = renderWithTemplate("dawarich")

      expect(getByTestId("nav-backend-template")).toBeTruthy()
      expect(getByText("Dawarich")).toBeTruthy()
      expect(getByText(API_TEMPLATES.dawarich.description)).toBeTruthy()
    })

    it("opens the picker rather than switching in place", () => {
      const { getByTestId } = renderScreen()

      fireEvent.press(getByTestId("nav-backend-template"))

      expect(mockNavigation.navigate).toHaveBeenCalledWith("Backend Template", { selected: "custom" })
    })

    it("selecting Dawarich template applies its field map", () => {
      const { getByDisplayValue } = renderWithTemplate("dawarich")

      // Dawarich uses "cog" for bearing
      expect(getByDisplayValue("cog")).toBeTruthy()
      // Standard fields remain the same
      expect(getByDisplayValue("lat")).toBeTruthy()
      expect(getByDisplayValue("lon")).toBeTruthy()
    })

    it("selecting OwnTracks template applies its custom fields", () => {
      const { getByDisplayValue } = renderWithTemplate("owntracks")

      // OwnTracks has _type and tid custom fields
      expect(getByDisplayValue("_type")).toBeTruthy()
      expect(getByDisplayValue("location")).toBeTruthy()
      expect(getByDisplayValue("tid")).toBeTruthy()
      expect(getByDisplayValue("AA")).toBeTruthy()
    })

    it("selecting PhoneTrack template applies its unique field names", () => {
      const { getByDisplayValue } = renderWithTemplate("phonetrack")

      // PhoneTrack uses different field names
      expect(getByDisplayValue("speed")).toBeTruthy() // vel -> speed
      expect(getByDisplayValue("bat")).toBeTruthy() // batt -> bat
      expect(getByDisplayValue("timestamp")).toBeTruthy() // tst -> timestamp
      expect(getByDisplayValue("bearing")).toBeTruthy() // bear -> bearing
    })

    it("switching template triggers immediate save", () => {
      renderWithTemplate("traccar")

      expect(mockImmediateSaveAndRestart).toHaveBeenCalled()
    })

    it("switching back to Custom preserves current field map", () => {
      const { getByDisplayValue, rerender } = renderWithTemplate("phonetrack")
      expect(getByDisplayValue("speed")).toBeTruthy()

      // Switch to Custom - field map stays as PhoneTrack's
      rerender(
        <ApiSettingsScreen navigation={mockNavigation as any} route={{ params: { template: "custom" } } as any} />
      )
      expect(getByDisplayValue("speed")).toBeTruthy()
    })

    it("editing a field auto-switches template to Custom", () => {
      const { getByText, getByDisplayValue, queryByText } = renderScreen({
        apiTemplate: "dawarich",
        fieldMap: API_TEMPLATES.dawarich.fieldMap,
        customFields: API_TEMPLATES.dawarich.customFields
      })

      // Verify we start on Dawarich (description visible)
      expect(getByText(API_TEMPLATES.dawarich.description)).toBeTruthy()

      // Edit the "cog" field (bear) to something else
      const cogInput = getByDisplayValue("cog")
      fireEvent.changeText(cogInput, "heading")

      // Template description should disappear (switched to Custom)
      expect(queryByText(API_TEMPLATES.dawarich.description)).toBeNull()
    })
  })

  describe("HTTP method switching", () => {
    it("renders POST and GET options inline", () => {
      const { getAllByText, getByText } = renderScreen()

      // ChipGroup renders both options inline (no picker to open)
      expect(getAllByText(/POST/).length).toBeGreaterThan(0)
      expect(getByText(/GET/)).toBeTruthy()
    })

    it("states what each method does without one being picked, which the chips could not", () => {
      const { getByText } = renderScreen()

      expect(getByText("Sends the fields as a JSON body")).toBeTruthy()
      expect(getByText("Sends the fields as URL query parameters")).toBeTruthy()
    })

    it("switching method triggers immediate save", () => {
      const { getByText } = renderScreen()

      fireEvent.press(getByText(/^GET$/))

      expect(mockImmediateSaveAndRestart).toHaveBeenCalled()
    })

    it("example payload changes format for GET method", () => {
      const { getByText } = renderScreen()

      fireEvent.press(getByText(/^GET$/))

      expect(getByText("EXAMPLE REQUEST")).toBeTruthy()
    })
  })

  describe("field reset", () => {
    it("shows Modified badge when a field differs from template default", () => {
      const { getByText, getByDisplayValue } = renderScreen()

      // Change the lat field
      const latInput = getByDisplayValue("lat")
      fireEvent.changeText(latInput, "latitude")

      expect(getByText("Modified")).toBeTruthy()
    })

    it("offers Reset all as a button once a field is modified", () => {
      // The heading's action was a bare Pressable, so a screen reader announced the words with
      // no role and nothing said it was pressable.
      const { getByRole, getByDisplayValue } = renderScreen()

      const latInput = getByDisplayValue("lat")
      fireEvent.changeText(latInput, "latitude")

      expect(getByRole("button", { name: "Reset all" })).toBeTruthy()
    })
  })

  describe("duplicate field warning", () => {
    it("shows warning when duplicate field names exist", () => {
      const { getByDisplayValue, getByText } = renderScreen()

      // Change lat field to "lon" (same as the lon field)
      const latInput = getByDisplayValue("lat")
      fireEvent.changeText(latInput, "lon")

      expect(getByText(/Duplicate field names:/)).toBeTruthy()
    })

    it("does not show warning when all field names are unique", () => {
      const { queryByText } = renderScreen()

      expect(queryByText(/Duplicate field names:/)).toBeNull()
    })
  })

  describe("copy payload", () => {
    it("offers the payload copy as a button, in sentence case", () => {
      // A bare Pressable with no role: TalkBack announced the word and nothing else. COPY was
      // also the last caps label left after the sentence-case sweep.
      const { getByRole } = renderScreen()

      expect(getByRole("button", { name: "Copy" })).toBeTruthy()
    })
  })

  describe("dawarich mode", () => {
    it("says on the row itself why batch cannot be picked, rather than in a line under the group", () => {
      const { getByText } = renderWithTemplate("dawarich", { syncInterval: 0 })

      expect(getByText("Needs a sync interval above Instant")).toBeTruthy()
    })

    it("names the other blocker when the method is the thing in the way", () => {
      const { getByText, getByTestId } = renderWithTemplate("dawarich", { syncInterval: 300 })

      fireEvent.press(getByTestId("http-method-get"))

      expect(getByText("Needs the POST method, not GET")).toBeTruthy()
    })

    it("marks the blocked option disabled instead of only dimming it", () => {
      const { getByTestId } = renderWithTemplate("dawarich", { syncInterval: 0 })

      expect(getByTestId("dawarich-mode-batch").props.accessibilityState.disabled).toBe(true)
    })
  })
})
