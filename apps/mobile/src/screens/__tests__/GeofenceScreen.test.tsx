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
    colors: require("@colota/shared").lightColors,
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
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    Card: ({ children, style }: any) => R.createElement(View, { style }, children),
    Divider: () => R.createElement(View, { testID: "divider" }),
    SectionTitle: ({ children, caption }: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Text, null, children),
        caption && R.createElement(Text, null, caption)
      ),
    ListItem: ({ label, sub, value, dot, onPress, testID }: any) =>
      R.createElement(
        Pressable,
        { testID, onPress },
        R.createElement(Text, { testID: testID ? `${testID}-dot` : undefined }, dot),
        R.createElement(Text, null, label),
        sub && R.createElement(Text, null, sub),
        value && R.createElement(Text, null, value)
      ),
    EmptyState: ({ title, message, actionLabel, onActionPress, testID }: any) =>
      R.createElement(
        View,
        { testID },
        R.createElement(Text, null, title),
        R.createElement(Text, null, message),
        actionLabel &&
          R.createElement(
            Pressable,
            { testID: "empty-action-btn", onPress: onActionPress },
            R.createElement(Text, null, actionLabel)
          )
      )
  }
})

jest.mock("../../assets/icons/icon.png", () => "mock-icon")

jest.mock("../../utils/logger", () => ({
  logger: { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }
}))

jest.mock("../../utils/geo", () => ({
  formatShortDistance: (meters: number) => `${Math.round(meters)}m`,
  shortDistanceUnit: () => "m",
  inputToMeters: (value: number) => value
}))

import { GeofenceScreen } from "../GeofenceScreen"
import { lightColors } from "@colota/shared"

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
  const mockNavigate = jest.fn()
  const mockSetOptions = jest.fn()
  const mockNavigation = { navigate: mockNavigate, setOptions: mockSetOptions }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetGeofences.mockResolvedValue([])
  })

  function renderScreen() {
    return render(<GeofenceScreen navigation={mockNavigation as any} />)
  }

  /** headerRight is a render prop, so the header controls only exist once it is called. */
  function renderHeader() {
    const headerRight = mockSetOptions.mock.calls.at(-1)?.[0]?.headerRight
    return render(headerRight())
  }

  it("shows the empty state when no zones exist", async () => {
    const { getByTestId, getByText } = renderScreen()

    await waitFor(() => {
      expect(getByTestId("geofences-empty")).toBeTruthy()
    })

    expect(getByText("No zones yet")).toBeTruthy()
  })

  it("opens the editor on an empty draft from the empty state", async () => {
    const { getByTestId } = renderScreen()

    await waitFor(() => {
      expect(getByTestId("empty-action-btn")).toBeTruthy()
    })

    fireEvent.press(getByTestId("empty-action-btn"))

    expect(mockNavigate).toHaveBeenCalledWith("Geofence Editor")
  })

  // The create form moved into the editor, so nothing on this screen may take a zone's fields.
  it("holds no create form", async () => {
    mockGetGeofences.mockResolvedValue(mockGeofences)
    const { queryByTestId, getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Home")).toBeTruthy()
    })

    expect(queryByTestId("geofence-name-input")).toBeNull()
    expect(queryByTestId("geofence-radius-input")).toBeNull()
    expect(queryByTestId("place-geofence-btn")).toBeNull()
    expect(mockCreateGeofence).not.toHaveBeenCalled()
  })

  it("renders a row per zone with the radius and what the zone does", async () => {
    mockGetGeofences.mockResolvedValue(mockGeofences)

    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Home")).toBeTruthy()
    })

    expect(getByText("100m")).toBeTruthy()
    expect(getByText("No recording in the zone")).toBeTruthy()
    expect(getByText("Office")).toBeTruthy()
    expect(getByText("200m")).toBeTruthy()
    expect(getByText("Recording continues here")).toBeTruthy()
    expect(getByText("2 zones")).toBeTruthy()
  })

  // The dot repeats the map's own fill rule, so a row reads as the zone it points at.
  it("marks a pause zone and a plain zone with the colours the map draws them in", async () => {
    mockGetGeofences.mockResolvedValue(mockGeofences)

    const { getByTestId } = renderScreen()

    await waitFor(() => {
      expect(getByTestId("edit-geofence-1-dot")).toBeTruthy()
    })

    expect(getByTestId("edit-geofence-1-dot").props.children).toBe(lightColors.warning)
    expect(getByTestId("edit-geofence-2-dot").props.children).toBe(lightColors.info)
  })

  it("says which zone is holding tracking paused right now", async () => {
    mockGetGeofences.mockResolvedValue(mockGeofences)
    mockCheckCurrentPauseZone.mockResolvedValue({ zoneName: "Home" })

    const { getByText } = renderScreen()

    await waitFor(() => {
      expect(getByText("Paused here now")).toBeTruthy()
    })
  })

  it("opens the editor for the tapped zone", async () => {
    mockGetGeofences.mockResolvedValue(mockGeofences)

    const { getByTestId } = renderScreen()

    await waitFor(() => {
      expect(getByTestId("edit-geofence-1")).toBeTruthy()
    })

    fireEvent.press(getByTestId("edit-geofence-1"))

    expect(mockNavigate).toHaveBeenCalledWith("Geofence Editor", { geofenceId: 1 })
  })

  describe("header actions", () => {
    it("opens the editor on an empty draft from the header", async () => {
      const { getByTestId } = renderScreen()

      await waitFor(() => {
        expect(getByTestId("geofences-empty")).toBeTruthy()
      })

      fireEvent.press(renderHeader().getByTestId("new-geofence-btn"))

      expect(mockNavigate).toHaveBeenCalledWith("Geofence Editor")
    })

    it("offers no share control while there is nothing to share", async () => {
      const { getByTestId } = renderScreen()

      await waitFor(() => {
        expect(getByTestId("geofences-empty")).toBeTruthy()
      })

      expect(renderHeader().queryByTestId("share-geofences-btn")).toBeNull()
    })
  })

  describe("share geofences", () => {
    let shareSpy: jest.SpyInstance

    beforeEach(() => {
      shareSpy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction", activityType: undefined })
    })

    afterEach(() => {
      shareSpy.mockRestore()
    })

    it("renders the share button when at least one geofence exists", async () => {
      mockGetGeofences.mockResolvedValue(mockGeofences)
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("Home")).toBeTruthy()
      })

      expect(renderHeader().getByTestId("share-geofences-btn")).toBeTruthy()
    })

    it("opens the share sheet with a colota://setup link on press", async () => {
      mockGetGeofences.mockResolvedValue(mockGeofences)
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("Home")).toBeTruthy()
      })

      fireEvent.press(renderHeader().getByTestId("share-geofences-btn"))

      await waitFor(() => {
        expect(shareSpy).toHaveBeenCalledTimes(1)
      })

      const arg = shareSpy.mock.calls[0][0]
      expect(arg.message).toMatch(/^colota:\/\/setup\?config=/)
    })

    it("encodes geofences without id, createdAt, or enabled fields", async () => {
      mockGetGeofences.mockResolvedValue(mockGeofences)
      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("Home")).toBeTruthy()
      })

      fireEvent.press(renderHeader().getByTestId("share-geofences-btn"))

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

      const { getByText } = renderScreen()

      await waitFor(() => {
        expect(getByText("Home")).toBeTruthy()
      })

      fireEvent.press(renderHeader().getByTestId("share-geofences-btn"))

      await waitFor(() => {
        expect(mockShowAlert).toHaveBeenCalledWith(
          "Share failed",
          "Unable to share your zones. Please try again.",
          "error"
        )
      })
    })
  })
})
