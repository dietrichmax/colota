import React from "react"
import { render, fireEvent, act } from "@testing-library/react-native"
import { DEFAULT_SETTINGS, TRACKING_PRESETS, Settings, SavedTrackingProfile } from "../../../../types/global"
import { SAVE_SUCCESS_DISPLAY_MS } from "../../../../constants"

// Mock barrel export (avoids transitive native module imports)
jest.mock("../../../index", () => {
  const R = require("react")
  const { View, Text, TextInput, Pressable } = require("react-native")
  return {
    ListItem: require("../../../../testing/componentStubs").ListItemStub,
    TextField: require("../../../../testing/componentStubs").TextFieldStub,
    Button: function (props: any) {
      return R.createElement(
        Pressable,
        { testID: props.testID, onPress: props.onPress, disabled: props.disabled, accessibilityRole: "button" },
        R.createElement(Text, null, props.title)
      )
    },
    Toggle: function (props: any) {
      return R.createElement(require("react-native").Switch, {
        testID: props.testID,
        value: props.value,
        onValueChange: props.onValueChange,
        disabled: props.disabled,
        accessibilityLabel: props.accessibilityLabel
      })
    },
    RadioRow: ({ testID, label, sub, selected, onPress }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress, accessibilityRole: "radio", accessibilityState: { checked: selected } },
        R.createElement(Text, null, label, selected ? " (selected)" : ""),
        sub ? R.createElement(Text, null, sub) : null
      ),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children, style }: any) => R.createElement(View, { testID: "card", style }, children),
    Divider: () => R.createElement(View, { testID: "divider" }),
    StateLine: ({ label, caption, testID }: any) =>
      R.createElement(View, { testID }, R.createElement(Text, null, label), R.createElement(Text, null, caption)),
    NumericInput: ({ label, value, onChange, onBlur, unit, hint, placeholder: ph, error, message }: any) =>
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
        R.createElement(Text, null, unit),
        error ? R.createElement(Text, null, error) : null,
        message ? R.createElement(Text, null, message) : null
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

jest.mock("../SyncIntervalPicker", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  const { SYNC_INTERVAL_PRESETS } = require("../../../../constants")
  return {
    SyncIntervalPicker: ({ label, hint, value, pullUp, onSelect, onChange }: any) =>
      R.createElement(
        View,
        { testID: "sync-interval-picker", accessibilityValue: { text: pullUp ? "pulled" : "flush" } },
        label ? R.createElement(Text, null, label) : null,
        hint ? R.createElement(Text, null, hint) : null,
        SYNC_INTERVAL_PRESETS.map((seconds: number) =>
          R.createElement(
            Pressable,
            {
              key: seconds,
              testID: `sync-interval-${seconds}`,
              onPress: () => onSelect(seconds),
              accessibilityState: { checked: value === seconds }
            },
            R.createElement(Text, null, String(seconds))
          )
        ),
        R.createElement(Pressable, { testID: "sync-interval-typed", onPress: () => onChange(90) })
      )
  }
})

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

jest.mock("../../../../utils/geo", () => ({
  shortDistanceUnit: () => "m",
  inputToMeters: (value: number) => value,
  metersToInput: (meters: number) => meters
}))

const mockGetCurrentSsid = jest.fn()
jest.mock("../../../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getCurrentSsid: (...args: unknown[]) => mockGetCurrentSsid(...args)
  }
}))

import { SyncStrategySettings } from "../SyncStrategySettings"

const charging: SavedTrackingProfile = {
  id: 7,
  name: "Charging",
  interval: 5,
  distance: 20,
  syncInterval: 900,
  priority: 1,
  condition: { type: "charging" } as any,
  activationDelay: 0,
  deactivationDelay: 0
} as SavedTrackingProfile

describe("SyncStrategySettings", () => {
  let mockOnSettingsChange: jest.Mock
  let mockOnDebouncedSave: jest.Mock
  let mockOnImmediateSave: jest.Mock
  let baseSettings: Settings

  beforeEach(() => {
    jest.useFakeTimers()
    mockOnSettingsChange = jest.fn()
    mockOnDebouncedSave = jest.fn()
    mockOnImmediateSave = jest.fn()
    mockGetCurrentSsid.mockResolvedValue("")
    baseSettings = { ...DEFAULT_SETTINGS }
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  function renderComponent(settingsOverride?: Partial<Settings>, activeProfile: SavedTrackingProfile | null = null) {
    const settings = { ...baseSettings, ...settingsOverride }
    return render(
      <SyncStrategySettings
        settings={settings}
        onSettingsChange={mockOnSettingsChange}
        onDebouncedSave={mockOnDebouncedSave}
        onImmediateSave={mockOnImmediateSave}
        activeProfile={activeProfile}
      />
    )
  }

  describe("groups", () => {
    it("names each group by what it sets, with no heading inside a card", () => {
      const { getByText, queryByText } = renderComponent()

      expect(getByText("Recording")).toBeTruthy()
      expect(getByText("Sync interval")).toBeTruthy()
      expect(getByText("Sync only on")).toBeTruthy()
      expect(getByText("Accuracy filter")).toBeTruthy()
      expect(queryByText("Network settings")).toBeNull()
    })

    it("states the restart consequence once, as static text", () => {
      const { getByText } = renderComponent()

      expect(
        getByText("How often a fix is recorded and when it syncs. Changes apply at once and restart tracking.")
      ).toBeTruthy()
    })

    it("hides both sync groups offline and drops the sync clause from every preset", () => {
      const { queryByText, getByText } = renderComponent({ isOfflineMode: true })

      expect(queryByText("Sync interval")).toBeNull()
      expect(queryByText("Sync only on")).toBeNull()
      expect(getByText("Every 30 s after 2 m · moderate battery, fewer wake-ups")).toBeTruthy()
    })
  })

  describe("presets", () => {
    it("renders all three presets inline", () => {
      const { getByTestId } = renderComponent()

      expect(getByTestId("preset-instant")).toBeTruthy()
      expect(getByTestId("preset-balanced")).toBeTruthy()
      expect(getByTestId("preset-powersaver")).toBeTruthy()
    })

    it("prices every preset on its row as fix rate, sync cadence and cost, so the trade reads before the tap", () => {
      const { getByText } = renderComponent()

      expect(getByText("Every 5 s, any movement · syncs each fix · most battery, finest track")).toBeTruthy()
      expect(getByText("Every 30 s after 2 m · syncs every 5 min · moderate battery, fewer wake-ups")).toBeTruthy()
      expect(getByText("Every 1 min after 2 m · syncs every 15 min · least battery, coarser track")).toBeTruthy()
      expect(getByText("Power saver")).toBeTruthy()
    })

    it("selecting a preset applies its config via onImmediateSave", () => {
      const { getByTestId } = renderComponent()

      fireEvent.press(getByTestId("preset-balanced"))

      const expected = expect.objectContaining({
        syncPreset: "balanced",
        interval: TRACKING_PRESETS.balanced.interval,
        distance: TRACKING_PRESETS.balanced.distance,
        syncInterval: TRACKING_PRESETS.balanced.syncInterval
      })
      expect(mockOnSettingsChange).toHaveBeenCalledWith(expected)
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expected)
    })

    it("selecting a preset in offline mode skips sync fields", () => {
      const { getByTestId } = renderComponent({ isOfflineMode: true })

      fireEvent.press(getByTestId("preset-balanced"))

      const savedSettings = mockOnImmediateSave.mock.calls[0][0]
      expect(savedSettings.syncPreset).toBe("balanced")
      expect(savedSettings.syncInterval).toBe(DEFAULT_SETTINGS.syncInterval)
      expect(savedSettings.retryInterval).toBe(DEFAULT_SETTINGS.retryInterval)
    })
  })

  describe("custom", () => {
    it("is a row in the same list, so the state is where the choice is", () => {
      const { getByTestId } = renderComponent({ syncPreset: "custom" })

      expect(getByTestId("preset-custom").props.accessibilityState).toMatchObject({ checked: true })
    })

    it("opens the parameters it owns, and a named preset does not", () => {
      const custom = renderComponent({ syncPreset: "custom" })
      expect(custom.getByText("Interval")).toBeTruthy()
      expect(custom.getByText("Movement threshold")).toBeTruthy()

      const named = renderComponent({ syncPreset: "balanced" })
      expect(named.queryByText("Movement threshold")).toBeNull()
    })

    it("prints its stored numbers and no cost adjective, since a guess for typed numbers would be dishonest", () => {
      const { getByText } = renderComponent({ syncPreset: "custom", interval: 20, distance: 5, syncInterval: 90 })

      expect(getByText("Every 20 s after 5 m · syncs every 90 s")).toBeTruthy()
    })
  })

  describe("typed fields", () => {
    it("lands a second edit within the debounce on top of the first, instead of dropping it", () => {
      const { getByDisplayValue } = renderComponent({ syncPreset: "custom", interval: 5, distance: 0 })

      fireEvent.changeText(getByDisplayValue("5"), "20")
      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ interval: 20 }))
      expect(mockOnDebouncedSave).toHaveBeenLastCalledWith(expect.objectContaining({ interval: 20 }))
    })

    it("stores nothing for a cleared field, a decimal or a sign, and says why under the field", () => {
      const { getByDisplayValue, getByText, queryByText } = renderComponent({
        syncPreset: "custom",
        interval: 5,
        distance: 10
      })

      fireEvent.changeText(getByDisplayValue("10"), "")
      expect(mockOnDebouncedSave).not.toHaveBeenCalled()
      expect(queryByText("A whole number")).toBeNull()

      fireEvent.changeText(getByDisplayValue(""), "1.5")
      expect(mockOnDebouncedSave).not.toHaveBeenCalled()
      expect(getByText("A whole number")).toBeTruthy()

      fireEvent.changeText(getByDisplayValue("5"), "0")
      expect(mockOnDebouncedSave).not.toHaveBeenCalled()
      expect(getByText("At least 1 s")).toBeTruthy()
    })

    it("clamps an empty interval to 1 s on blur, saves at once and says so for a moment", () => {
      const { getByDisplayValue, getByText, queryByText } = renderComponent({ syncPreset: "custom", interval: 5 })

      fireEvent.changeText(getByDisplayValue("5"), "")
      fireEvent(getByDisplayValue(""), "blur")

      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ interval: 1 }))
      expect(getByDisplayValue("1")).toBeTruthy()
      expect(getByText("Set to 1 s")).toBeTruthy()

      act(() => {
        jest.advanceTimersByTime(SAVE_SUCCESS_DISPLAY_MS)
      })
      expect(queryByText("Set to 1 s")).toBeNull()
    })

    it("leaves a valid value alone on blur", () => {
      const { getByDisplayValue } = renderComponent({ syncPreset: "custom", interval: 5 })

      fireEvent.changeText(getByDisplayValue("5"), "10")
      fireEvent(getByDisplayValue("10"), "blur")

      expect(mockOnImmediateSave).not.toHaveBeenCalled()
    })

    it("clamps a cleared movement threshold to 0 on blur and keeps the unit on the note", () => {
      const { getByDisplayValue, getByText } = renderComponent({ syncPreset: "custom", interval: 5, distance: 10 })

      fireEvent.changeText(getByDisplayValue("10"), "abc")
      fireEvent(getByDisplayValue("abc"), "blur")

      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ distance: 0 }))
      expect(getByText("Set to 0 m")).toBeTruthy()
    })

    it("keeps the text you typed when the stored value already means it", () => {
      const { getByDisplayValue, rerender } = renderComponent({ syncPreset: "custom", interval: 5 })

      fireEvent.changeText(getByDisplayValue("5"), "020")
      rerender(
        <SyncStrategySettings
          settings={{ ...baseSettings, syncPreset: "custom", interval: 20 }}
          onSettingsChange={mockOnSettingsChange}
          onDebouncedSave={mockOnDebouncedSave}
          onImmediateSave={mockOnImmediateSave}
        />
      )

      expect(getByDisplayValue("020")).toBeTruthy()
    })
  })

  describe("what flips the preset to Custom", () => {
    it("a sync interval row does, because a preset owns that value", () => {
      const { getByTestId } = renderComponent({ syncPreset: "balanced" })

      fireEvent.press(getByTestId("sync-interval-300"))

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({ syncInterval: 300, syncPreset: "custom" })
      )
      expect(mockOnImmediateSave).toHaveBeenCalledWith(
        expect.objectContaining({ syncInterval: 300, syncPreset: "custom" })
      )
    })

    it("a typed sync interval does, through the debounced save", () => {
      const { getByTestId } = renderComponent({ syncPreset: "balanced" })

      fireEvent.press(getByTestId("sync-interval-typed"))

      expect(mockOnSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({ syncInterval: 90, syncPreset: "custom" })
      )
      expect(mockOnDebouncedSave).toHaveBeenCalledWith(
        expect.objectContaining({ syncInterval: 90, syncPreset: "custom" })
      )
    })

    it("a sync condition, the accuracy threshold and the toggle do not", () => {
      const { getByTestId, getByDisplayValue, getByLabelText } = renderComponent({
        syncPreset: "balanced",
        filterInaccurateLocations: true,
        accuracyThreshold: 100
      })

      fireEvent.press(getByTestId("sync-condition-vpn"))
      expect(mockOnImmediateSave).toHaveBeenLastCalledWith(
        expect.objectContaining({ syncCondition: "vpn", syncPreset: "balanced" })
      )

      fireEvent.changeText(getByDisplayValue("100"), "80")
      expect(mockOnDebouncedSave).toHaveBeenLastCalledWith(
        expect.objectContaining({ accuracyThreshold: 80, syncPreset: "balanced" })
      )

      fireEvent(getByLabelText("Filter inaccurate locations"), "valueChange", false)
      expect(mockOnImmediateSave).toHaveBeenLastCalledWith(
        expect.objectContaining({ filterInaccurateLocations: false, syncPreset: "balanced" })
      )
    })
  })

  describe("profile override", () => {
    it("shows the values in force inside the two groups a profile overrides, and only those", () => {
      const { getByTestId, getByText, queryByTestId } = renderComponent({}, charging)

      expect(getByTestId("profile-override-recording")).toBeTruthy()
      expect(getByText("In force: every 5 s after 20 m")).toBeTruthy()
      expect(getByTestId("profile-override-sync")).toBeTruthy()
      expect(getByText("In force: syncs every 15 min")).toBeTruthy()
      expect(queryByTestId("profile-override-notice")).toBeNull()
    })

    it("keeps the rows below selectable, since they are the defaults the profile hands back", () => {
      const { getByTestId } = renderComponent({}, charging)

      fireEvent.press(getByTestId("preset-balanced"))

      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ syncPreset: "balanced" }))
    })

    it("drops the pull under the title when a state line precedes the sync rows", () => {
      const withProfile = renderComponent({}, charging)
      expect(withProfile.getByTestId("sync-interval-picker").props.accessibilityValue.text).toBe("flush")

      const without = renderComponent()
      expect(without.getByTestId("sync-interval-picker").props.accessibilityValue.text).toBe("pulled")
    })

    it("stays quiet when no profile is active, so the line means something when it appears", () => {
      const { queryByTestId } = renderComponent()

      expect(queryByTestId("profile-override-recording")).toBeNull()
      expect(queryByTestId("profile-override-sync")).toBeNull()
    })
  })

  describe("sync condition", () => {
    it("states what every option costs without one being chosen", () => {
      const { getByText } = renderComponent({ syncCondition: "any" })

      expect(getByText("Mobile data and Wi-Fi · syncs never wait, counts against your data plan")).toBeTruthy()
      expect(getByText("Wi-Fi or Ethernet")).toBeTruthy()
      expect(getByText("Unmetered networks only · fixes wait on mobile data")).toBeTruthy()
      expect(getByText("One network by name · fixes wait elsewhere")).toBeTruthy()
      expect(getByText("Only while a VPN is up · fixes wait otherwise")).toBeTruthy()
    })

    it("puts the network name under its own row, not at the end of the group below VPN", () => {
      const { toJSON } = renderComponent({ syncCondition: "wifi_ssid", syncSsid: "Home" })

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

    it("reveals the network name only for the one option that needs it", () => {
      const { queryByTestId } = renderComponent({ syncCondition: "wifi_any" })
      expect(queryByTestId("sync-ssid-input")).toBeNull()

      const named = renderComponent({ syncCondition: "wifi_ssid", syncSsid: "Home" })
      expect(named.queryByTestId("sync-ssid-input")).toBeTruthy()
    })

    it("marks a blank network name as an error, because nothing syncs until one is named", () => {
      const blank = renderComponent({ syncCondition: "wifi_ssid", syncSsid: "" })
      expect(blank.getByText("Nothing syncs until a network is named")).toBeTruthy()

      const named = renderComponent({ syncCondition: "wifi_ssid", syncSsid: "Home" })
      expect(named.queryByText("Nothing syncs until a network is named")).toBeNull()
    })

    it("offers the network the phone is on, named, only while it differs from the one typed", async () => {
      mockGetCurrentSsid.mockResolvedValue("Colota-5G")
      const { findByText, getByTestId } = renderComponent({ syncCondition: "wifi_ssid", syncSsid: "" })

      expect(await findByText("Use Colota-5G")).toBeTruthy()
      fireEvent.press(getByTestId("sync-ssid-use"))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ syncSsid: "Colota-5G" }))

      mockGetCurrentSsid.mockResolvedValue("home")
      const same = renderComponent({ syncCondition: "wifi_ssid", syncSsid: "Home" })
      await act(async () => {
        await Promise.resolve()
      })
      expect(same.queryByTestId("sync-ssid-use")).toBeNull()
    })
  })

  describe("accuracy filter", () => {
    it("carries the threshold in the hint in both states, so hiding the field loses nothing", () => {
      const on = renderComponent({ filterInaccurateLocations: true, accuracyThreshold: 50 })
      expect(on.getByText("Drops fixes the chip rates worse than 50 m. Stricter leaves gaps indoors.")).toBeTruthy()
      expect(on.getByText("Accuracy threshold")).toBeTruthy()

      const off = renderComponent({ filterInaccurateLocations: false, accuracyThreshold: 50 })
      expect(off.getByText("Every fix is kept. When on, fixes worse than 50 m are dropped.")).toBeTruthy()
      expect(off.queryByText("Accuracy threshold")).toBeNull()
    })

    it("moves the switch at once: local state first, then the immediate save", () => {
      const calls: string[] = []
      mockOnSettingsChange.mockImplementation(() => calls.push("local"))
      mockOnImmediateSave.mockImplementation(() => calls.push("save"))
      const { getByLabelText } = renderComponent({ filterInaccurateLocations: false })

      fireEvent(getByLabelText("Filter inaccurate locations"), "valueChange", true)

      expect(calls).toEqual(["local", "save"])
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ filterInaccurateLocations: true }))
    })

    it("clamps the threshold to 1 on blur when it is below", () => {
      const { getByDisplayValue } = renderComponent({ filterInaccurateLocations: true, accuracyThreshold: 100 })

      fireEvent.changeText(getByDisplayValue("100"), "0")
      fireEvent(getByDisplayValue("0"), "blur")

      expect(mockOnSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ accuracyThreshold: 1 }))
      expect(mockOnImmediateSave).toHaveBeenCalledWith(expect.objectContaining({ accuracyThreshold: 1 }))
    })
  })

  describe("batch size", () => {
    const overland = { apiTemplate: "overland" as const }

    it("shows the range as an error while the number is outside it and stores nothing", () => {
      const { getByDisplayValue, getByText } = renderComponent({ ...overland, overlandBatchSize: 50 })

      fireEvent.changeText(getByDisplayValue("50"), "900")

      expect(getByText("1 to 500")).toBeTruthy()
      expect(mockOnDebouncedSave).not.toHaveBeenCalled()
    })

    it("clamps to the nearer bound on blur without touching the preset", () => {
      const { getByDisplayValue, getByText } = renderComponent({
        ...overland,
        overlandBatchSize: 50,
        syncPreset: "balanced"
      })

      fireEvent.changeText(getByDisplayValue("50"), "900")
      fireEvent(getByDisplayValue("900"), "blur")

      expect(mockOnImmediateSave).toHaveBeenCalledWith(
        expect.objectContaining({ overlandBatchSize: 500, syncPreset: "balanced" })
      )
      expect(getByText("Set to 500 points")).toBeTruthy()
    })
  })
})
