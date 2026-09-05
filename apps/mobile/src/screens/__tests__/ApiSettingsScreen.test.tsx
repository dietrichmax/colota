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
    colors: require("@colota/shared").lightColors
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
  const { View, Text, Pressable, TextInput } = require("react-native")
  return {
    SectionTitle: ({ children, action }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, children),
        action
          ? R.createElement(
              Pressable,
              { testID: action.testID, onPress: action.onPress },
              R.createElement(Text, null, action.label)
            )
          : null
      ),
    Toast: () => null,
    Container: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    Notice: ({ testID, title, message }: any) =>
      R.createElement(
        View,
        { testID },
        R.createElement(Text, null, title),
        message ? R.createElement(Text, null, message) : null
      ),
    Button: ({ title, onPress, testID }: any) =>
      R.createElement(Pressable, { testID, onPress }, R.createElement(Text, null, title)),
    TextField: ({ testID, label, hint, error, value, onChangeText, placeholder, trailing }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        hint ? R.createElement(Text, null, hint) : null,
        error ? R.createElement(Text, null, error) : null,
        R.createElement(TextInput, { testID, value, onChangeText, placeholder }),
        trailing
          ? R.createElement(Pressable, {
              testID: trailing.testID,
              accessibilityRole: "button",
              accessibilityLabel: trailing.accessibilityLabel,
              onPress: trailing.onPress
            })
          : null
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

describe("ApiSettingsScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSettings = { ...DEFAULT_SETTINGS }
  })

  function renderScreen(settingsOverride?: Partial<Settings>) {
    if (settingsOverride) {
      mockSettings = { ...DEFAULT_SETTINGS, ...settingsOverride }
    }
    return render(<ApiSettingsScreen navigation={{} as any} />)
  }

  describe("template switching", () => {
    it("renders all template options", () => {
      const { getByText, getAllByText } = renderScreen()

      expect(getAllByText(/Custom/).length).toBeGreaterThan(0)
      expect(getByText("Dawarich")).toBeTruthy()
      expect(getByText("OwnTracks")).toBeTruthy()
      expect(getByText(/PhoneTrack/)).toBeTruthy()
      expect(getByText("Reitti")).toBeTruthy()
      expect(getByText("Traccar")).toBeTruthy()
    })

    it("selecting Dawarich template applies its field map", () => {
      const { getByText, getByDisplayValue } = renderScreen()

      fireEvent.press(getByText("Dawarich"))

      // Dawarich uses "cog" for bearing
      expect(getByDisplayValue("cog")).toBeTruthy()
      // Standard fields remain the same
      expect(getByDisplayValue("lat")).toBeTruthy()
      expect(getByDisplayValue("lon")).toBeTruthy()
    })

    it("selecting OwnTracks template applies its custom fields", () => {
      const { getByText, getByDisplayValue } = renderScreen()

      fireEvent.press(getByText("OwnTracks"))

      // OwnTracks has _type and tid custom fields
      expect(getByDisplayValue("_type")).toBeTruthy()
      expect(getByDisplayValue("location")).toBeTruthy()
      expect(getByDisplayValue("tid")).toBeTruthy()
      expect(getByDisplayValue("AA")).toBeTruthy()
    })

    it("selecting PhoneTrack template applies its unique field names", () => {
      const { getByText, getByDisplayValue } = renderScreen()

      fireEvent.press(getByText(/PhoneTrack/))

      // PhoneTrack uses different field names
      expect(getByDisplayValue("speed")).toBeTruthy() // vel -> speed
      expect(getByDisplayValue("bat")).toBeTruthy() // batt -> bat
      expect(getByDisplayValue("timestamp")).toBeTruthy() // tst -> timestamp
      expect(getByDisplayValue("bearing")).toBeTruthy() // bear -> bearing
    })

    it("switching template triggers immediate save", () => {
      const { getByText } = renderScreen()

      fireEvent.press(getByText("Traccar"))

      expect(mockImmediateSaveAndRestart).toHaveBeenCalled()
    })

    it("switching back to Custom preserves current field map", () => {
      const { getByText, getByDisplayValue } = renderScreen()

      // First switch to PhoneTrack
      fireEvent.press(getByText(/PhoneTrack/))
      expect(getByDisplayValue("speed")).toBeTruthy()

      // Switch to Custom - field map stays as PhoneTrack's
      fireEvent.press(getByText("Custom"))
      expect(getByDisplayValue("speed")).toBeTruthy()
    })

    it("shows template description for non-custom templates", () => {
      const { getByText } = renderScreen()

      fireEvent.press(getByText("Dawarich"))

      expect(getByText(API_TEMPLATES.dawarich.description)).toBeTruthy()
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

    it("switching to GET shows query parameter hint", () => {
      const { getByText } = renderScreen()

      fireEvent.press(getByText(/^GET$/))

      expect(getByText("Fields are sent as URL query parameters instead of a JSON body")).toBeTruthy()
    })

    it("switching method triggers immediate save", () => {
      const { getByText } = renderScreen()

      fireEvent.press(getByText(/^GET$/))

      expect(mockImmediateSaveAndRestart).toHaveBeenCalled()
    })

    it("example payload changes format for GET method", () => {
      const { getByText } = renderScreen()

      fireEvent.press(getByText(/^GET$/))

      expect(getByText("Example request")).toBeTruthy()
    })
  })

  describe("field reset", () => {
    // The Modified badge was a tinted box; the per-field reset control is what a user
    // acts on, so its presence is the signal that the field left its template default.
    it("offers a reset control on the field that differs from the template default", () => {
      const { queryByTestId, getByDisplayValue } = renderScreen()

      expect(queryByTestId("reset-lat-btn")).toBeNull()

      fireEvent.changeText(getByDisplayValue("lat"), "latitude")

      expect(queryByTestId("reset-lat-btn")).toBeTruthy()
      expect(queryByTestId("reset-lon-btn")).toBeNull()
    })

    it("puts the reset-all action on the field mappings heading once anything is modified", () => {
      const { queryByTestId, getByDisplayValue, getByText } = renderScreen()

      expect(queryByTestId("reset-all-fields-btn")).toBeNull()

      fireEvent.changeText(getByDisplayValue("lat"), "latitude")

      expect(getByText("Reset all")).toBeTruthy()
    })

    it("restores the template default when a field reset is pressed", () => {
      const { getByTestId, getByDisplayValue } = renderScreen()

      fireEvent.changeText(getByDisplayValue("lat"), "latitude")
      fireEvent.press(getByTestId("reset-lat-btn"))

      expect(getByDisplayValue("lat")).toBeTruthy()
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
    it("renders the copy button", () => {
      const { getByText } = renderScreen()

      expect(getByText("Copy")).toBeTruthy()
    })
  })
})
