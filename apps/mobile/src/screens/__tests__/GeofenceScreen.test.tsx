import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { Share } from "react-native"
import { Geofence } from "../../types/global"

// --- Mocks ---

jest.mock("@maplibre/maplibre-react-native", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    __esModule: true,
    Map: (props: any) => R.createElement(View, { testID: "mapview", ...props }),
    Camera: () => null,
    GeoJSONSource: ({ children }: any) => children,
    Layer: () => null,
    Marker: ({ children }: any) => children
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
    getMostRecentLocation: (...args: any[]) => mockGetMostRecentLocation(...args),
    getSetting: jest.fn().mockResolvedValue(null)
  }
}))

const mockShowAlert = jest.fn()

jest.mock("../../services/modalService", () => ({
  showAlert: (...args: any[]) => mockShowAlert(...args)
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
    ChevronRight: (props: any) => R.createElement(Text, props, "ChevronRight"),
    Wifi: (props: any) => R.createElement(Text, props, "Wifi"),
    PersonStanding: (props: any) => R.createElement(Text, props, "PersonStanding"),
    MapPinHouse: (props: any) => R.createElement(Text, props, "MapPinHouse"),
    Share2: (props: any) => R.createElement(Text, props, "Share2")
  }
})

jest.mock("../../utils/logger", () => ({
  logger: { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }
}))

jest.mock("../../utils/geo", () => ({
  formatShortDistance: (meters: number) => `${Math.round(meters)}m`,
  shortDistanceUnit: () => "m",
  inputToMeters: (value: number) => value
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
    pauseTracking: true,
    pauseOnWifi: false,
    pauseOnMotionless: false,
    motionlessTimeoutMinutes: 10,
    heartbeatEnabled: false,
    heartbeatIntervalMinutes: 15
  },
  {
    id: 2,
    name: "Office",
    lat: 48.2,
    lon: 11.6,
    radius: 200,
    enabled: true,
    pauseTracking: false,
    pauseOnWifi: false,
    pauseOnMotionless: false,
    motionlessTimeoutMinutes: 10,
    heartbeatEnabled: false,
    heartbeatIntervalMinutes: 15
  }
]

// --- Tests ---

describe("GeofenceScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetGeofences.mockResolvedValue([])
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

    fireEvent.changeText(getByPlaceholderText("Home, Work..."), "Test Zone")
    fireEvent.changeText(getByDisplayValue("50"), "0")
    fireEvent.press(getByText("Place Geofence"))

    expect(mockShowAlert).toHaveBeenCalledWith("Invalid Radius", "Please enter a valid radius.", "warning")
  })

  it("enters placing mode on valid name and radius", async () => {
    const { getByText, getByPlaceholderText, getByDisplayValue } = renderScreen()

    await waitFor(() => {
      expect(getByText("Place Geofence")).toBeTruthy()
    })

    fireEvent.changeText(getByPlaceholderText("Home, Work..."), "Test Zone")
    fireEvent.changeText(getByDisplayValue("50"), "100")
    fireEvent.press(getByText("Place Geofence"))

    expect(mockShowAlert).not.toHaveBeenCalled()
    expect(getByText("Tap Map to Place...")).toBeTruthy()
  })

  it("tapping ChevronRight navigates to editor with geofence id", async () => {
    mockGetGeofences.mockResolvedValue(mockGeofences)
    const mockNavigate = jest.fn()

    const { getAllByText } = render(<GeofenceScreen navigation={{ navigate: mockNavigate } as any} />)

    await waitFor(() => {
      expect(getAllByText("ChevronRight").length).toBeGreaterThanOrEqual(1)
    })

    fireEvent.press(getAllByText("ChevronRight")[0])

    expect(mockNavigate).toHaveBeenCalledWith("Geofence Editor", { geofenceId: 1 })
  })

  describe("share geofences", () => {
    let shareSpy: jest.SpyInstance

    beforeEach(() => {
      shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" })
    })

    afterEach(() => {
      shareSpy.mockRestore()
    })

    it("does not render the share button when there are no geofences", async () => {
      const { queryByTestId, getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("No geofences yet")).toBeTruthy()
      })

      expect(queryByTestId("share-geofences-btn")).toBeNull()
    })

    it("renders the share button when at least one geofence exists", async () => {
      mockGetGeofences.mockResolvedValue(mockGeofences)
      const { getByTestId } = renderScreen()

      await waitFor(() => {
        expect(getByTestId("share-geofences-btn")).toBeTruthy()
      })
    })

    it("opens the share sheet with a colota://setup link on press", async () => {
      mockGetGeofences.mockResolvedValue(mockGeofences)
      const { getByTestId } = renderScreen()

      await waitFor(() => {
        expect(getByTestId("share-geofences-btn")).toBeTruthy()
      })

      fireEvent.press(getByTestId("share-geofences-btn"))

      await waitFor(() => {
        expect(shareSpy).toHaveBeenCalledTimes(1)
      })

      const arg = shareSpy.mock.calls[0][0]
      expect(arg.message).toMatch(/^colota:\/\/setup\?config=/)
    })

    it("encodes geofences without id, createdAt, or enabled fields", async () => {
      mockGetGeofences.mockResolvedValue(mockGeofences)
      const { getByTestId } = renderScreen()

      await waitFor(() => {
        expect(getByTestId("share-geofences-btn")).toBeTruthy()
      })

      fireEvent.press(getByTestId("share-geofences-btn"))

      await waitFor(() => {
        expect(shareSpy).toHaveBeenCalledTimes(1)
      })

      const link = shareSpy.mock.calls[0][0].message as string
      const encoded = link.split("config=")[1]
      const decoded = JSON.parse(atob(encoded))

      expect(decoded.geofences).toHaveLength(2)
      expect(decoded.geofences[0]).toEqual({
        name: "Home",
        lat: 48.1,
        lon: 11.5,
        radius: 100,
        pauseTracking: true,
        pauseOnWifi: false,
        pauseOnMotionless: false,
        motionlessTimeoutMinutes: 10,
        heartbeatEnabled: false,
        heartbeatIntervalMinutes: 15
      })
      expect(decoded.geofences[0]).not.toHaveProperty("id")
      expect(decoded.geofences[0]).not.toHaveProperty("createdAt")
      expect(decoded.geofences[0]).not.toHaveProperty("enabled")
    })

    it("shows an error alert when sharing fails", async () => {
      mockGetGeofences.mockResolvedValue(mockGeofences)
      shareSpy.mockRejectedValueOnce(new Error("share failed"))

      const { getByTestId } = renderScreen()

      await waitFor(() => {
        expect(getByTestId("share-geofences-btn")).toBeTruthy()
      })

      fireEvent.press(getByTestId("share-geofences-btn"))

      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalledWith("Error", "Failed to share geofences.", "error")
      })
    })
  })
})
