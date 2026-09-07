import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { DEFAULT_SETTINGS, TRACKING_PRESETS, Settings } from "../../../../types/global"

// Mock barrel export (avoids transitive native module imports)
jest.mock("../../../index", () => {
  const R = require("react")
  const { View, Text, TextInput } = require("react-native")
  return {
    ListItem: require("../../../../testing/componentStubs").ListItemStub,
    TextField: require("../../../../testing/componentStubs").TextFieldStub,
    ChipGroup: function (props: any) {
      const RN = require("react-native")
      return R.createElement(
        RN.View,
        null,
        props.options.map(function (o: any) {
          return R.createElement(
            RN.Pressable,
            { key: o.value, testID: o.testID, onPress: () => props.onSelect(o.value) },
            R.createElement(RN.Text, null, o.label)
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
      return require("react").createElement(require("react-native").Switch, {
        testID: props.testID,
        value: props.value,
        onValueChange: props.onValueChange,
        disabled: props.disabled,
        accessibilityLabel: props.accessibilityLabel
      })
    },
    RadioRow: ({ testID, label, sub, selected, onPress }: any) =>
      R.createElement(
        require("react-native").Pressable,
        { testID, onPress, accessibilityRole: "radio", accessibilityState: { checked: selected } },
        R.createElement(Text, null, label, selected ? " (selected)" : ""),
        sub ? R.createElement(Text, null, sub) : null
      ),
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
      ),
    SettingRow: ({ label, hint, children }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        hint && R.createElement(Text, null, hint),
        children
      )
  }
})

jest.mock("../../../../utils/geo", () => ({
  shortDistanceUnit: () => "m",
  inputToMeters: (value: number) => value,
  metersToInput: (meters: number) => meters
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
    it("renders all three presets inline", () => {
      const { getByTestId } = renderComponent()

      // Presets are rendered inline (no picker to open)
      expect(getByTestId("preset-instant")).toBeTruthy()
      expect(getByTestId("preset-balanced")).toBeTruthy()
      expect(getByTestId("preset-powersaver")).toBeTruthy()
    })

    it("selecting a preset applies its config via onImmediateSave", () => {
      const { getByTestId } = renderComponent()

      // Select balanced directly (inline)
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

    it("selecting a preset in offline mode skips sync fields", () => {
      const { getByTestId } = renderComponent({ isOfflineMode: true })

      fireEvent.press(getByTestId("preset-balanced"))

      const savedSettings = mockOnImmediateSave.mock.calls[0][0]
      expect(savedSettings.syncPreset).toBe("balanced")
      expect(savedSettings.interval).toBe(TRACKING_PRESETS.balanced.interval)
      expect(savedSettings.distance).toBe(TRACKING_PRESETS.balanced.distance)
      // syncInterval and retryInterval should NOT be overwritten in offline mode
      expect(savedSettings.syncInterval).toBe(DEFAULT_SETTINGS.syncInterval)
      expect(savedSettings.retryInterval).toBe(DEFAULT_SETTINGS.retryInterval)
    })
  })

  describe("the settings that apply to every preset", () => {
    it("shows the network and quality groups without a disclosure", () => {
      const { getByText } = renderComponent()

      expect(getByText("Network settings")).toBeTruthy()
      expect(getByText("Quality filters")).toBeTruthy()
    })
  })

  describe("custom", () => {
    it("is a row in the same list, so the state is where the choice is", () => {
      const { getByTestId } = renderComponent({ syncPreset: "custom" })

      expect(getByTestId("preset-custom").props.accessibilityState).toMatchObject({ checked: true })
    })

    it("opens the parameters it owns, and a named preset does not", () => {
      const custom = renderComponent({ syncPreset: "custom" })
      expect(custom.getByText("Tracking interval")).toBeTruthy()

      const named = renderComponent({ syncPreset: "balanced" })
      expect(named.queryByText("Tracking interval")).toBeNull()
    })

    it("says what it holds, which is what the banner used to say", () => {
      const { getByText } = renderComponent({ syncPreset: "custom", interval: 45, syncInterval: 600 })

      expect(getByText("Track every 45s • Batch 10 min")).toBeTruthy()
    })
  })

  describe("preset captions", () => {
    it("carries the battery cost and the recommendation as words, not as filled badges", () => {
      const { getByText } = renderComponent()

      expect(getByText("Track every 5s • Send instantly • high battery")).toBeTruthy()
      expect(getByText("Track every 30s • Batch 5 min • recommended")).toBeTruthy()
    })
  })

  describe("sync interval chips", () => {
    it("renders all sync interval options inline", () => {
      const { getByText, getAllByText } = renderComponent()

      expect(getAllByText("Instant").length).toBeGreaterThan(0)
      expect(getByText("1 min")).toBeTruthy()
      expect(getByText("5 min")).toBeTruthy()
      expect(getByText("15 min")).toBeTruthy()
      // "Custom" labels both the preset row and this chip.
      expect(getAllByText("Custom").length).toBeGreaterThan(0)
    })

    it("selecting a sync interval sets preset to custom", () => {
      const { getByText } = renderComponent()

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

  describe("filter inaccurate locations", () => {
    it("shows accuracy threshold input when filter is enabled", () => {
      const { getByText } = renderComponent({ filterInaccurateLocations: true })

      expect(getByText("Accuracy threshold")).toBeTruthy()
    })

    it("hides accuracy threshold input when filter is disabled", () => {
      const { queryByText } = renderComponent({ filterInaccurateLocations: false })

      expect(queryByText("Accuracy threshold")).toBeNull()
    })
  })

  describe("numeric input blur behavior", () => {
    it("clamps interval to min 1 on blur when value is 0", () => {
      const { getByDisplayValue } = renderComponent({
        interval: 5,
        syncPreset: "custom"
      })

      const intervalInput = getByDisplayValue("5")
      fireEvent.changeText(intervalInput, "0")
      fireEvent(intervalInput, "blur")

      // Should clamp to 1 and call onSettingsChange + onImmediateSave
      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
    })

    it("clamps interval to min 1 on blur when value is negative", () => {
      const { getByDisplayValue } = renderComponent({
        interval: 5,
        syncPreset: "custom"
      })

      const intervalInput = getByDisplayValue("5")
      fireEvent.changeText(intervalInput, "-3")
      fireEvent(intervalInput, "blur")

      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
    })

    it("clamps interval to min 1 on blur when value is NaN", () => {
      const { getByDisplayValue } = renderComponent({
        interval: 5,
        syncPreset: "custom"
      })

      const intervalInput = getByDisplayValue("5")
      fireEvent.changeText(intervalInput, "abc")
      fireEvent(intervalInput, "blur")

      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
    })

    it("does not clamp interval on blur when value is valid", () => {
      const { getByDisplayValue } = renderComponent({
        interval: 5,
        syncPreset: "custom"
      })

      const intervalInput = getByDisplayValue("5")
      fireEvent.changeText(intervalInput, "10")
      fireEvent(intervalInput, "blur")

      // Valid value - onSettingsChange should only have been called from changeText (debounced save),
      // not from blur (no clamping needed)
      expect(mockOnImmediateSave).not.toHaveBeenCalled()
    })

    it("clamps distance to min 0 on blur when value is negative", () => {
      const { getByDisplayValue } = renderComponent({
        interval: 5,
        distance: 10,
        syncPreset: "custom"
      })

      const distanceInput = getByDisplayValue("10")
      fireEvent.changeText(distanceInput, "-5")
      fireEvent(distanceInput, "blur")

      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ distance: 0 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ distance: 0 }))
    })

    it("clamps distance to min 0 on blur when value is NaN", () => {
      const { getByDisplayValue } = renderComponent({
        interval: 5,
        distance: 10,
        syncPreset: "custom"
      })

      const distanceInput = getByDisplayValue("10")
      fireEvent.changeText(distanceInput, "abc")
      fireEvent(distanceInput, "blur")

      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ distance: 0 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ distance: 0 }))
    })

    it("clamps accuracy threshold to min 1 on blur when value is below", () => {
      const { getByDisplayValue } = renderComponent({
        interval: 5,
        filterInaccurateLocations: true,
        accuracyThreshold: 100,
        syncPreset: "custom"
      })

      const thresholdInput = getByDisplayValue("100")
      fireEvent.changeText(thresholdInput, "0")
      fireEvent(thresholdInput, "blur")

      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ accuracyThreshold: 1 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ accuracyThreshold: 1 }))
    })

    it("does not clamp accuracy threshold on blur when value is valid", () => {
      const { getByDisplayValue } = renderComponent({
        interval: 5,
        filterInaccurateLocations: true,
        accuracyThreshold: 100,
        syncPreset: "custom"
      })

      const thresholdInput = getByDisplayValue("100")
      fireEvent.changeText(thresholdInput, "200")
      fireEvent(thresholdInput, "blur")

      expect(mockOnImmediateSave).not.toHaveBeenCalled()
    })
  })

  describe("sync condition", () => {
    it("states what every option does without one being chosen, which the chips could not", () => {
      const { getByText } = renderComponent({ syncCondition: "any" })

      expect(getByText("Uploads over mobile data as well as Wi-Fi")).toBeTruthy()
      expect(getByText("Uploads only while connected to any Wi-Fi")).toBeTruthy()
      expect(getByText("Uploads only on one network you choose")).toBeTruthy()
      expect(getByText("Uploads only while a VPN is active")).toBeTruthy()
    })

    it("saves the choice and drops the preset to custom, because a preset does not carry it", () => {
      const { getByTestId } = renderComponent({ syncCondition: "any", syncPreset: "balanced" })

      fireEvent.press(getByTestId("sync-condition-vpn"))

      expect(mockOnImmediateSave).toHaveBeenCalledWith(
        expect.objectContaining({ syncCondition: "vpn", syncPreset: "custom" })
      )
    })

    it("puts the SSID field under its own row, not at the end of the group below VPN", () => {
      const { toJSON } = renderComponent({ syncCondition: "wifi_ssid" })

      const ids: string[] = []
      const walk = (node: any) => {
        if (!node || typeof node !== "object") return
        if (Array.isArray(node)) return node.forEach(walk)
        if (node.props?.testID) ids.push(node.props.testID)
        ;(node.children ?? []).forEach(walk)
      }
      walk(toJSON())

      expect(ids.indexOf("sync-ssid-input")).toBeGreaterThan(ids.indexOf("sync-condition-wifi_ssid"))
      expect(ids.indexOf("sync-ssid-input")).toBeLessThan(ids.indexOf("sync-condition-vpn"))
    })

    it("reveals the SSID field only for the one option that needs a network name", () => {
      const { queryByTestId } = renderComponent({ syncCondition: "wifi_any" })
      expect(queryByTestId("sync-ssid-input")).toBeNull()

      const named = renderComponent({ syncCondition: "wifi_ssid" })
      expect(named.queryByTestId("sync-ssid-input")).toBeTruthy()
    })
  })
})
