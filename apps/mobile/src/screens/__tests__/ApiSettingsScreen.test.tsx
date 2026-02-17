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

// Mock barrel exports to avoid native module imports
jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text } = require("react-native")
  return {
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    FloatingSaveIndicator: () => null,
    Container: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null)
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
    return render(<ApiSettingsScreen navigation={{} as any} route={{} as any} />)
  }

  describe("template switching", () => {
    it("renders all template options", () => {
      const { getByText } = renderScreen()

      expect(getByText("Custom")).toBeTruthy()
      expect(getByText("Dawarich")).toBeTruthy()
      expect(getByText("OwnTracks")).toBeTruthy()
      expect(getByText("PhoneTrack")).toBeTruthy()
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

      fireEvent.press(getByText("PhoneTrack"))

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
      fireEvent.press(getByText("PhoneTrack"))
      expect(getByDisplayValue("speed")).toBeTruthy()

      // Switch to Custom — field map stays as PhoneTrack's
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
    it("renders POST and GET options", () => {
      const { getByText } = renderScreen()

      expect(getByText("POST")).toBeTruthy()
      expect(getByText("GET")).toBeTruthy()
    })

    it("switching to GET shows query parameter hint", () => {
      const { getByText } = renderScreen()

      fireEvent.press(getByText("GET"))

      expect(getByText("Fields sent as URL query parameters instead of JSON body")).toBeTruthy()
    })

    it("switching method triggers immediate save", () => {
      const { getByText } = renderScreen()

      fireEvent.press(getByText("GET"))

      expect(mockImmediateSaveAndRestart).toHaveBeenCalled()
    })

    it("example payload changes format for GET method", () => {
      const { getByText } = renderScreen()

      fireEvent.press(getByText("GET"))

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

    it("shows RESET ALL button when any field is modified", () => {
      const { getByText, getByDisplayValue } = renderScreen()

      const latInput = getByDisplayValue("lat")
      fireEvent.changeText(latInput, "latitude")

      expect(getByText("RESET ALL")).toBeTruthy()
    })
  })
})
