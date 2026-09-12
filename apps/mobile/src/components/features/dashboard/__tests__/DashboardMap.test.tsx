import React from "react"
import { render, act, waitFor } from "@testing-library/react-native"
import { StyleSheet } from "react-native"
import {
  DEFAULT_MAP_ZOOM,
  GEOFENCE_ZOOM_PADDING,
  MAP_ANIMATION_DURATION_MS,
  WORLD_MAP_ZOOM,
  size,
  space
} from "../../../../constants"

const mockSetStop = jest.fn()
const mockFitBounds = jest.fn()
const mockEaseTo = jest.fn()
const mockFlyTo = jest.fn()
const mockMapProps = jest.fn()

jest.mock("../../map/ColotaMapView", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    __esModule: true,
    ColotaMapView: R.forwardRef(function MockColotaMapView(props: any, ref: any) {
      R.useImperativeHandle(ref, () => ({
        camera: { setStop: mockSetStop, fitBounds: mockFitBounds, easeTo: mockEaseTo, flyTo: mockFlyTo },
        mapView: null
      }))
      mockMapProps(props)
      return R.createElement(View, { testID: "ColotaMapView", ...props }, props.children)
    })
  }
})

jest.mock("@maplibre/maplibre-react-native", () => {
  const R = require("react")
  const { View } = require("react-native")
  const stub = (name: string) => {
    const Stub = (props: any) => R.createElement(View, { testID: props.id ?? name }, props.children)
    Stub.displayName = name
    return Stub
  }
  return { GeoJSONSource: stub("GeoJSONSource"), Layer: stub("Layer"), Marker: stub("Marker") }
})

jest.mock("../../map/UserLocationOverlay", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    UserLocationOverlay: (props: any) => R.createElement(View, { testID: "user-dot", ...props })
  }
})

jest.mock("../../map/MapCenterButton", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    MapCenterButton: (props: any) => R.createElement(View, { testID: "center-button", ...props })
  }
})

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors, mode: "light" })
}))

const mockGetGeofences = jest.fn()
const mockGetLocationsByDateRange = jest.fn()
jest.mock("../../../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getGeofences: (...args: unknown[]) => mockGetGeofences(...args),
    getLocationsByDateRange: (...args: unknown[]) => mockGetLocationsByDateRange(...args),
    getSetting: jest.fn().mockResolvedValue(null)
  }
}))

let mockCoords: { latitude: number; longitude: number; accuracy: number } | null = null
jest.mock("../../../../contexts/TrackingProvider", () => ({
  useCoords: () => mockCoords
}))

let mockTrack: { latitude: number; longitude: number }[] = []
const mockUseTodayTrack = jest.fn()
jest.mock("../../../../hooks/useTodayTrack", () => ({
  useTodayTrack: (...args: unknown[]) => mockUseTodayTrack(...args)
}))

import { DashboardMap } from "../DashboardMap"

const padding = { top: 40, right: 64, bottom: 260, left: 16 }
const controlsBottom = 224
const controlsEnd = 16
const lastKnown = { latitude: 48.1, longitude: 11.5, accuracy: 12, timestamp: 1_700_000_000 }
const homeZone = {
  id: 1,
  name: "Home",
  lat: 48.1,
  lon: 11.5,
  radius: 200,
  enabled: true,
  pauseTracking: true,
  pauseOnWifi: false,
  pauseOnMotionless: false,
  motionlessTimeoutMinutes: 5,
  heartbeatEnabled: false,
  heartbeatIntervalMinutes: 15
}

const baseProps = {
  tracking: false,
  activeZoneName: null as string | null,
  lastKnown: null as typeof lastKnown | null | undefined,
  cameraPadding: padding,
  controlsBottom,
  controlsEnd,
  showTrack: false,
  onHasTrackChange: jest.fn(),
  recentreSignal: 0
}

const zonesLoaded = () => new Promise<void>((resolve) => setTimeout(() => resolve(), 0))

describe("DashboardMap", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCoords = null
    mockTrack = []
    mockUseTodayTrack.mockImplementation(() => ({ locations: mockTrack, version: 0 }))
    mockGetGeofences.mockResolvedValue([])
    mockGetLocationsByDateRange.mockResolvedValue([])
  })

  it("draws no tiles until the database has answered, so the map never opens on the world view and jumps", async () => {
    const { queryByTestId, getByTestId, rerender } = render(<DashboardMap {...baseProps} lastKnown={undefined} />)
    await act(zonesLoaded)

    expect(queryByTestId("ColotaMapView")).toBeNull()
    expect(getByTestId("dashboard-map-pending")).toBeTruthy()

    rerender(<DashboardMap {...baseProps} lastKnown={lastKnown} />)
    await act(zonesLoaded)

    expect(getByTestId("ColotaMapView")).toBeTruthy()
    expect(mockMapProps.mock.calls[0][0].initialCenter).toEqual([lastKnown.longitude, lastKnown.latitude])
    expect(mockMapProps.mock.calls[0][0].initialZoom).toBe(DEFAULT_MAP_ZOOM)
  })

  it("mounts idle with no fix on the world view", async () => {
    const { getByTestId } = render(<DashboardMap {...baseProps} />)
    await act(zonesLoaded)

    expect(getByTestId("ColotaMapView")).toBeTruthy()
    expect(mockMapProps.mock.calls[0][0].initialCenter).toEqual([0, 20])
    expect(mockMapProps.mock.calls[0][0].initialZoom).toBe(WORLD_MAP_ZOOM)
  })

  it("frames the last known fix at street zoom inside the camera padding", async () => {
    render(<DashboardMap {...baseProps} lastKnown={lastKnown} />)
    await act(zonesLoaded)

    expect(mockSetStop).toHaveBeenCalledWith({
      center: [lastKnown.longitude, lastKnown.latitude],
      zoom: DEFAULT_MAP_ZOOM,
      padding,
      duration: 0
    })
    expect(mockFitBounds).not.toHaveBeenCalled()
  })

  it("fits the zones with the dock padding added when the database holds no fix, so Home shows before Start", async () => {
    mockGetGeofences.mockResolvedValue([homeZone])

    render(<DashboardMap {...baseProps} lastKnown={null} />)
    await act(zonesLoaded)

    expect(mockSetStop).not.toHaveBeenCalled()
    const [bounds, options] = mockFitBounds.mock.calls[0]
    expect(bounds[0]).toBeLessThan(homeZone.lon)
    expect(bounds[2]).toBeGreaterThan(homeZone.lon)
    expect(bounds[1]).toBeLessThan(homeZone.lat)
    expect(bounds[3]).toBeGreaterThan(homeZone.lat)
    const [top, right, bottom, left] = GEOFENCE_ZOOM_PADDING
    expect(options).toEqual({
      padding: {
        top: top + padding.top,
        right: right + padding.right,
        bottom: bottom + padding.bottom,
        left: left + padding.left
      },
      duration: 0
    })
  })

  it("waits for the database before fitting zones, so a fix that arrives late still wins", async () => {
    mockGetGeofences.mockResolvedValue([homeZone])

    const { rerender } = render(<DashboardMap {...baseProps} lastKnown={undefined} />)
    await act(zonesLoaded)
    expect(mockFitBounds).not.toHaveBeenCalled()

    rerender(<DashboardMap {...baseProps} lastKnown={lastKnown} />)

    expect(mockFitBounds).not.toHaveBeenCalled()
    expect(mockSetStop).toHaveBeenCalledWith(expect.objectContaining({ zoom: DEFAULT_MAP_ZOOM }))
  })

  it("frames the fix again once the map reports ready, because a stop sent before the style loads can be reset", async () => {
    render(<DashboardMap {...baseProps} lastKnown={lastKnown} />)
    await act(zonesLoaded)
    expect(mockSetStop).toHaveBeenCalledTimes(1)

    act(() => mockMapProps.mock.calls[0][0].onMapReady())

    expect(mockSetStop).toHaveBeenCalledTimes(2)
    expect(mockSetStop).toHaveBeenLastCalledWith({
      center: [lastKnown.longitude, lastKnown.latitude],
      zoom: DEFAULT_MAP_ZOOM,
      padding,
      duration: 0
    })
  })

  it("keeps the user's viewport when a later style load reports ready, so a theme switch does not snap the map back", async () => {
    render(<DashboardMap {...baseProps} lastKnown={lastKnown} />)
    await act(zonesLoaded)
    act(() => mockMapProps.mock.calls[0][0].onMapReady())
    expect(mockSetStop).toHaveBeenCalledTimes(2)

    act(() => mockMapProps.mock.calls[0][0].onRegionDidChange({ isUserInteraction: true }))
    act(() => mockMapProps.mock.calls[0][0].onMapReady())

    expect(mockSetStop).toHaveBeenCalledTimes(2)
  })

  it("fits the zones again once the map reports ready", async () => {
    mockGetGeofences.mockResolvedValue([homeZone])

    render(<DashboardMap {...baseProps} lastKnown={null} />)
    await act(zonesLoaded)
    expect(mockFitBounds).toHaveBeenCalledTimes(1)

    act(() => mockMapProps.mock.calls[0][0].onMapReady())

    expect(mockFitBounds).toHaveBeenCalledTimes(2)
    expect(mockSetStop).not.toHaveBeenCalled()
  })

  it("frames the first live fix at street zoom after a world start, then only follows the centre", async () => {
    const { rerender } = render(<DashboardMap {...baseProps} tracking lastKnown={null} />)
    await act(zonesLoaded)
    act(() => mockMapProps.mock.calls[0][0].onMapReady())
    expect(mockSetStop).not.toHaveBeenCalled()

    mockCoords = { latitude: 48.2, longitude: 11.6, accuracy: 8 }
    rerender(<DashboardMap {...baseProps} tracking lastKnown={null} />)
    expect(mockSetStop).toHaveBeenCalledTimes(1)
    expect(mockSetStop).toHaveBeenCalledWith(expect.objectContaining({ center: [11.6, 48.2], zoom: DEFAULT_MAP_ZOOM }))

    mockCoords = { latitude: 48.3, longitude: 11.7, accuracy: 8 }
    rerender(<DashboardMap {...baseProps} tracking lastKnown={null} />)
    expect(mockSetStop).toHaveBeenCalledTimes(1)
    expect(mockEaseTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [11.7, 48.3], padding }))
    expect(mockEaseTo.mock.calls.at(-1)[0].zoom).toBeUndefined()
  })

  it("flies to the last known fix the moment Start is tapped, so the map reacts before a cold fix, and lets the flight land before following", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000)
    const { rerender, getByTestId } = render(<DashboardMap {...baseProps} lastKnown={lastKnown} />)
    await act(zonesLoaded)
    act(() => mockMapProps.mock.calls[0][0].onMapReady())
    act(() => mockMapProps.mock.calls[0][0].onRegionDidChange({ isUserInteraction: true }))
    expect(getByTestId("center-button").props.visible).toBe(true)
    const stopsBefore = mockSetStop.mock.calls.length

    rerender(<DashboardMap {...baseProps} lastKnown={lastKnown} recentreSignal={1} />)

    expect(mockFlyTo).toHaveBeenCalledTimes(1)
    expect(mockFlyTo).toHaveBeenCalledWith({
      center: [lastKnown.longitude, lastKnown.latitude],
      zoom: DEFAULT_MAP_ZOOM,
      padding,
      duration: MAP_ANIMATION_DURATION_MS
    })
    expect(getByTestId("center-button").props.visible).toBe(false)

    // The seeded fix lands inside the flight; an ease now would cancel the fly before it reaches street zoom.
    mockCoords = { latitude: 48.2, longitude: 11.6, accuracy: 8 }
    rerender(<DashboardMap {...baseProps} tracking lastKnown={lastKnown} recentreSignal={1} />)

    expect(mockSetStop).toHaveBeenCalledTimes(stopsBefore)
    expect(mockFlyTo).toHaveBeenCalledTimes(1)
    expect(mockEaseTo).not.toHaveBeenCalled()

    now.mockReturnValue(1_000_000 + MAP_ANIMATION_DURATION_MS)
    mockCoords = { latitude: 48.3, longitude: 11.7, accuracy: 8 }
    rerender(<DashboardMap {...baseProps} tracking lastKnown={lastKnown} recentreSignal={1} />)

    expect(mockFlyTo).toHaveBeenCalledTimes(1)
    expect(mockEaseTo).toHaveBeenLastCalledWith(expect.objectContaining({ center: [11.7, 48.3], padding }))
    expect(mockEaseTo.mock.calls.at(-1)[0].zoom).toBeUndefined()
    now.mockRestore()
  })

  it("lets the centre disc's flight land before a live fix follows, so the zoom it restores is not cut short", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000)
    mockCoords = { latitude: 48.2, longitude: 11.6, accuracy: 8 }
    const { rerender, getByTestId } = render(<DashboardMap {...baseProps} tracking />)
    await act(zonesLoaded)
    act(() => mockMapProps.mock.calls[0][0].onRegionDidChange({ isUserInteraction: true }))
    mockEaseTo.mockClear()

    act(() => getByTestId("center-button").props.onPress())
    expect(mockFlyTo).toHaveBeenCalledTimes(1)

    mockCoords = { latitude: 48.3, longitude: 11.7, accuracy: 8 }
    rerender(<DashboardMap {...baseProps} tracking />)
    expect(mockEaseTo).not.toHaveBeenCalled()

    now.mockReturnValue(1_000_000 + MAP_ANIMATION_DURATION_MS)
    mockCoords = { latitude: 48.4, longitude: 11.8, accuracy: 8 }
    rerender(<DashboardMap {...baseProps} tracking />)
    expect(mockEaseTo).toHaveBeenCalledWith(expect.objectContaining({ center: [11.8, 48.4], padding }))
    now.mockRestore()
  })

  it("stays on the world view when Start is tapped with no last known fix, leaving the first fix to frame the map", async () => {
    const { rerender } = render(<DashboardMap {...baseProps} lastKnown={null} />)
    await act(zonesLoaded)
    act(() => mockMapProps.mock.calls[0][0].onMapReady())

    rerender(<DashboardMap {...baseProps} lastKnown={null} recentreSignal={1} />)
    expect(mockFlyTo).not.toHaveBeenCalled()
    expect(mockSetStop).not.toHaveBeenCalled()

    mockCoords = { latitude: 48.2, longitude: 11.6, accuracy: 8 }
    rerender(<DashboardMap {...baseProps} tracking lastKnown={null} recentreSignal={1} />)

    expect(mockFlyTo).not.toHaveBeenCalled()
    expect(mockSetStop).toHaveBeenCalledTimes(1)
    expect(mockSetStop).toHaveBeenCalledWith(expect.objectContaining({ center: [11.6, 48.2], zoom: DEFAULT_MAP_ZOOM }))
  })

  it("leaves the world view when there is neither a fix nor a zone", async () => {
    render(<DashboardMap {...baseProps} lastKnown={null} />)
    await act(zonesLoaded)

    expect(mockSetStop).not.toHaveBeenCalled()
    expect(mockFitBounds).not.toHaveBeenCalled()
  })

  it("draws the last known position as a stale dot with no ring while idle", async () => {
    const { getByTestId } = render(<DashboardMap {...baseProps} lastKnown={lastKnown} />)
    await act(zonesLoaded)

    const dot = getByTestId("user-dot")
    expect(dot.props.isPaused).toBe(true)
    expect(dot.props.coords).toEqual({ latitude: lastKnown.latitude, longitude: lastKnown.longitude, accuracy: 0 })
  })

  it("draws the live fix with its ring while tracking and dims it inside a pause zone", async () => {
    mockCoords = { latitude: 48.2, longitude: 11.6, accuracy: 8 }

    const live = render(<DashboardMap {...baseProps} tracking lastKnown={lastKnown} />)
    await act(zonesLoaded)
    expect(live.getByTestId("user-dot").props.isPaused).toBe(false)
    expect(live.getByTestId("user-dot").props.coords).toBe(mockCoords)
    live.unmount()

    const paused = render(<DashboardMap {...baseProps} tracking activeZoneName="Home" />)
    await act(zonesLoaded)
    expect(paused.getByTestId("user-dot").props.isPaused).toBe(true)
  })

  it("shows no dot at all when nothing is known", async () => {
    const { queryByTestId } = render(<DashboardMap {...baseProps} lastKnown={null} />)
    await act(zonesLoaded)

    expect(queryByTestId("user-dot")).toBeNull()
  })

  it("forwards the camera padding and the control column's base line and end to the map view", async () => {
    render(<DashboardMap {...baseProps} />)
    await act(zonesLoaded)

    expect(mockMapProps.mock.calls[0][0].cameraPadding).toBe(padding)
    expect(mockMapProps.mock.calls[0][0].controlsBottom).toBe(controlsBottom)
    expect(mockMapProps.mock.calls[0][0].controlsEnd).toBe(controlsEnd)
  })

  it("follows a live fix inside the padding, so the dot never slides under the dock", async () => {
    mockCoords = { latitude: 48.2, longitude: 11.6, accuracy: 8 }

    render(<DashboardMap {...baseProps} tracking />)
    await act(zonesLoaded)

    expect(mockEaseTo).toHaveBeenCalledWith(expect.objectContaining({ center: [11.6, 48.2], padding }))
  })

  it("puts the centre disc one slot above the base line at the column's end and shows it only after a pan", async () => {
    const { getByTestId } = render(<DashboardMap {...baseProps} lastKnown={lastKnown} />)
    await act(zonesLoaded)

    const position = StyleSheet.flatten(getByTestId("center-button").props.style)
    expect(position.bottom).toBe(controlsBottom + size.iconColumn + space.lg)
    expect(position.right).toBe(controlsEnd)
    expect(getByTestId("center-button").props.visible).toBe(false)

    act(() => mockMapProps.mock.calls[0][0].onRegionDidChange({ isUserInteraction: true }))
    expect(getByTestId("center-button").props.visible).toBe(true)

    act(() => getByTestId("center-button").props.onPress())
    expect(mockFlyTo).toHaveBeenCalledWith(
      expect.objectContaining({ center: [lastKnown.longitude, lastKnown.latitude], zoom: DEFAULT_MAP_ZOOM, padding })
    )
    expect(getByTestId("center-button").props.visible).toBe(false)
  })

  it("renders no Text node while searching or idle, so the tiles are all a user sees", async () => {
    const { Text } = require("react-native")

    const searching = render(<DashboardMap {...baseProps} tracking />)
    await act(zonesLoaded)
    expect(searching.UNSAFE_queryAllByType(Text)).toHaveLength(0)
    searching.unmount()

    const idle = render(<DashboardMap {...baseProps} lastKnown={null} />)
    await act(zonesLoaded)
    expect(idle.UNSAFE_queryAllByType(Text)).toHaveLength(0)
  })

  it("tells the screen when today's track has points, so the Route toggle can appear idle", async () => {
    mockTrack = [{ latitude: 48.1, longitude: 11.5 }]
    const onHasTrackChange = jest.fn()

    render(<DashboardMap {...baseProps} onHasTrackChange={onHasTrackChange} />)
    await act(zonesLoaded)

    expect(onHasTrackChange).toHaveBeenLastCalledWith(true)
  })

  it("reads today's points from the database while idle, so the Route toggle is offered before Start", async () => {
    mockUseTodayTrack.mockImplementation(jest.requireActual("../../../../hooks/useTodayTrack").useTodayTrack)
    mockGetLocationsByDateRange.mockResolvedValue([
      { latitude: 48.1, longitude: 11.5, timestamp: 1_700_000_000, accuracy: 10, speed: 0, altitude: 500 }
    ])
    const onHasTrackChange = jest.fn()

    render(<DashboardMap {...baseProps} tracking={false} onHasTrackChange={onHasTrackChange} />)

    await waitFor(() => expect(onHasTrackChange).toHaveBeenLastCalledWith(true))
    expect(mockGetLocationsByDateRange).toHaveBeenCalledTimes(1)
  })
})
