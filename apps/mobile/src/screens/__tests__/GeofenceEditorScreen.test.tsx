/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { Geofence } from "../../types/global"

// --- Mocks ---

const mockGetGeofences = jest.fn()
const mockUpdateGeofence = jest.fn().mockResolvedValue(true)
const mockDeleteGeofence = jest.fn().mockResolvedValue(true)

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getGeofences: (...args: any[]) => mockGetGeofences(...args),
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

jest.spyOn(require("react-native").InteractionManager, "runAfterInteractions").mockImplementation((task: any) => {
  if (typeof task === "function") task()
  else if (task?.run) task.run()
  return { cancel: jest.fn(), done: Promise.resolve() }
})

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
      primaryDark: "#0d9488",
      border: "#e5e7eb",
      text: "#000",
      textSecondary: "#6b7280",
      textDisabled: "#d1d5db",
      textLight: "#9ca3af",
      textOnPrimary: "#fff",
      background: "#fff",
      card: "#fff",
      error: "#ef4444",
      warning: "#f59e0b",
      success: "#22c55e",
      placeholder: "#9ca3af",
      borderRadius: 12,
      pressedOpacity: 0.7
    }
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
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    SettingRow: ({ label, children }: any) => R.createElement(View, null, R.createElement(Text, null, label), children),
    Button: ({ title, onPress, disabled }: any) =>
      R.createElement(
        Pressable,
        {
          onPress,
          testID: `btn-${title.replace(/\s+/g, "-").toLowerCase()}`,
          accessibilityState: { disabled: !!disabled }
        },
        R.createElement(Text, null, title)
      )
  }
})

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const { Text } = require("react-native")
  return {
    Check: (props: any) => R.createElement(Text, props, "Check"),
    Trash2: (props: any) => R.createElement(Text, props, "Trash2")
  }
})

const mockGoBack = jest.fn()
const mockNavigation = { goBack: mockGoBack }

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
  })

  function renderEdit(geofenceId = 1) {
    return render(<GeofenceEditorScreen navigation={mockNavigation as any} route={{ params: { geofenceId } } as any} />)
  }

  function renderNew() {
    return render(
      <GeofenceEditorScreen
        navigation={mockNavigation as any}
        route={{ params: { lat: 48.1, lon: 11.5, name: "New Zone", radius: 50 } } as any}
      />
    )
  }

  // --- Save button state ---

  it("save button is disabled when editing with no changes", async () => {
    const { getByTestId } = renderEdit()

    await waitFor(() => {
      expect(getByTestId("btn-save-geofence")).toBeTruthy()
    })

    expect(getByTestId("btn-save-geofence").props.accessibilityState.disabled).toBe(true)
  })

  it("save button enables after name change", async () => {
    const { getByTestId, getByDisplayValue } = renderEdit()

    await waitFor(() => {
      expect(getByDisplayValue("Home")).toBeTruthy()
    })

    fireEvent.changeText(getByDisplayValue("Home"), "Home Updated")

    await waitFor(() => {
      expect(getByTestId("btn-save-geofence").props.accessibilityState.disabled).toBe(false)
    })
  })

  it("save button enables after toggling WiFi pause", async () => {
    const { getByTestId } = renderEdit()

    await waitFor(() => {
      expect(getByTestId("pause-wifi-toggle")).toBeTruthy()
    })

    fireEvent(getByTestId("pause-wifi-toggle"), "onValueChange", true)

    await waitFor(() => {
      expect(getByTestId("btn-save-geofence").props.accessibilityState.disabled).toBe(false)
    })
  })

  it("save button is always enabled for new geofence", async () => {
    const { getByTestId } = renderNew()

    await waitFor(() => {
      expect(getByTestId("btn-save-geofence")).toBeTruthy()
    })

    expect(getByTestId("btn-save-geofence").props.accessibilityState.disabled).toBe(false)
  })

  // --- Delete button ---

  it("delete button is shown when editing", async () => {
    const { getByTestId } = renderEdit()

    await waitFor(() => {
      expect(getByTestId("btn-delete-geofence")).toBeTruthy()
    })
  })

  it("delete button is not shown for new geofence", async () => {
    const { queryByTestId } = renderNew()

    await waitFor(() => {
      expect(queryByTestId("btn-delete-geofence")).toBeNull()
    })
  })

  it("delete shows confirmation dialog", async () => {
    mockShowConfirm.mockResolvedValue(false)
    const { getByTestId } = renderEdit()

    await waitFor(() => {
      expect(getByTestId("btn-delete-geofence")).toBeTruthy()
    })

    fireEvent.press(getByTestId("btn-delete-geofence"))

    await waitFor(() => {
      expect(mockShowConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Delete Geofence",
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
      expect(getByTestId("btn-delete-geofence")).toBeTruthy()
    })

    fireEvent.press(getByTestId("btn-delete-geofence"))

    await waitFor(() => {
      expect(mockDeleteGeofence).toHaveBeenCalledWith(1)
      expect(mockGoBack).toHaveBeenCalled()
    })
  })

  // --- Save flow ---

  it("calls updateGeofence with changed values on save", async () => {
    const { getByTestId, getByDisplayValue } = renderEdit()

    await waitFor(() => {
      expect(getByDisplayValue("Home")).toBeTruthy()
    })

    fireEvent.changeText(getByDisplayValue("Home"), "Home Renamed")
    fireEvent.press(getByTestId("btn-save-geofence"))

    await waitFor(() => {
      expect(mockUpdateGeofence).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: "Home Renamed" }))
      expect(mockGoBack).toHaveBeenCalled()
    })
  })
})
