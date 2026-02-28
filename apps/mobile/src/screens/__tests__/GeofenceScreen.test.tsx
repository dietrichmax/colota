import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { Geofence } from "../../types/global"

// --- Mocks ---

jest.mock("@maplibre/maplibre-react-native", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    __esModule: true,
    default: { setAccessToken: jest.fn() },
    MapView: (props: any) => R.createElement(View, { testID: "mapview", ...props }),
    Camera: () => null,
    ShapeSource: ({ children }: any) => children,
    FillLayer: () => null,
    LineLayer: () => null,
    SymbolLayer: () => null,
    CircleLayer: () => null,
    MarkerView: ({ children }: any) => children
  }
})

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn()
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
      text: "#000",
      textSecondary: "#6b7280",
      textDisabled: "#d1d5db",
      card: "#fff",
      warning: "#f59e0b",
      info: "#3b82f6",
      background: "#fff",
      border: "#e5e7eb",
      borderRadius: 12,
      success: "#22c55e",
      error: "#ef4444",
      link: "#0d9488",
      textLight: "#9ca3af",
      textOnPrimary: "#fff",
      placeholder: "#d1d5db",
      primaryDark: "#0d9488",
      backgroundElevated: "#f9fafb",
      surface: "#fff",
      overlay: "rgba(0,0,0,0.5)"
    },
    mode: "light"
  })
}))

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({ tracking: true }),
  useCoords: () => ({ latitude: 48.1, longitude: 11.5, accuracy: 10 })
}))

const mockGetGeofences = jest.fn().mockResolvedValue([])
const mockCreateGeofence = jest.fn().mockResolvedValue(undefined)
const mockUpdateGeofence = jest.fn().mockResolvedValue(undefined)
const mockDeleteGeofence = jest.fn().mockResolvedValue(undefined)
const mockCheckCurrentPauseZone = jest.fn().mockResolvedValue(null)
const mockIsNetworkAvailable = jest.fn().mockResolvedValue(true)
const mockRecheckZoneSettings = jest.fn().mockResolvedValue(undefined)
const mockGetMostRecentLocation = jest.fn().mockResolvedValue(null)

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getGeofences: (...args: any[]) => mockGetGeofences(...args),
    createGeofence: (...args: any[]) => mockCreateGeofence(...args),
    updateGeofence: (...args: any[]) => mockUpdateGeofence(...args),
    deleteGeofence: (...args: any[]) => mockDeleteGeofence(...args),
    checkCurrentPauseZone: (...args: any[]) => mockCheckCurrentPauseZone(...args),
    isNetworkAvailable: (...args: any[]) => mockIsNetworkAvailable(...args),
    recheckZoneSettings: (...args: any[]) => mockRecheckZoneSettings(...args),
    getMostRecentLocation: (...args: any[]) => mockGetMostRecentLocation(...args)
  }
}))

const mockShowAlert = jest.fn()
const mockShowConfirm = jest.fn().mockResolvedValue(true)

jest.mock("../../services/modalService", () => ({
  showAlert: (...args: any[]) => mockShowAlert(...args),
  showConfirm: (...args: any[]) => mockShowConfirm(...args)
}))

jest.mock("../../components/features/map/ColotaMapView", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    ColotaMapView: R.forwardRef(({ children }: any, _ref: any) =>
      R.createElement(View, { testID: "colota-map" }, children)
    )
  }
})

jest.mock("../../components/features/map/GeofenceLayers", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    GeofenceLayers: () => R.createElement(View, { testID: "geofence-layers" })
  }
})

jest.mock("../../components/features/map/UserLocationOverlay", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    UserLocationOverlay: () => R.createElement(View, { testID: "user-location-overlay" })
  }
})

jest.mock("../../components/features/map/MapCenterButton", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    MapCenterButton: () => R.createElement(View, { testID: "center-button" })
  }
})

jest.mock("../../components/features/map/mapUtils", () => ({
  buildGeofencesGeoJSON: jest.fn().mockReturnValue({ fills: null, labels: null })
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children, style }: any) => R.createElement(View, { style }, children)
  }
})

jest.mock("../../assets/icons/icon.png", () => "mock-icon")

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const { Text } = require("react-native")
  return {
    X: (props: any) => R.createElement(Text, props, "X"),
    WifiOff: (props: any) => R.createElement(Text, props, "WifiOff")
  }
})

jest.mock("../../utils/logger", () => ({
  logger: { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }
}))

import { GeofenceScreen } from "../GeofenceScreen"

// --- Test data ---

const mockGeofences: Geofence[] = [
  {
    id: 1,
    name: "Home",
    lat: 48.1,
    lon: 11.5,
    radius: 100,
    enabled: true,
    pauseTracking: true
  },
  {
    id: 2,
    name: "Office",
    lat: 48.2,
    lon: 11.6,
    radius: 200,
    enabled: true,
    pauseTracking: false
  }
]

// --- Tests ---

describe("GeofenceScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetGeofences.mockResolvedValue([])
    mockShowConfirm.mockResolvedValue(true)
  })

  function renderScreen() {
    return render(<GeofenceScreen navigation={{} as any} />)
  }

  it("shows empty state when no geofences exist", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("No geofences yet")).toBeTruthy()
    })
  })

  it("renders geofence list with name and radius", async () => {
    mockGetGeofences.mockResolvedValue(mockGeofences)

    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Home")).toBeTruthy()
      expect(getByText("100m radius")).toBeTruthy()
      expect(getByText("Office")).toBeTruthy()
      expect(getByText("200m radius")).toBeTruthy()
    })
  })

  it("shows validation alert when name is empty", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Place Geofence")).toBeTruthy()
    })

    fireEvent.press(getByText("Place Geofence"))

    expect(mockShowAlert).toHaveBeenCalledWith("Missing Name", "Please enter a name.", "warning")
  })

  it("shows validation alert when radius is invalid (0 or negative)", async () => {
    const { getByText, getByPlaceholderText, getByDisplayValue } = renderScreen()

    await waitFor(() => {
      expect(getByText("Place Geofence")).toBeTruthy()
    })

    fireEvent.changeText(getByPlaceholderText("Home, Office..."), "Test Zone")
    fireEvent.changeText(getByDisplayValue("50"), "0")
    fireEvent.press(getByText("Place Geofence"))

    expect(mockShowAlert).toHaveBeenCalledWith("Invalid Radius", "Please enter a valid radius.", "warning")
  })

  it("enters placing mode on valid name and radius", async () => {
    const { getByText, getByPlaceholderText, getByDisplayValue } = renderScreen()

    await waitFor(() => {
      expect(getByText("Place Geofence")).toBeTruthy()
    })

    fireEvent.changeText(getByPlaceholderText("Home, Office..."), "Test Zone")
    fireEvent.changeText(getByDisplayValue("50"), "100")
    fireEvent.press(getByText("Place Geofence"))

    expect(mockShowAlert).not.toHaveBeenCalled()
    expect(getByText("Tap Map to Place...")).toBeTruthy()
  })

  it("toggles pause tracking on a geofence", async () => {
    mockGetGeofences.mockResolvedValue(mockGeofences)

    const { getAllByRole } = renderScreen()

    await waitFor(() => {
      expect(getAllByRole("switch").length).toBeGreaterThanOrEqual(2)
    })

    const switches = getAllByRole("switch")
    // The second geofence (Office) has pauseTracking: false, toggle it on
    fireEvent(switches[1], "onValueChange", true)

    await waitFor(() => {
      expect(mockUpdateGeofence).toHaveBeenCalledWith({ id: 2, pauseTracking: true })
    })

    await waitFor(() => {
      expect(mockRecheckZoneSettings).toHaveBeenCalled()
    })
  })

  it("shows delete confirmation dialog", async () => {
    mockGetGeofences.mockResolvedValue(mockGeofences)
    mockShowConfirm.mockResolvedValue(false)

    const { getAllByText } = renderScreen()

    await waitFor(() => {
      expect(getAllByText("X").length).toBeGreaterThanOrEqual(1)
    })

    // Press the first delete button (X icon)
    fireEvent.press(getAllByText("X")[0])

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
  })

  it("deletes geofence after confirmation", async () => {
    mockGetGeofences.mockResolvedValue(mockGeofences)
    mockShowConfirm.mockResolvedValue(true)

    const { getAllByText } = renderScreen()

    await waitFor(() => {
      expect(getAllByText("X").length).toBeGreaterThanOrEqual(1)
    })

    // Press the first delete button (X icon)
    fireEvent.press(getAllByText("X")[0])

    await waitFor(() => {
      expect(mockShowConfirm).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(mockDeleteGeofence).toHaveBeenCalledWith(1)
    })
  })
})
