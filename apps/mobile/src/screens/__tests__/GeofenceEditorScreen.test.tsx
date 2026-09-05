/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { DeviceEventEmitter } from "react-native"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { Geofence } from "../../types/global"

// --- Mocks ---

const mockGetGeofences = jest.fn()
const mockCreateGeofence = jest.fn().mockResolvedValue(1)
const mockUpdateGeofence = jest.fn().mockResolvedValue(true)
const mockDeleteGeofence = jest.fn().mockResolvedValue(true)

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getGeofences: (...args: any[]) => mockGetGeofences(...args),
    createGeofence: (...args: any[]) => mockCreateGeofence(...args),
    updateGeofence: (...args: any[]) => mockUpdateGeofence(...args),
    deleteGeofence: (...args: any[]) => mockDeleteGeofence(...args)
  }
}))

const mockShowAlert = jest.fn()
const mockShowConfirm = jest.fn().mockResolvedValue(true)

jest.mock("../../services/modalService", () => ({
  showAlert: (...args: any[]) => mockShowAlert(...args),
  showConfirm: (...args: any[]) => mockShowConfirm(...args)
}))

jest.mock("react-native/Libraries/EventEmitter/NativeEventEmitter")

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: require("@colota/shared").lightColors,
    mode: "light"
  })
}))

jest.mock("../../utils/geo", () => ({
  shortDistanceUnit: () => "m",
  metersToInput: (v: number) => v,
  inputToMeters: (v: number) => v
}))

jest.mock("../../utils/logger", () => ({
  logger: { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable, TextInput } = require("react-native")
  return {
    Toggle: ({ value, onValueChange, disabled, testID, accessibilityLabel }: any) =>
      R.createElement(Pressable, {
        testID,
        disabled,
        accessibilityRole: "switch",
        accessibilityLabel,
        accessibilityState: { checked: value, disabled: !!disabled },
        onPress: () => onValueChange(!value)
      }),
    Container: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Divider: () => R.createElement(View, { testID: "divider" }),
    SettingRow: ({ label, children }: any) => R.createElement(View, null, R.createElement(Text, null, label), children),
    ListItem: ({ label, sub, onPress, testID }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress },
        R.createElement(Text, null, label),
        sub && R.createElement(Text, null, sub)
      ),
    TextField: ({ value, onChangeText, testID, label, placeholder }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        R.createElement(TextInput, { testID, value, onChangeText, placeholder })
      ),
    NumericInput: ({ value, onChange, testID, label, unit }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, label),
        R.createElement(TextInput, { testID, value, onChangeText: onChange }),
        R.createElement(Text, null, unit)
      ),
    Button: ({ title, onPress, disabled, testID }: any) =>
      R.createElement(
        Pressable,
        { onPress, testID, accessibilityState: { disabled: !!disabled } },
        R.createElement(Text, null, title)
      ),
    FieldMessage: ({ children }: any) => R.createElement(Text, null, children)
  }
})

const mockGoBack = jest.fn()
const mockNavigate = jest.fn()
const mockSetOptions = jest.fn()
const mockNavigation = { goBack: mockGoBack, navigate: mockNavigate, setOptions: mockSetOptions }

const mockExistingGeofence: Geofence = {
  id: 1,
  name: "Home",
  lat: 48.1,
  lon: 11.5,
  radius: 100,
  enabled: true,
  pauseTracking: true,
  pauseOnWifi: false,
  pauseOnMotionless: false,
  motionlessTimeoutMinutes: 10,
  heartbeatEnabled: false,
  heartbeatIntervalMinutes: 15
}

import { GeofenceEditorScreen } from "../GeofenceEditorScreen"

// --- Tests ---

describe("GeofenceEditorScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetGeofences.mockResolvedValue([mockExistingGeofence])
    mockShowConfirm.mockResolvedValue(true)
    mockDeleteGeofence.mockResolvedValue(true)
    mockUpdateGeofence.mockResolvedValue(true)
    mockCreateGeofence.mockResolvedValue(1)
  })

  function renderEdit(geofenceId = 1) {
    return render(<GeofenceEditorScreen navigation={mockNavigation as any} route={{ params: { geofenceId } } as any} />)
  }

  function renderNew(params: Record<string, unknown> | undefined = undefined) {
    return render(<GeofenceEditorScreen navigation={mockNavigation as any} route={{ params } as any} />)
  }

  // --- Draft shape ---

  it("opens on an empty draft with no id", async () => {
    const { getByTestId, getByText } = renderNew()

    await waitFor(() => {
      expect(getByTestId("geofence-name-input")).toBeTruthy()
    })

    expect(getByTestId("geofence-name-input").props.value).toBe("")
    expect(getByTestId("geofence-radius-input").props.value).toBe("50")
    expect(getByText("Tap to choose the centre")).toBeTruthy()
    expect(mockGetGeofences).not.toHaveBeenCalled()
  })

  it("opens populated with an id", async () => {
    const { getByTestId, getByText } = renderEdit()

    await waitFor(() => {
      expect(getByTestId("geofence-name-input").props.value).toBe("Home")
    })

    expect(getByTestId("geofence-radius-input").props.value).toBe("100")
    expect(getByText("48.100000, 11.500000")).toBeTruthy()
  })

  it("names the screen for what it is doing", async () => {
    renderNew()
    await waitFor(() => {
      expect(mockSetOptions).toHaveBeenCalledWith({ headerTitle: "New zone" })
    })

    mockSetOptions.mockClear()
    renderEdit()
    await waitFor(() => {
      expect(mockSetOptions).toHaveBeenCalledWith({ headerTitle: "Edit zone" })
    })
  })

  // --- The map step ---

  it("hands the draft's name and radius to the map step", async () => {
    const { getByTestId } = renderNew()

    await waitFor(() => {
      expect(getByTestId("geofence-name-input")).toBeTruthy()
    })

    fireEvent.changeText(getByTestId("geofence-name-input"), "Allotment")
    fireEvent.changeText(getByTestId("geofence-radius-input"), "80")
    fireEvent.press(getByTestId("place-on-map-btn"))

    expect(mockNavigate).toHaveBeenCalledWith("Place Zone", {
      name: "Allotment",
      radius: 80,
      lat: undefined,
      lon: undefined
    })
  })

  // The map step is a pushed route, so hardware back pops it and leaves this screen mounted.
  // Nothing may reset the draft when it comes back into view with or without a centre.
  it("keeps the draft when the map step returns without a centre", async () => {
    const { getByTestId, getByText, rerender } = renderNew()

    await waitFor(() => {
      expect(getByTestId("geofence-name-input")).toBeTruthy()
    })

    fireEvent.changeText(getByTestId("geofence-name-input"), "Allotment")
    fireEvent.changeText(getByTestId("geofence-radius-input"), "80")

    rerender(<GeofenceEditorScreen navigation={mockNavigation as any} route={{ params: undefined } as any} />)

    expect(getByTestId("geofence-name-input").props.value).toBe("Allotment")
    expect(getByTestId("geofence-radius-input").props.value).toBe("80")
    expect(getByText("Tap to choose the centre")).toBeTruthy()
  })

  it("takes the centre the map step hands back without disturbing the draft", async () => {
    const { getByTestId, getByText, rerender } = renderNew()

    await waitFor(() => {
      expect(getByTestId("geofence-name-input")).toBeTruthy()
    })

    fireEvent.changeText(getByTestId("geofence-name-input"), "Allotment")
    fireEvent.changeText(getByTestId("geofence-radius-input"), "80")

    rerender(
      <GeofenceEditorScreen navigation={mockNavigation as any} route={{ params: { lat: 48.5, lon: 11.9 } } as any} />
    )

    await waitFor(() => {
      expect(getByText("48.500000, 11.900000")).toBeTruthy()
    })

    expect(getByTestId("geofence-name-input").props.value).toBe("Allotment")
    expect(getByTestId("geofence-radius-input").props.value).toBe("80")
  })

  // --- Save button state ---

  it("save button is disabled when editing with no changes", async () => {
    const { getByTestId } = renderEdit()

    await waitFor(() => {
      expect(getByTestId("geofence-name-input").props.value).toBe("Home")
    })

    expect(getByTestId("save-geofence-btn").props.accessibilityState.disabled).toBe(true)
  })

  it("save button enables after name change", async () => {
    const { getByTestId } = renderEdit()

    await waitFor(() => {
      expect(getByTestId("geofence-name-input").props.value).toBe("Home")
    })

    fireEvent.changeText(getByTestId("geofence-name-input"), "Home Updated")

    await waitFor(() => {
      expect(getByTestId("save-geofence-btn").props.accessibilityState.disabled).toBe(false)
    })
  })

  it("save button enables after toggling WiFi pause", async () => {
    const { getByTestId } = renderEdit()

    await waitFor(() => {
      expect(getByTestId("pause-wifi-toggle")).toBeTruthy()
    })

    fireEvent.press(getByTestId("pause-wifi-toggle"))

    await waitFor(() => {
      expect(getByTestId("save-geofence-btn").props.accessibilityState.disabled).toBe(false)
    })
  })

  it("save button enables after the zone is moved on the map", async () => {
    const { getByTestId, rerender } = renderEdit()

    await waitFor(() => {
      expect(getByTestId("geofence-name-input").props.value).toBe("Home")
    })

    rerender(
      <GeofenceEditorScreen
        navigation={mockNavigation as any}
        route={{ params: { geofenceId: 1, lat: 48.5, lon: 11.9 } } as any}
      />
    )

    await waitFor(() => {
      expect(getByTestId("save-geofence-btn").props.accessibilityState.disabled).toBe(false)
    })
  })

  it("save button is always enabled for new geofence", async () => {
    const { getByTestId } = renderNew()

    await waitFor(() => {
      expect(getByTestId("save-geofence-btn")).toBeTruthy()
    })

    expect(getByTestId("save-geofence-btn").props.accessibilityState.disabled).toBe(false)
  })

  // --- Delete button ---

  it("delete row is shown when editing", async () => {
    const { getByTestId } = renderEdit()

    await waitFor(() => {
      expect(getByTestId("delete-geofence-btn")).toBeTruthy()
    })
  })

  it("delete row is not shown for new geofence", async () => {
    const { queryByTestId } = renderNew()

    await waitFor(() => {
      expect(queryByTestId("delete-geofence-btn")).toBeNull()
    })
  })

  it("delete shows confirmation dialog", async () => {
    mockShowConfirm.mockResolvedValue(false)
    const { getByTestId } = renderEdit()

    await waitFor(() => {
      expect(getByTestId("delete-geofence-btn")).toBeTruthy()
    })

    fireEvent.press(getByTestId("delete-geofence-btn"))

    await waitFor(() => {
      expect(mockShowConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Delete zone",
          message: 'Delete "Home"?',
          confirmText: "Delete",
          destructive: true
        })
      )
    })

    expect(mockDeleteGeofence).not.toHaveBeenCalled()
  })

  it("calls deleteGeofence and navigates back after confirmation", async () => {
    const { getByTestId } = renderEdit()

    await waitFor(() => {
      expect(getByTestId("delete-geofence-btn")).toBeTruthy()
    })

    fireEvent.press(getByTestId("delete-geofence-btn"))

    await waitFor(() => {
      expect(mockDeleteGeofence).toHaveBeenCalledWith(1)
      expect(mockGoBack).toHaveBeenCalled()
    })
  })

  // --- Save flow ---

  it("calls updateGeofence with changed values on save", async () => {
    const { getByTestId } = renderEdit()

    await waitFor(() => {
      expect(getByTestId("geofence-name-input").props.value).toBe("Home")
    })

    fireEvent.changeText(getByTestId("geofence-name-input"), "Home Renamed")
    fireEvent.press(getByTestId("save-geofence-btn"))

    await waitFor(() => {
      expect(mockUpdateGeofence).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, name: "Home Renamed", lat: 48.1, lon: 11.5 })
      )
      expect(mockGoBack).toHaveBeenCalled()
    })
  })

  it("creates the zone from the draft and its placed centre", async () => {
    const { getByTestId } = renderNew({ lat: 48.5, lon: 11.9 })

    await waitFor(() => {
      expect(getByTestId("geofence-name-input")).toBeTruthy()
    })

    fireEvent.changeText(getByTestId("geofence-name-input"), "Allotment")
    fireEvent.press(getByTestId("save-geofence-btn"))

    await waitFor(() => {
      expect(mockCreateGeofence).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Allotment", lat: 48.5, lon: 11.9, radius: 50, enabled: true })
      )
      expect(mockGoBack).toHaveBeenCalled()
    })
  })

  // GeofenceScreen, DashboardScreen and DashboardMap only reload on this event, and creating
  // is this screen's job now, so a create that stays silent leaves all three stale.
  it("emits geofenceUpdated after a create", async () => {
    const listener = jest.fn()
    const subscription = DeviceEventEmitter.addListener("geofenceUpdated", listener)

    const { getByTestId } = renderNew({ lat: 48.5, lon: 11.9 })

    await waitFor(() => {
      expect(getByTestId("geofence-name-input")).toBeTruthy()
    })

    fireEvent.changeText(getByTestId("geofence-name-input"), "Allotment")
    fireEvent.press(getByTestId("save-geofence-btn"))

    await waitFor(() => {
      expect(listener).toHaveBeenCalled()
    })

    subscription.remove()
  })

  it("refuses to save a zone that was never placed", async () => {
    const { getByTestId } = renderNew()

    await waitFor(() => {
      expect(getByTestId("geofence-name-input")).toBeTruthy()
    })

    fireEvent.changeText(getByTestId("geofence-name-input"), "Allotment")
    fireEvent.press(getByTestId("save-geofence-btn"))

    await waitFor(() => {
      expect(mockShowAlert).toHaveBeenCalledWith("Missing location", "Place the zone on the map first.", "warning")
    })

    expect(mockCreateGeofence).not.toHaveBeenCalled()
  })
})
