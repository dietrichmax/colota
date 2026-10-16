import React from "react"
import { render, fireEvent, waitFor, act } from "@testing-library/react-native"
import { TrackingProfile } from "../../types/global"
import { SAVE_SUCCESS_DISPLAY_MS } from "../../constants"

const mockProfiles: TrackingProfile[] = [
  {
    id: 1,
    name: "Existing Profile",
    interval: 10,
    distance: 5,
    syncInterval: 60,
    priority: 15,
    condition: { type: "speed_above", speedThreshold: 13.89 },
    activationDelay: 12,
    deactivationDelay: 30,
    enabled: true
  },
  {
    id: 2,
    name: "Home",
    interval: 60,
    distance: 10,
    syncInterval: 300,
    priority: 15,
    condition: { type: "wifi_ssid", ssid: "HomeNet" },
    activationDelay: 0,
    deactivationDelay: 60,
    enabled: true
  },
  {
    id: 3,
    name: "Car",
    interval: 5,
    distance: 0,
    syncInterval: 60,
    priority: 20,
    condition: { type: "bluetooth_device", bluetoothAddress: "00:11:22:33:44:55", bluetoothName: "Old Car" },
    activationDelay: 0,
    deactivationDelay: 60,
    enabled: true
  }
]

const mockGetProfiles = jest.fn().mockResolvedValue(mockProfiles)
const mockCreateProfile = jest.fn().mockResolvedValue(1)
const mockUpdateProfile = jest.fn().mockResolvedValue(true)
const mockDeleteProfile = jest.fn().mockResolvedValue(true)

jest.mock("../../services/ProfileService", () => ({
  ProfileService: {
    getProfiles: () => mockGetProfiles(),
    createProfile: (p: any) => mockCreateProfile(p),
    updateProfile: (p: any) => mockUpdateProfile(p),
    deleteProfile: (id: number) => mockDeleteProfile(id)
  }
}))

const mockGetCurrentSsid = jest.fn().mockResolvedValue("HomeNet")
jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getCurrentSsid: () => mockGetCurrentSsid()
  }
}))

const mockCheckBluetoothPermission = jest.fn()
jest.mock("../../services/LocationServicePermission", () => ({
  checkBluetoothPermission: () => mockCheckBluetoothPermission()
}))

const mockShowAlert = jest.fn()
const mockShowConfirm = jest.fn()
jest.mock("../../services/modalService", () => ({
  showAlert: (...args: any[]) => mockShowAlert(...args),
  showConfirm: (...args: any[]) => mockShowConfirm(...args)
}))

jest.mock("../../utils/geo", () => ({
  ...jest.requireActual("../../utils/geo"),
  shortDistanceUnit: () => "m",
  metersToInput: (v: number) => v,
  inputToMeters: (v: number) => v,
  getSpeedUnit: () => ({ factor: 3.6, unit: "km/h" }),
  speedToInput: (mps: number) => Math.round(mps * 3.6),
  inputToSpeed: (v: number) => v / 3.6
}))

let mockSettings = { isOfflineMode: false, interval: 5, distance: 0, syncInterval: 0 }
jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({ settings: mockSettings })
}))

jest.mock("../../components/features/settings/SyncIntervalPicker", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  const { SYNC_INTERVAL_PRESETS } = require("../../constants")
  const { syncIntervalLabel } = require("../../utils/dashboardState")
  return {
    SyncIntervalPicker: ({ label, hint, value, onSelect }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        R.createElement(Text, null, hint),
        SYNC_INTERVAL_PRESETS.map((seconds: number) =>
          R.createElement(
            Pressable,
            {
              key: seconds,
              testID: `sync-interval-${seconds}`,
              onPress: () => onSelect(seconds),
              accessibilityState: { checked: value === seconds }
            },
            R.createElement(Text, null, syncIntervalLabel(seconds))
          )
        )
      )
  }
})

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable, TextInput } = require("react-native")
  return {
    TextField: require("../../testing/componentStubs").TextFieldStub,
    RadioRow: ({ testID, label, sub, selected, onPress }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress, accessibilityRole: "radio", accessibilityState: { checked: selected } },
        R.createElement(Text, null, label),
        sub ? R.createElement(Text, null, sub) : null
      ),
    ListItem: ({ testID, label, sub, onPress }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress },
        R.createElement(Text, null, label),
        sub ? R.createElement(Text, null, sub) : null
      ),
    SelectField: ({ testID, label, value, placeholder, error, onPress }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress },
        R.createElement(Text, null, label),
        R.createElement(Text, null, value ?? placeholder),
        error ? R.createElement(Text, null, error) : null
      ),
    Button: ({ title, onPress, disabled, testID }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress, disabled, accessibilityRole: "button", accessibilityState: { disabled } },
        R.createElement(Text, null, title)
      ),
    Container: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    NumericInput: ({ label, value, onChange, onBlur, unit, hint, error, message, testID }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        hint ? R.createElement(Text, null, hint) : null,
        R.createElement(TextInput, { testID, value, onChangeText: onChange, onBlur }),
        unit ? R.createElement(Text, null, unit) : null,
        error ? R.createElement(Text, null, error) : null,
        message ? R.createElement(Text, null, message) : null
      ),
    Divider: () => R.createElement(View, null),
    SettingRow: ({ label, hint, children, disabled }: any) =>
      R.createElement(
        View,
        { accessibilityState: { disabled: !!disabled } },
        R.createElement(Text, null, label),
        hint && R.createElement(Text, null, hint),
        children
      ),
    FieldMessage: ({ children }: any) => R.createElement(Text, null, children)
  }
})

jest.mock("../../utils/logger", () => ({ logger: { error: jest.fn() } }))

const mockGoBack = jest.fn()
const mockSetOptions = jest.fn()
const mockNavigate = jest.fn()
const mockNavigation = { goBack: mockGoBack, setOptions: mockSetOptions, navigate: mockNavigate, setParams: jest.fn() }

import { ProfileEditorScreen } from "../ProfileEditorScreen"
import type { BluetoothDeviceInfo } from "../../types/global"

describe("ProfileEditorScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSettings = { isOfflineMode: false, interval: 5, distance: 0, syncInterval: 0 }
    mockGetProfiles.mockResolvedValue(mockProfiles)
    mockCheckBluetoothPermission.mockResolvedValue(true)
  })

  // The device screen hands its pick back by merging it into the editor's params.
  const renderAt = (params: Record<string, unknown>) => {
    const screen = (p: Record<string, unknown>) => (
      <ProfileEditorScreen navigation={mockNavigation as any} route={{ params: p } as any} />
    )
    const utils = render(screen(params))
    return {
      ...utils,
      pickDevice: (bluetoothDevice: BluetoothDeviceInfo) => utils.rerender(screen({ ...params, bluetoothDevice }))
    }
  }
  const renderNew = () => renderAt({})
  const renderEdit = (profileId = 1) => renderAt({ profileId })

  describe("the sentence", () => {
    it("reads the draft back as the rule and follows every edit", () => {
      const { getByTestId } = renderNew()

      expect(getByTestId("profile-sentence").props.children).toBe(
        "When charging, track every 5 s, any movement and sync each fix."
      )

      fireEvent.press(getByTestId("condition-speed_above"))
      fireEvent.changeText(getByTestId("speed-input"), "50")
      fireEvent.changeText(getByTestId("interval-input"), "2")
      fireEvent.changeText(getByTestId("distance-input"), "10")
      fireEvent.press(getByTestId("sync-interval-60"))

      expect(getByTestId("profile-sentence").props.children).toBe(
        "When faster than 50 km/h, track every 2 s after 10 m and sync every 1 min."
      )
    })

    it("drops the sync clause in offline mode and hides the sync picker", () => {
      mockSettings = { ...mockSettings, isOfflineMode: true }
      const { getByTestId, queryByText } = renderNew()

      expect(getByTestId("profile-sentence").props.children).toBe("When charging, track every 5 s, any movement.")
      expect(queryByText("Sync interval")).toBeNull()
    })
  })

  describe("condition", () => {
    it("comes first, in sentence case, with what each condition means on its row", () => {
      const { getByText, getByTestId } = renderNew()

      expect(getByText("Android Auto")).toBeTruthy()
      expect(getByText("Speed above")).toBeTruthy()
      expect(getByText("Wi-Fi")).toBeTruthy()
      expect(getByText("Wi-Fi network")).toBeTruthy()
      expect(getByText("Phone is plugged in")).toBeTruthy()
      expect(getByText("Average speed is above the speed you set")).toBeTruthy()
      expect(getByText("Phone is on a Wi-Fi network")).toBeTruthy()
      expect(getByText("Bluetooth device")).toBeTruthy()
      expect(getByText("Connected to a paired device, such as your car")).toBeTruthy()
      expect(getByTestId("condition-charging").props.accessibilityState.checked).toBe(true)
    })

    it("reveals the speed field under a speed condition only, in the user's unit", () => {
      const { getByTestId, queryByTestId, getByText } = renderNew()
      expect(queryByTestId("speed-input")).toBeNull()

      fireEvent.press(getByTestId("condition-speed_below"))

      expect(getByTestId("speed-input").props.value).toBe("30")
      expect(getByText("At least 1 km/h. Applies while your average speed is below it.")).toBeTruthy()
      expect(getByText("km/h")).toBeTruthy()
    })

    it("keeps delays the user changed across a condition switch and resets untouched ones", () => {
      const { getByTestId } = renderNew()

      fireEvent.press(getByTestId("condition-stationary"))
      expect(getByTestId("activation-delay-input").props.value).toBe("60")

      fireEvent.changeText(getByTestId("activation-delay-input"), "90")
      fireEvent.press(getByTestId("condition-charging"))
      expect(getByTestId("activation-delay-input").props.value).toBe("90")
    })
  })

  describe("wi-fi network", () => {
    it("reveals the network field under a named-network condition and blocks Save until it is filled", async () => {
      const { getByTestId, queryByTestId } = renderNew()
      expect(queryByTestId("wifi-ssid-input")).toBeNull()

      fireEvent.press(getByTestId("condition-wifi_ssid"))
      // Let the current-SSID offer settle inside act before asserting.
      await waitFor(() => expect(mockGetCurrentSsid).toHaveBeenCalled())

      expect(getByTestId("wifi-ssid-input").props.value).toBe("")
      expect(getByTestId("profile-sentence").props.children).toBe(
        "On Wi-Fi, track every 5 s, any movement and sync each fix."
      )
      expect(getByTestId("save-profile-btn").props.accessibilityState.disabled).toBe(true)

      fireEvent.changeText(getByTestId("wifi-ssid-input"), "HomeNet")
      expect(getByTestId("profile-sentence").props.children).toBe(
        'On Wi-Fi "HomeNet", track every 5 s, any movement and sync each fix.'
      )
      expect(getByTestId("save-profile-btn").props.accessibilityState.disabled).toBe(false)
    })

    it("offers the network the phone is on and saves the trimmed name", async () => {
      const { getByTestId } = renderNew()
      fireEvent.press(getByTestId("condition-wifi_ssid"))

      const use = await waitFor(() => getByTestId("wifi-ssid-use"))
      fireEvent.press(use)
      expect(getByTestId("wifi-ssid-input").props.value).toBe("HomeNet")

      fireEvent.changeText(getByTestId("wifi-ssid-input"), " HomeNet ")
      fireEvent.press(getByTestId("save-profile-btn"))

      await waitFor(() =>
        expect(mockCreateProfile).toHaveBeenCalledWith(
          expect.objectContaining({ condition: { type: "wifi_ssid", ssid: "HomeNet" } })
        )
      )
    })

    it("keeps the typed network across a condition round trip", async () => {
      const { findByTestId, getByTestId } = renderEdit(2)
      expect((await findByTestId("wifi-ssid-input")).props.value).toBe("HomeNet")
      await waitFor(() => expect(mockGetCurrentSsid).toHaveBeenCalled())

      fireEvent.press(getByTestId("condition-wifi_any"))
      expect(getByTestId("profile-sentence").props.children).toBe(
        "On Wi-Fi, track every 1 min after 10 m and sync every 5 min."
      )

      fireEvent.press(getByTestId("condition-wifi_ssid"))
      expect(getByTestId("wifi-ssid-input").props.value).toBe("HomeNet")
      expect(getByTestId("save-profile-btn").props.accessibilityState.disabled).toBe(false)
    })

    it("clears the stored network when saved under another condition", async () => {
      const { findByTestId, getByTestId } = renderEdit(2)
      await findByTestId("wifi-ssid-input")

      fireEvent.press(getByTestId("condition-wifi_any"))
      fireEvent.press(getByTestId("save-profile-btn"))

      await waitFor(() =>
        expect(mockUpdateProfile).toHaveBeenCalledWith(
          expect.objectContaining({ id: 2, condition: { type: "wifi_any" } })
        )
      )
    })
  })

  describe("bluetooth device", () => {
    it("blocks Save until a device is picked and opens the device screen for it", () => {
      const { getByTestId, getByText } = renderNew()
      fireEvent.press(getByTestId("condition-bluetooth_device"))

      expect(getByText("Pick a device")).toBeTruthy()
      expect(getByText("Pick a device or the profile can't match")).toBeTruthy()
      expect(getByTestId("profile-sentence").props.children).toBe(
        "When connected to a Bluetooth device, track every 5 s, any movement and sync each fix."
      )
      expect(getByTestId("save-profile-btn").props.accessibilityState.disabled).toBe(true)

      fireEvent.press(getByTestId("nav-bluetooth-device"))
      expect(mockNavigate).toHaveBeenCalledWith("Bluetooth Device", { selected: undefined })
    })

    it("saves the picked device's address and name", async () => {
      const { getByTestId, getByText, pickDevice } = renderNew()
      fireEvent.press(getByTestId("condition-bluetooth_device"))

      pickDevice({ name: "My Car", address: "AA:BB:CC:DD:EE:FF" })
      expect(getByText("My Car")).toBeTruthy()
      expect(getByTestId("profile-sentence").props.children).toBe(
        'Connected to "My Car", track every 5 s, any movement and sync each fix.'
      )

      fireEvent.press(getByTestId("save-profile-btn"))
      await waitFor(() =>
        expect(mockCreateProfile).toHaveBeenCalledWith(
          expect.objectContaining({
            condition: { type: "bluetooth_device", bluetoothAddress: "AA:BB:CC:DD:EE:FF", bluetoothName: "My Car" }
          })
        )
      )
    })

    it("keeps the pick across a condition round trip and opens the device screen on it", async () => {
      const { findByText, getByText, getByTestId } = renderEdit(3)
      expect(await findByText("Old Car")).toBeTruthy()

      fireEvent.press(getByTestId("nav-bluetooth-device"))
      expect(mockNavigate).toHaveBeenCalledWith("Bluetooth Device", {
        selected: { address: "00:11:22:33:44:55", name: "Old Car" }
      })

      fireEvent.press(getByTestId("condition-charging"))
      fireEvent.press(getByTestId("condition-bluetooth_device"))
      expect(getByText("Old Car")).toBeTruthy()
      expect(getByTestId("save-profile-btn").props.accessibilityState.disabled).toBe(false)
    })

    // A setup link or a revoked permission leaves a saved profile that can never match.
    it("flags a saved device the service cannot see without the Nearby devices permission", async () => {
      mockCheckBluetoothPermission.mockResolvedValue(false)
      const { findByText, getByTestId } = renderEdit(3)

      expect(await findByText("Nearby devices not allowed")).toBeTruthy()
      expect(getByTestId("save-profile-btn").props.accessibilityState.disabled).toBe(false)
    })

    it("clears the stored device when saved under another condition", async () => {
      const { findByText, getByTestId } = renderEdit(3)
      await findByText("Old Car")

      fireEvent.press(getByTestId("condition-charging"))
      fireEvent.press(getByTestId("save-profile-btn"))

      await waitFor(() =>
        expect(mockUpdateProfile).toHaveBeenCalledWith(
          expect.objectContaining({ id: 3, condition: { type: "charging" } })
        )
      )
    })
  })

  describe("stationary", () => {
    it("blocks the movement threshold with the reason instead of hiding it, and drops the deactivation delay", () => {
      const { getByTestId, getByText, queryByTestId } = renderNew()

      fireEvent.press(getByTestId("condition-stationary"))

      expect(getByText("Not used while still · a point is recorded every interval")).toBeTruthy()
      expect(getByText("0 m")).toBeTruthy()
      expect(queryByTestId("distance-input")).toBeNull()
      expect(queryByTestId("deactivation-delay-input")).toBeNull()
      expect(
        getByText(
          "How long every fix must read as still; 0 switches at the first still fix. Moving again ends the profile at once."
        )
      ).toBeTruthy()
    })

    it("accepts a long heartbeat interval without a warning, since that is what the profile is for", () => {
      const { getByTestId, queryByText } = renderNew()
      fireEvent.press(getByTestId("condition-stationary"))

      fireEvent.changeText(getByTestId("interval-input"), "1800")

      expect(queryByText(/unrecorded/)).toBeNull()
      expect(getByTestId("save-profile-btn").props.accessibilityState.disabled).toBe(false)
    })
  })

  describe("override fields", () => {
    it("name the Tracking & sync value they replace instead of a bare default", () => {
      mockSettings = { isOfflineMode: false, interval: 30, distance: 2, syncInterval: 300 }
      const { getByText } = renderNew()

      expect(getByText(/^At least 1 s\. Replaces the 30 s from Tracking & sync/)).toBeTruthy()
      expect(getByText(/^At least 0 m\. Replaces the 2 m from Tracking & sync/)).toBeTruthy()
      expect(getByText(/^Replaces the 5 min from Tracking & sync/)).toBeTruthy()
    })

    it("rejects a decimal on the field and disables Save until it is fixed", () => {
      const { getByTestId, getByText, queryByText } = renderNew()

      fireEvent.changeText(getByTestId("interval-input"), "1.5")

      expect(getByText("A whole number")).toBeTruthy()
      expect(getByTestId("save-profile-btn").props.accessibilityState.disabled).toBe(true)

      fireEvent.changeText(getByTestId("interval-input"), "15")
      expect(queryByText("A whole number")).toBeNull()
      expect(getByTestId("save-profile-btn").props.accessibilityState.disabled).toBe(false)
    })

    it("clamps an emptied interval to 1 s on blur and says so for a moment", () => {
      jest.useFakeTimers()
      const { getByTestId, getByText, queryByText } = renderNew()

      fireEvent.changeText(getByTestId("interval-input"), "")
      fireEvent(getByTestId("interval-input"), "blur")

      expect(getByTestId("interval-input").props.value).toBe("1")
      expect(getByText("Set to 1 s")).toBeTruthy()
      act(() => {
        jest.advanceTimersByTime(SAVE_SUCCESS_DISPLAY_MS)
      })
      expect(queryByText("Set to 1 s")).toBeNull()
      jest.useRealTimers()
    })

    it("restores the stored priority when its box is left empty, and flags a non-number", () => {
      const { getByTestId, getByText, queryByText } = renderNew()

      fireEvent.changeText(getByTestId("priority-input"), "x")
      expect(getByText("A whole number")).toBeTruthy()
      expect(getByTestId("save-profile-btn").props.accessibilityState.disabled).toBe(true)

      fireEvent.changeText(getByTestId("priority-input"), "")
      fireEvent(getByTestId("priority-input"), "blur")
      expect(getByTestId("priority-input").props.value).toBe("10")
      expect(queryByText("A whole number")).toBeNull()
    })
  })

  describe("save and delete", () => {
    it("creates a profile with the condition's name when the name is blank, four taps from Create", async () => {
      const { getByTestId } = renderNew()

      fireEvent.press(getByTestId("save-profile-btn"))

      await waitFor(() => expect(mockCreateProfile).toHaveBeenCalledWith(expect.objectContaining({ name: "Charging" })))
      expect(mockShowAlert).not.toHaveBeenCalled()
      expect(mockGoBack).toHaveBeenCalled()
    })

    it("stores a speed in m/s from the display unit", async () => {
      const { getByTestId } = renderNew()

      fireEvent.press(getByTestId("condition-speed_above"))
      fireEvent.changeText(getByTestId("speed-input"), "50")
      fireEvent.press(getByTestId("save-profile-btn"))

      await waitFor(() =>
        expect(mockCreateProfile).toHaveBeenCalledWith(
          expect.objectContaining({ condition: { type: "speed_above", speedThreshold: expect.closeTo(13.89, 1) } })
        )
      )
    })

    it("loads an existing profile into every field and saves through updateProfile", async () => {
      const { findByTestId, getByTestId } = renderEdit()

      expect((await findByTestId("name-input")).props.value).toBe("Existing Profile")
      expect(getByTestId("speed-input").props.value).toBe("50")
      expect(getByTestId("interval-input").props.value).toBe("10")
      expect(getByTestId("activation-delay-input").props.value).toBe("12")
      expect(mockSetOptions).toHaveBeenCalledWith({ headerTitle: "Edit profile" })

      fireEvent.press(getByTestId("save-profile-btn"))
      await waitFor(() =>
        expect(mockUpdateProfile).toHaveBeenCalledWith(expect.objectContaining({ id: 1, priority: 15 }))
      )
    })

    it("shows an error and goes back when the profile cannot load", async () => {
      mockGetProfiles.mockRejectedValueOnce(new Error("db"))
      renderEdit()

      await waitFor(() => expect(mockShowAlert).toHaveBeenCalledWith("Error", "Failed to load profile data.", "error"))
      expect(mockGoBack).toHaveBeenCalled()
    })

    it("offers Delete only while editing and confirms before deleting", async () => {
      const draft = renderNew()
      expect(draft.queryByTestId("delete-profile-btn")).toBeNull()

      mockShowConfirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
      const { findByTestId } = renderEdit()
      fireEvent.press(await findByTestId("delete-profile-btn"))
      await waitFor(() => expect(mockShowConfirm).toHaveBeenCalled())
      expect(mockDeleteProfile).not.toHaveBeenCalled()

      fireEvent.press(await findByTestId("delete-profile-btn"))
      await waitFor(() => expect(mockDeleteProfile).toHaveBeenCalledWith(1))
      expect(mockGoBack).toHaveBeenCalled()
    })
  })
})
