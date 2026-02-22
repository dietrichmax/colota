import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { DEFAULT_SETTINGS, TRACKING_PRESETS, Settings } from "../../../../types/global"

// Mock barrel export (avoids transitive native module imports)
jest.mock("../../../index", () => {
  const R = require("react")
  const { View, Text, TextInput } = require("react-native")
  return {
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, null),
    NumericInput: ({ label, value, onChange, onBlur, unit, hint, placeholder: ph }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        hint && R.createElement(Text, null, hint),
        R.createElement(TextInput, {
          value,
          onChangeText: onChange,
          onBlur,
          placeholder: ph,
          keyboardType: "numeric"
        }),
        R.createElement(Text, null, unit)
      )
  }
})

jest.mock("../PresetOption", () => ({
  PresetOption: ({ preset, isSelected, onSelect }: any) => {
    const R = require("react")
    const { Pressable, Text } = require("react-native")
    return R.createElement(
      Pressable,
      { testID: `preset-${preset}`, onPress: () => onSelect(preset) },
      R.createElement(Text, null, preset, isSelected ? " (selected)" : "")
    )
  }
}))

const mockColors = {
  primary: "#0d9488",
  primaryDark: "#115E59",
  border: "#e5e7eb",
  text: "#000",
  textSecondary: "#6b7280",
  textLight: "#9ca3af",
  background: "#fff",
  info: "#3b82f6",
  card: "#fff",
  backgroundElevated: "#f9fafb",
  placeholder: "#9ca3af",
  textOnPrimary: "#fff"
} as any

import { SyncStrategySettings } from "../SyncStrategySettings"

describe("SyncStrategySettings", () => {
  let mockOnSettingsChange: jest.Mock
  let mockOnDebouncedSave: jest.Mock
  let mockOnImmediateSave: jest.Mock
  let baseSettings: Settings

  beforeEach(() => {
    mockOnSettingsChange = jest.fn()
    mockOnDebouncedSave = jest.fn()
    mockOnImmediateSave = jest.fn()
    baseSettings = { ...DEFAULT_SETTINGS }
  })

  function renderComponent(settingsOverride?: Partial<Settings>) {
    const settings = { ...baseSettings, ...settingsOverride }
    return render(
      <SyncStrategySettings
        settings={settings}
        onSettingsChange={mockOnSettingsChange}
        onDebouncedSave={mockOnDebouncedSave}
        onImmediateSave={mockOnImmediateSave}
        colors={mockColors}
      />
    )
  }

  describe("presets", () => {
    it("renders all three presets", () => {
      const { getByTestId } = renderComponent()

      expect(getByTestId("preset-instant")).toBeTruthy()
      expect(getByTestId("preset-balanced")).toBeTruthy()
      expect(getByTestId("preset-powersaver")).toBeTruthy()
    })

    it("selecting a preset applies its config via onImmediateSave", () => {
      const { getByTestId } = renderComponent()

      fireEvent.press(getByTestId("preset-balanced"))

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          syncPreset: "balanced",
          interval: TRACKING_PRESETS.balanced.interval,
          distance: TRACKING_PRESETS.balanced.distance,
          syncInterval: TRACKING_PRESETS.balanced.syncInterval
        })
      )
      expect(mockOnImmediateSave).toHaveBeenCalledWith(
        expect.objectContaining({
          syncPreset: "balanced",
          interval: TRACKING_PRESETS.balanced.interval,
          distance: TRACKING_PRESETS.balanced.distance,
          syncInterval: TRACKING_PRESETS.balanced.syncInterval
        })
      )
    })
  })

  describe("advanced toggle", () => {
    it("shows advanced settings when toggle is pressed", () => {
      const { getByText, queryByText } = renderComponent()

      expect(queryByText("Tracking Parameters")).toBeNull()

      fireEvent.press(getByText("+ Show Advanced Settings"))

      expect(getByText("Tracking Parameters")).toBeTruthy()
      expect(getByText("Network Settings")).toBeTruthy()
    })

    it("hides advanced settings when toggle is pressed again", () => {
      const { getByText, queryByText } = renderComponent()

      fireEvent.press(getByText("+ Show Advanced Settings"))
      expect(getByText("Tracking Parameters")).toBeTruthy()

      fireEvent.press(getByText("− Hide Advanced Settings"))
      expect(queryByText("Tracking Parameters")).toBeNull()
    })
  })

  describe("custom banner", () => {
    it("shows custom configuration banner when preset is custom", () => {
      const { getByText } = renderComponent({ syncPreset: "custom" })

      fireEvent.press(getByText("+ Show Advanced Settings"))

      expect(getByText("Using custom configuration")).toBeTruthy()
    })

    it("does not show custom banner when a named preset is selected", () => {
      const { getByText, queryByText } = renderComponent({ syncPreset: "instant" })

      fireEvent.press(getByText("+ Show Advanced Settings"))

      expect(queryByText("Using custom configuration")).toBeNull()
    })
  })

  describe("sync interval grid", () => {
    it("renders all sync interval options", () => {
      const { getByText } = renderComponent()

      fireEvent.press(getByText("+ Show Advanced Settings"))

      expect(getByText("Instant")).toBeTruthy()
      expect(getByText("1 min")).toBeTruthy()
      expect(getByText("5 min")).toBeTruthy()
      expect(getByText("15 min")).toBeTruthy()
    })

    it("selecting a sync interval sets preset to custom", () => {
      const { getByText } = renderComponent()

      fireEvent.press(getByText("+ Show Advanced Settings"))
      fireEvent.press(getByText("5 min"))

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          syncInterval: 300,
          syncPreset: "custom"
        })
      )
      expect(mockOnDebouncedSave).toHaveBeenCalledWith(
        expect.objectContaining({
          syncInterval: 300,
          syncPreset: "custom"
        })
      )
    })
  })

  describe("retry failed uploads toggle", () => {
    it("shows delete hint when maxRetries is 5 (default)", () => {
      const { getByText } = renderComponent({ maxRetries: 5 })

      fireEvent.press(getByText("+ Show Advanced Settings"))

      expect(getByText("Failed uploads are permanently deleted after 5 failed send attempts")).toBeTruthy()
    })

    it("shows keep hint when maxRetries is 0 (retry forever)", () => {
      const { getByText } = renderComponent({ maxRetries: 0 })

      fireEvent.press(getByText("+ Show Advanced Settings"))

      expect(getByText("Failed uploads stay in the queue until they succeed")).toBeTruthy()
    })

    it("toggling retry on sets maxRetries to 0", () => {
      const { getByText, getAllByRole } = renderComponent({ maxRetries: 5 })

      fireEvent.press(getByText("+ Show Advanced Settings"))

      const retrySwitch = getAllByRole("switch")[0]

      fireEvent(retrySwitch, "valueChange", true)

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          maxRetries: 0,
          syncPreset: "custom"
        })
      )
      expect(mockOnImmediateSave).toHaveBeenCalled()
    })

    it("toggling retry off sets maxRetries to 5", () => {
      const { getByText, getAllByRole } = renderComponent({ maxRetries: 0 })

      fireEvent.press(getByText("+ Show Advanced Settings"))

      const retrySwitch = getAllByRole("switch")[0]

      fireEvent(retrySwitch, "valueChange", false)

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          maxRetries: 5,
          syncPreset: "custom"
        })
      )
    })
  })

  describe("filter inaccurate locations", () => {
    it("shows accuracy threshold input when filter is enabled", () => {
      const { getByText } = renderComponent({ filterInaccurateLocations: true })

      fireEvent.press(getByText("+ Show Advanced Settings"))

      expect(getByText("Accuracy Threshold")).toBeTruthy()
    })

    it("hides accuracy threshold input when filter is disabled", () => {
      const { getByText, queryByText } = renderComponent({ filterInaccurateLocations: false })

      fireEvent.press(getByText("+ Show Advanced Settings"))

      expect(queryByText("Accuracy Threshold")).toBeNull()
    })
  })

  describe("numeric input blur behavior", () => {
    it("clamps interval to min 1 on blur when value is 0", () => {
      const { getByText, getByDisplayValue } = renderComponent({
        interval: 5,
        syncPreset: "custom"
      })

      fireEvent.press(getByText("+ Show Advanced Settings"))

      const intervalInput = getByDisplayValue("5")
      fireEvent.changeText(intervalInput, "0")
      fireEvent(intervalInput, "blur")

      // Should clamp to 1 and call onSettingsChange + onImmediateSave
      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
    })

    it("clamps interval to min 1 on blur when value is negative", () => {
      const { getByText, getByDisplayValue } = renderComponent({
        interval: 5,
        syncPreset: "custom"
      })

      fireEvent.press(getByText("+ Show Advanced Settings"))

      const intervalInput = getByDisplayValue("5")
      fireEvent.changeText(intervalInput, "-3")
      fireEvent(intervalInput, "blur")

      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
    })

    it("clamps interval to min 1 on blur when value is NaN", () => {
      const { getByText, getByDisplayValue } = renderComponent({
        interval: 5,
        syncPreset: "custom"
      })

      fireEvent.press(getByText("+ Show Advanced Settings"))

      const intervalInput = getByDisplayValue("5")
      fireEvent.changeText(intervalInput, "abc")
      fireEvent(intervalInput, "blur")

      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
    })

    it("does not clamp interval on blur when value is valid", () => {
      const { getByText, getByDisplayValue } = renderComponent({
        interval: 5,
        syncPreset: "custom"
      })

      fireEvent.press(getByText("+ Show Advanced Settings"))

      const intervalInput = getByDisplayValue("5")
      fireEvent.changeText(intervalInput, "10")
      fireEvent(intervalInput, "blur")

      // Valid value — onSettingsChange should only have been called from changeText (debounced save),
      // not from blur (no clamping needed)
      expect(mockOnImmediateSave).not.toHaveBeenCalled()
    })

    it("clamps distance to min 0 on blur when value is negative", () => {
      const { getByText, getByDisplayValue } = renderComponent({
        interval: 5,
        distance: 10,
        syncPreset: "custom"
      })

      fireEvent.press(getByText("+ Show Advanced Settings"))

      const distanceInput = getByDisplayValue("10")
      fireEvent.changeText(distanceInput, "-5")
      fireEvent(distanceInput, "blur")

      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ distance: 0 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ distance: 0 }))
    })

    it("clamps distance to min 0 on blur when value is NaN", () => {
      const { getByText, getByDisplayValue } = renderComponent({
        interval: 5,
        distance: 10,
        syncPreset: "custom"
      })

      fireEvent.press(getByText("+ Show Advanced Settings"))

      const distanceInput = getByDisplayValue("10")
      fireEvent.changeText(distanceInput, "abc")
      fireEvent(distanceInput, "blur")

      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ distance: 0 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ distance: 0 }))
    })

    it("clamps accuracy threshold to min 1 on blur when value is below", () => {
      const { getByText, getByDisplayValue } = renderComponent({
        interval: 5,
        filterInaccurateLocations: true,
        accuracyThreshold: 100,
        syncPreset: "custom"
      })

      fireEvent.press(getByText("+ Show Advanced Settings"))

      const thresholdInput = getByDisplayValue("100")
      fireEvent.changeText(thresholdInput, "0")
      fireEvent(thresholdInput, "blur")

      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ accuracyThreshold: 1 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ accuracyThreshold: 1 }))
    })

    it("does not clamp accuracy threshold on blur when value is valid", () => {
      const { getByText, getByDisplayValue } = renderComponent({
        interval: 5,
        filterInaccurateLocations: true,
        accuracyThreshold: 100,
        syncPreset: "custom"
      })

      fireEvent.press(getByText("+ Show Advanced Settings"))

      const thresholdInput = getByDisplayValue("100")
      fireEvent.changeText(thresholdInput, "200")
      fireEvent(thresholdInput, "blur")

      expect(mockOnImmediateSave).not.toHaveBeenCalled()
    })
  })
})
