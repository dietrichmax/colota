import React from "react"
import { render, fireEvent, act } from "@testing-library/react-native"
import { BLUETOOTH_REREAD_MS } from "../../constants"

const mockGetBondedBluetoothDevices = jest.fn()
jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getBondedBluetoothDevices: () => mockGetBondedBluetoothDevices()
  }
}))

const mockCheckBluetoothPermission = jest.fn()
const mockRequestBluetoothPermission = jest.fn()
jest.mock("../../services/LocationServicePermission", () => ({
  checkBluetoothPermission: () => mockCheckBluetoothPermission(),
  requestBluetoothPermission: () => mockRequestBluetoothPermission()
}))

const mockOpenSettings = jest.fn()
jest.spyOn(require("react-native").Linking, "openSettings").mockImplementation(() => mockOpenSettings())

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    RadioRow: ({ testID, label, sub, selected, onPress }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress, accessibilityRole: "radio", accessibilityState: { checked: selected } },
        R.createElement(Text, null, label),
        sub ? R.createElement(Text, null, sub) : null
      ),
    EmptyState: ({ title, hint, action }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, title),
        hint ? R.createElement(Text, null, hint) : null,
        action
          ? R.createElement(
              Pressable,
              { testID: "empty-action", onPress: action.onPress },
              R.createElement(Text, null, action.label)
            )
          : null
      )
  }
})

import { BluetoothDeviceScreen } from "../BluetoothDeviceScreen"

const PAIRED = [
  { name: "My Car", address: "AA:BB:CC:DD:EE:FF" },
  { name: "Earbuds", address: "11:22:33:44:55:66" }
]
const OLD_CAR = { name: "Old Car", address: "00:11:22:33:44:55" }

describe("BluetoothDeviceScreen", () => {
  const mockPopTo = jest.fn()
  const navigation = { popTo: mockPopTo }

  beforeEach(() => {
    jest.clearAllMocks()
    mockCheckBluetoothPermission.mockResolvedValue(true)
    mockRequestBluetoothPermission.mockResolvedValue("granted")
    mockGetBondedBluetoothDevices.mockResolvedValue(PAIRED)
  })

  const renderScreen = (selected?: { name: string; address: string }) =>
    render(
      <BluetoothDeviceScreen
        navigation={navigation as any}
        route={{ params: selected ? { selected } : undefined } as any}
      />
    )

  it("lists the paired devices and hands the pick back to the editor", async () => {
    const { findByTestId, getByText } = renderScreen()

    fireEvent.press(await findByTestId("bluetooth-device-AA:BB:CC:DD:EE:FF"))

    expect(getByText("Earbuds")).toBeTruthy()
    expect(mockPopTo).toHaveBeenCalledWith(
      "Profile Editor",
      { bluetoothDevice: { name: "My Car", address: "AA:BB:CC:DD:EE:FF" } },
      { merge: true }
    )
  })

  it("keeps a stored device that is no longer paired", async () => {
    const { findByTestId, getByText } = renderScreen(OLD_CAR)

    const stored = await findByTestId("bluetooth-device-00:11:22:33:44:55")
    expect(stored.props.accessibilityState.checked).toBe(true)
    expect(getByText("No longer paired")).toBeTruthy()
  })

  // Opening the picker is the in-context moment, so the dialog comes before any denial is shown.
  it("asks for the Nearby devices permission before it can list anything", async () => {
    mockCheckBluetoothPermission.mockResolvedValueOnce(false)
    mockRequestBluetoothPermission.mockResolvedValueOnce("denied")
    const { findByText, findByTestId, getByTestId, queryByTestId } = renderScreen()

    expect(await findByText("Nearby devices not allowed")).toBeTruthy()
    expect(mockRequestBluetoothPermission).toHaveBeenCalledTimes(1)
    expect(mockGetBondedBluetoothDevices).not.toHaveBeenCalled()

    fireEvent.press(getByTestId("empty-action"))
    await findByTestId("bluetooth-device-AA:BB:CC:DD:EE:FF")
    expect(mockRequestBluetoothPermission).toHaveBeenCalledTimes(2)
    expect(queryByTestId("empty-action")).toBeNull()
  })

  it("sends a blocked permission to app settings", async () => {
    mockCheckBluetoothPermission.mockResolvedValue(false)
    mockRequestBluetoothPermission.mockResolvedValue("blocked")
    const { findByText, getByTestId } = renderScreen()

    await findByText("Open app settings")
    fireEvent.press(getByTestId("empty-action"))
    expect(mockOpenSettings).toHaveBeenCalled()
  })

  // Closing the dialog resumes the app before the request resolves, so a refresh can land after "blocked".
  it("keeps pointing at app settings when a refresh follows the blocked answer", async () => {
    const { AppState } = require("react-native")
    mockCheckBluetoothPermission.mockResolvedValue(false)
    mockRequestBluetoothPermission.mockResolvedValue("blocked")
    const { findByText, getByText } = renderScreen()
    await findByText("Open app settings")

    const onChange = (AppState.addEventListener as jest.Mock).mock.calls
      .filter((call: unknown[]) => call[0] === "change")
      .at(-1)[1]
    await act(async () => onChange("active"))

    expect(getByText("Open app settings")).toBeTruthy()
  })

  it("says how to pair a device when none is paired", async () => {
    const { Linking } = require("react-native")
    mockGetBondedBluetoothDevices.mockResolvedValue([])
    const { findByText, getByText, getByTestId } = renderScreen()

    expect(await findByText("No paired devices")).toBeTruthy()
    expect(getByText("Pair one in Bluetooth settings, then come back.")).toBeTruthy()
    fireEvent.press(getByTestId("empty-action"))
    expect(Linking.sendIntent).toHaveBeenCalledWith("android.settings.BLUETOOTH_SETTINGS")
  })

  // null is the bridge's answer while Bluetooth is off.
  it("shows Bluetooth as off, not the stored device as unpaired", async () => {
    mockGetBondedBluetoothDevices.mockResolvedValue(null)
    const { findByText, getByTestId, getByText, queryByText } = renderScreen(OLD_CAR)

    expect(await findByText("Bluetooth is off")).toBeTruthy()
    expect(getByTestId("bluetooth-device-00:11:22:33:44:55").props.accessibilityState.checked).toBe(true)
    expect(queryByText("No longer paired")).toBeNull()
    expect(queryByText("No paired devices")).toBeNull()
    expect(getByText("Open Bluetooth settings")).toBeTruthy()
  })

  // The shade closes while Bluetooth is still turning on, so the read on focus still finds it off.
  it("reads the paired devices again after Quick Settings closes", async () => {
    const { AppState } = require("react-native")
    mockGetBondedBluetoothDevices.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    const { findByText, findByTestId, queryByTestId } = renderScreen()
    await findByText("Bluetooth is off")

    jest.useFakeTimers()
    const onFocus = (AppState.addEventListener as jest.Mock).mock.calls
      .filter((call: unknown[]) => call[0] === "focus")
      .at(-1)[1]
    await act(async () => onFocus())
    expect(queryByTestId("bluetooth-device-AA:BB:CC:DD:EE:FF")).toBeNull()

    await act(async () => {
      jest.advanceTimersByTime(BLUETOOTH_REREAD_MS)
    })
    jest.useRealTimers()
    expect(await findByTestId("bluetooth-device-AA:BB:CC:DD:EE:FF")).toBeTruthy()
  })
})
