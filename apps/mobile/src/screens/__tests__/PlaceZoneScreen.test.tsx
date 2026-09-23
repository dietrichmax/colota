import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { DEFAULT_MAP_ZOOM, WORLD_MAP_ZOOM } from "../../constants"

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: jest.requireActual("@colota/shared").lightColors })
}))

let mockTracking = true
let mockCoords: { latitude: number; longitude: number; accuracy: number } | null = null
jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({ tracking: mockTracking }),
  useCoords: () => mockCoords
}))

const mockGetMostRecentLocation = jest.fn()
jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getMostRecentLocation: (...args: any[]) => mockGetMostRecentLocation(...args)
  }
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    Button: ({ title, onPress, disabled }: any) =>
      R.createElement(
        Pressable,
        { testID: "use-location-btn", onPress, disabled, accessibilityState: { disabled } },
        R.createElement(Text, null, title)
      )
  }
})

const mockFlyTo = jest.fn()
const mockMapProps = jest.fn()
jest.mock("../../components/features/map/ColotaMapView", () => {
  const R = require("react")
  const { View, Pressable } = require("react-native")
  return {
    ColotaMapView: R.forwardRef((props: any, ref: any) => {
      R.useImperativeHandle(ref, () => ({ camera: { flyTo: mockFlyTo }, mapView: null }))
      mockMapProps(props)
      return R.createElement(
        View,
        { testID: "colota-map" },
        R.createElement(Pressable, {
          testID: "map-press",
          onPress: () => props.onPress?.({ latitude: 48.1, longitude: 11.6 })
        }),
        props.children
      )
    })
  }
})

jest.mock("../../components/features/map/GeofenceLayers", () => ({
  GeofenceLayers: () => null
}))

jest.mock("../../components/features/map/UserLocationOverlay", () => {
  const R = require("react")
  const { View } = require("react-native")
  return { UserLocationOverlay: (props: any) => R.createElement(View, { testID: "user-location-overlay", ...props }) }
})

jest.mock("../../components/features/map/MapActionButton", () => {
  const R = require("react")
  const { Pressable } = require("react-native")
  return {
    MapActionButton: (props: any) =>
      R.createElement(Pressable, {
        testID: props.testID,
        accessibilityLabel: props.accessibilityLabel,
        onPress: props.onPress
      }),
    mapActionStyles: { right: {} }
  }
})

import { PlaceZoneScreen } from "../PlaceZoneScreen"
import { formatShortDistance } from "../../utils/geo"

const LIVE_FIX = { latitude: 52.5, longitude: 13.4, accuracy: 20 }

function renderScreen(params: any = { name: "Home", radius: 100 }) {
  const popTo = jest.fn()
  const view = render(<PlaceZoneScreen navigation={{ popTo } as any} route={{ params } as any} />)
  return { ...view, popTo }
}

const lastMapProps = () => mockMapProps.mock.calls[mockMapProps.mock.calls.length - 1][0]

beforeEach(() => {
  jest.clearAllMocks()
  mockTracking = true
  mockCoords = LIVE_FIX
  mockGetMostRecentLocation.mockResolvedValue(null)
})

describe("PlaceZoneScreen", () => {
  it("cannot confirm until somewhere is picked", () => {
    const { getByTestId, getByText } = renderScreen()

    expect(getByTestId("use-location-btn").props.accessibilityState.disabled).toBe(true)
    expect(getByText("Tap the map to place the zone")).toBeTruthy()
  })

  it("reads the picked point back with the radius it will have", () => {
    const { getByTestId, getByText } = renderScreen()

    fireEvent.press(getByTestId("map-press"))

    expect(getByText(`48.10000, 11.60000 · ${formatShortDistance(100)} radius`)).toBeTruthy()
  })

  it("merges the coordinate into the editor rather than opening a second one", () => {
    const { getByTestId, popTo } = renderScreen()

    fireEvent.press(getByTestId("map-press"))
    fireEvent.press(getByTestId("use-location-btn"))

    expect(popTo).toHaveBeenCalledWith("Geofence Editor", { lat: 48.1, lon: 11.6 }, { merge: true })
  })

  it("opens on the zone being edited, not the user, when it already has a place", () => {
    const { getByText } = renderScreen({ name: "Home", radius: 50, lat: 40.7, lon: -74 })

    expect(getByText(`40.70000, -74.00000 · ${formatShortDistance(50)} radius`)).toBeTruthy()
    expect(lastMapProps().initialCenter).toEqual([-74, 40.7])
  })

  it("marks where the user stands while tracking, so the zone is placed against a position and not a guess", () => {
    const { getByTestId } = renderScreen()

    const dot = getByTestId("user-location-overlay")
    expect(dot.props.coords).toEqual(LIVE_FIX)
    expect(dot.props.isPaused).toBe(false)
    expect(lastMapProps().initialCenter).toEqual([13.4, 52.5])
    expect(mockGetMostRecentLocation).not.toHaveBeenCalled()
  })

  it("places the zone at the live fix in one tap and confirms that coordinate", () => {
    const { getByTestId, getByText, popTo } = renderScreen()

    fireEvent.press(getByTestId("place-at-fix-btn"))

    expect(getByText(`52.50000, 13.40000 · ${formatShortDistance(100)} radius`)).toBeTruthy()
    expect(mockFlyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [13.4, 52.5] }))

    fireEvent.press(getByTestId("use-location-btn"))
    expect(popTo).toHaveBeenCalledWith("Geofence Editor", { lat: 52.5, lon: 13.4 }, { merge: true })
  })

  it("greys the last recorded fix while tracking is off and never offers to place the zone on it, since it may be a city away", async () => {
    mockTracking = false
    mockGetMostRecentLocation.mockResolvedValue({ latitude: 48.2, longitude: 16.37, accuracy: 12 })

    const { findByTestId, queryByTestId } = renderScreen()

    const dot = await findByTestId("user-location-overlay")
    expect(dot.props.isPaused).toBe(true)
    expect(dot.props.coords).toEqual({ latitude: 48.2, longitude: 16.37, accuracy: 0 })
    expect(lastMapProps().initialCenter).toEqual([16.37, 48.2])
    expect(queryByTestId("place-at-fix-btn")).toBeNull()
  })

  it("draws no map until the saved fix is read, so it never opens on the ocean and jumps", async () => {
    mockTracking = false
    let resolve: (v: any) => void = () => {}
    mockGetMostRecentLocation.mockReturnValue(new Promise((r) => (resolve = r)))

    const { queryByTestId, findByTestId } = renderScreen()
    expect(queryByTestId("colota-map")).toBeNull()

    resolve({ latitude: 48.2, longitude: 16.37 })

    await findByTestId("colota-map")
    expect(mockMapProps.mock.calls[0][0].initialCenter).toEqual([16.37, 48.2])
    expect(mockMapProps.mock.calls[0][0].initialZoom).toBe(DEFAULT_MAP_ZOOM)
  })

  it("opens on the whole world rather than a street-level patch of sea when there is no fix at all", async () => {
    mockTracking = false
    mockCoords = null

    const { findByTestId, queryByTestId } = renderScreen()

    await findByTestId("colota-map")
    expect(lastMapProps().initialZoom).toBe(WORLD_MAP_ZOOM)
    expect(queryByTestId("user-location-overlay")).toBeNull()
  })

  it("still opens the map when the saved fix cannot be read", async () => {
    mockTracking = false
    mockGetMostRecentLocation.mockRejectedValue(new Error("db closed"))

    const { findByTestId } = renderScreen()

    await findByTestId("colota-map")
    await waitFor(() => expect(lastMapProps().initialZoom).toBe(WORLD_MAP_ZOOM))
  })
})
