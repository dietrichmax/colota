import React from "react"
import { render, act, fireEvent, within } from "@testing-library/react-native"
import { TrackMap, POINT_HITBOX } from "../TrackMap"
import { DEFAULT_MAP_ZOOM, MAP_ANIMATION_DURATION_MS, size, space } from "../../../../constants"
import type { Trip } from "../../../../types/global"

const mockFitBounds = jest.fn()
const mockSetStop = jest.fn()
const mockEaseTo = jest.fn()
const mockMapProps = jest.fn()
const mockBuildSegments = jest.fn()
const mockBuildPoints = jest.fn()

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

jest.mock("../../map/mapUtils", () => {
  const actual = jest.requireActual("../../map/mapUtils")
  return {
    ...actual,
    buildTrackSegmentsGeoJSON: (...args: any[]) => {
      mockBuildSegments(...args)
      return actual.buildTrackSegmentsGeoJSON(...args)
    },
    buildTrackPointsGeoJSON: (...args: any[]) => {
      mockBuildPoints(...args)
      return actual.buildTrackPointsGeoJSON(...args)
    }
  }
})

jest.mock("../../map/ColotaMapView", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    __esModule: true,
    ColotaMapView: R.forwardRef(function MockColotaMapView(props: any, ref: any) {
      const onMapReady = props.onMapReady
      R.useImperativeHandle(ref, () => ({
        camera: { fitBounds: mockFitBounds, setStop: mockSetStop, easeTo: mockEaseTo },
        mapView: null
      }))
      mockMapProps(props)
      R.useEffect(() => {
        onMapReady?.()
      }, [onMapReady])
      return R.createElement(View, { testID: "MockColotaMapView" }, props.children)
    })
  }
})

jest.mock("@maplibre/maplibre-react-native", () => {
  const R = require("react")
  const { View } = require("react-native")
  const stub = (name: string) => {
    const Stub = (props: any) => R.createElement(View, { ...props, testID: props.id ?? name }, props.children)
    Stub.displayName = name
    return Stub
  }
  return {
    GeoJSONSource: stub("GeoJSONSource"),
    Layer: stub("Layer")
  }
})

jest.mock("../../../../utils/trips", () => ({
  getTripColor: (index: number) => `#trip${index}`
}))

const colors = {
  primary: "#00f",
  card: "#fff",
  border: "#ccc",
  text: "#000",
  textSecondary: "#666",
  textLight: "#999"
} as any

const cameraPadding = { top: 16, right: 72, bottom: 200, left: 16 }
const frame = { cameraPadding, controlsBottom: 180, controlsEnd: 16 }

const loc = (lat: number, lon: number, id?: number) => ({
  id,
  latitude: lat,
  longitude: lon,
  accuracy: 5,
  timestamp: 1000,
  altitude: 100,
  speed: 0,
  bearing: 0,
  battery: 80,
  battery_status: 2
})

const trip = (index: number, startIndex: number, locationCount: number): Trip => ({
  index,
  locations: [],
  startTime: 0,
  endTime: 0,
  distance: 1000,
  locationCount,
  startIndex
})

const twoTrips = {
  locations: [loc(52.5, 13.4), loc(52.51, 13.41), loc(52.6, 13.5), loc(52.61, 13.51)],
  trips: [trip(1, 0, 2), trip(2, 2, 2)]
}

const renderMap = (props: Partial<React.ComponentProps<typeof TrackMap>> = {}) =>
  render(
    <TrackMap
      locations={[loc(52.5, 13.4), loc(52.6, 13.5)]}
      colors={colors}
      trackColor="#000"
      onSelectPoint={jest.fn()}
      onFocusTrip={jest.fn()}
      {...frame}
      {...props}
    />
  )

const tapFeature = (source: any, properties: Record<string, unknown>) =>
  fireEvent(source, "press", {
    nativeEvent: { features: [{ properties, geometry: { type: "Point", coordinates: [13.4, 52.5] } }] }
  })

const tapMap = () => act(() => mockMapProps.mock.calls.at(-1)![0].onPress())
const panMap = () => act(() => mockMapProps.mock.calls.at(-1)![0].onRegionDidChange({ isUserInteraction: true }))

const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
type Node = { type: unknown; parent: Node | null; props: { style?: unknown } }

// Run the auto-fit synchronously, otherwise it lands after the test has torn down
beforeEach(() => {
  jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb: any) => {
    cb(0)
    return 0
  })
  mockFitBounds.mockClear()
  mockSetStop.mockClear()
  mockEaseTo.mockClear()
  mockMapProps.mockClear()
  mockBuildSegments.mockClear()
  mockBuildPoints.mockClear()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe("TrackMap track drawing", () => {
  it("paints a casing under every trip line so any trip colour reads against the tiles", () => {
    const { getByTestId } = renderMap()

    const layers = within(getByTestId("track-segments"))
      .getAllByTestId(/^track-(casing|line)$/)
      .map((layer) => layer.props.testID)
    expect(layers).toEqual(["track-casing", "track-line"])
    expect(getByTestId("track-casing").props.style).toMatchObject({
      lineColor: colors.card,
      lineWidth: ["case", ["get", "focused"], 7, 5],
      lineCap: "round",
      lineJoin: "round"
    })
  })

  it("widens the focused trip and dims the others, so focus never rests on colour alone", () => {
    const { getByTestId } = renderMap({ ...twoTrips, focusedTripIndex: 2 })

    const line = getByTestId("track-line").props.style
    expect(line.lineWidth).toEqual(["case", ["get", "focused"], 5, 3])
    expect(line.lineOpacity).toEqual(["case", ["any", false, ["get", "focused"]], 1, 0.4])
    expect(getByTestId("track-casing").props.style.lineOpacity).toEqual(line.lineOpacity)
    const layers = within(getByTestId("track-segments"))
      .getAllByTestId(/^track-(casing|line)(-focused)?$/)
      .map((layer) => layer.props.testID)
    expect(layers).toEqual(["track-casing", "track-line", "track-casing-focused", "track-line-focused"])
    expect(getByTestId("track-line-focused").props.filter).toEqual(["==", ["get", "focused"], true])
    expect(getByTestId("track-line-focused").props.style.lineWidth).toBe(5)
    expect(getByTestId("track-casing-focused").props.style.lineWidth).toBe(7)
    expect(getByTestId("trip-start").props.style.circleOpacity).toEqual(line.lineOpacity)
    expect(getByTestId("trip-end").props.style.circleStrokeOpacity).toEqual(line.lineOpacity)

    const features = getByTestId("track-segments").props.data.features
    expect(features.map((f: any) => [f.properties.tripIndex, f.properties.focused])).toEqual([
      [1, false],
      [2, true]
    ])
  })

  it("marks every trip's start with a solid disc and its end with a ring, the mark's own two terminals", () => {
    const { getByTestId } = renderMap(twoTrips)

    const features = getByTestId("trip-terminals").props.data.features
    expect(features.map((f: any) => [f.properties.kind, f.properties.trip])).toEqual([
      ["start", 1],
      ["end", 1],
      ["start", 2],
      ["end", 2]
    ])
    expect(getByTestId("trip-start").props.filter).toEqual(["==", ["get", "kind"], "start"])
    expect(getByTestId("trip-start").props.style).toMatchObject({
      circleColor: ["get", "color"],
      circleStrokeColor: colors.card
    })
    expect(getByTestId("trip-end").props.filter).toEqual(["==", ["get", "kind"], "end"])
    expect(getByTestId("trip-end").props.style).toMatchObject({
      circleColor: colors.card,
      circleStrokeColor: ["get", "color"]
    })
  })

  it("marks the one trip of a Trip Detail map in its track colour when no trips are given", () => {
    const { getByTestId } = renderMap({ trips: undefined, trackColor: "#abc" })

    const features = getByTestId("trip-terminals").props.data.features
    expect(features.map((f: any) => [f.properties.kind, f.properties.color])).toEqual([
      ["start", "#abc"],
      ["end", "#abc"]
    ])
  })

  it("draws every trip at full strength while nothing is focused", () => {
    const { getByTestId } = renderMap(twoTrips)

    expect(getByTestId("track-line").props.style.lineOpacity).toEqual([
      "case",
      ["any", true, ["get", "focused"]],
      1,
      0.4
    ])
  })

  it("keeps points aligned with their trip when segmentTrips dropped a segment", () => {
    // Points 2-4 were dropped by segmentTrips
    const locations = [loc(52.5, 13.4), loc(52.51, 13.4), loc(52.6, 13.4), loc(52.6, 13.4), loc(52.6, 13.4), loc(52.7, 13.4), loc(52.71, 13.4)] // prettier-ignore
    const trips = [trip(1, 0, 2), trip(2, 5, 2)]

    renderMap({ locations, trips, trackColor: "#track", fitVersion: 1 })

    const options = mockBuildSegments.mock.calls[0][2]
    expect(options.locationColors).toEqual(["#trip1", "#trip1", "#track", "#track", "#track", "#trip2", "#trip2"])
    expect(options.locationTrips).toEqual([1, 1, -1, -1, -1, 2, 2])
    expect([...options.skipIndices].sort((a: number, b: number) => a - b)).toEqual([2, 3, 4, 5])
  })
})

describe("TrackMap point targets and selection", () => {
  it("gives every point a 48 dp touch target", () => {
    const { getByTestId } = renderMap()

    const half = size.touch / 2
    expect(POINT_HITBOX).toEqual({ top: half, right: half, bottom: half, left: half })
    expect(getByTestId("track-points").props.hitbox).toEqual(POINT_HITBOX)
  })

  it("hands a tapped point to the screen instead of opening anything itself", () => {
    const onSelectPoint = jest.fn()
    const { getByTestId, queryByTestId, queryByText } = renderMap({ onSelectPoint })

    tapFeature(getByTestId("track-points"), { id: 42, color: "#000" })

    expect(onSelectPoint).toHaveBeenCalledWith(42)
    expect(queryByTestId("popup-note-input")).toBeNull()
    expect(queryByText(/Trip 1/)).toBeNull()
    expect(queryByText("Speed")).toBeNull()
  })

  it("ignores a tap on a point with no row id, because nothing downstream can name it", () => {
    const onSelectPoint = jest.fn()
    const { getByTestId } = renderMap({ onSelectPoint })

    tapFeature(getByTestId("track-points"), { id: -1, color: "#000" })

    expect(onSelectPoint).not.toHaveBeenCalled()
  })

  it("rings the selected point on the card surface so it stands out from its neighbours", () => {
    const { getByTestId } = renderMap({
      ...twoTrips,
      locations: twoTrips.locations.map((l, i) => ({ ...l, id: i + 1 })),
      selectedPointId: 3
    })

    const ring = getByTestId("highlight-point").props.data.features[0]
    expect(ring.properties).toEqual({ color: "#trip2", visible: 1 })
    expect(ring.geometry.coordinates).toEqual([13.5, 52.6])
    expect(getByTestId("highlight-circle").props.style.circleStrokeColor).toBe(colors.card)
  })
})

describe("TrackMap trip focus", () => {
  it("focuses the trip whose line was tapped, a beat later, in case the tap also hit a point", () => {
    jest.useFakeTimers()
    const onFocusTrip = jest.fn()
    const { getByTestId } = renderMap({ ...twoTrips, onFocusTrip })

    tapFeature(getByTestId("track-segments"), { tripIndex: 2, color: "#trip2", focused: false })
    expect(onFocusTrip).not.toHaveBeenCalled()
    act(() => {
      jest.advanceTimersByTime(100)
    })

    expect(onFocusTrip).toHaveBeenCalledWith(2)
    jest.useRealTimers()
  })

  it("opens the point and leaves the focus alone when one tap lands on a point and its line, in either order", () => {
    jest.useFakeTimers()
    const onFocusTrip = jest.fn()
    const onSelectPoint = jest.fn()
    const { getByTestId } = renderMap({ ...twoTrips, onFocusTrip, onSelectPoint })

    tapFeature(getByTestId("track-segments"), { tripIndex: 2 })
    tapFeature(getByTestId("track-points"), { id: 7, color: "#trip2" })
    act(() => {
      jest.advanceTimersByTime(300)
    })
    expect(onSelectPoint).toHaveBeenCalledWith(7)
    expect(onFocusTrip).not.toHaveBeenCalled()

    tapFeature(getByTestId("track-points"), { id: 8, color: "#trip2" })
    tapFeature(getByTestId("track-segments"), { tripIndex: 1 })
    act(() => {
      jest.advanceTimersByTime(300)
    })
    expect(onSelectPoint).toHaveBeenLastCalledWith(8)
    expect(onFocusTrip).not.toHaveBeenCalled()
    jest.useRealTimers()
  })

  it("prefers the focused trip's point where two trips share a road, since that trip is drawn on top", () => {
    const onSelectPoint = jest.fn()
    const { getByTestId } = renderMap({ ...twoTrips, onSelectPoint, focusedTripIndex: 2 })

    fireEvent(getByTestId("track-points"), "press", {
      nativeEvent: {
        features: [
          { properties: { id: 1, color: "#trip1" }, geometry: { type: "Point", coordinates: [13.4, 52.5] } },
          { properties: { id: 2, color: "#trip2" }, geometry: { type: "Point", coordinates: [13.4, 52.5] } }
        ]
      }
    })

    expect(onSelectPoint).toHaveBeenCalledWith(2)
  })

  it("clears focus and selection on an empty tap, but not for the tap that just landed on a feature", () => {
    const onFocusTrip = jest.fn()
    const onSelectPoint = jest.fn()
    const now = jest.spyOn(Date, "now")
    const { getByTestId } = renderMap({ ...twoTrips, onFocusTrip, onSelectPoint, focusedTripIndex: 1 })

    now.mockReturnValue(1000)
    tapFeature(getByTestId("track-segments"), { tripIndex: 1 })
    now.mockReturnValue(1100)
    tapMap()
    expect(onFocusTrip).not.toHaveBeenCalledWith(null)
    expect(onSelectPoint).not.toHaveBeenCalled()

    now.mockReturnValue(1300)
    tapMap()
    expect(onFocusTrip).toHaveBeenCalledWith(null)
    expect(onSelectPoint).toHaveBeenCalledWith(null)
  })
})

describe("TrackMap camera", () => {
  it("frames the day inside the caller's padding, clear of the dock and the disc column", () => {
    renderMap({ fitVersion: 1 })

    expect(mockFitBounds).toHaveBeenCalledWith([13.4, 52.5, 13.5, 52.6], {
      padding: cameraPadding,
      duration: MAP_ANIMATION_DURATION_MS
    })
  })

  it("frames only the focused trip when a fit is requested while one is focused", () => {
    renderMap({ ...twoTrips, focusedTripIndex: 2, fitVersion: 1 })

    expect(mockFitBounds).toHaveBeenCalledWith([13.5, 52.6, 13.51, 52.61], expect.anything())
  })

  it("fits again when switching from an empty day to a day with points", () => {
    const locsA = [loc(48.1, 11.5), loc(48.2, 11.6)]
    const locsB = [loc(52.5, 13.4), loc(52.6, 13.5)]

    const { rerender } = render(
      <TrackMap
        locations={locsA}
        colors={colors}
        trackColor="#000"
        fitVersion={1}
        onSelectPoint={jest.fn()}
        onFocusTrip={jest.fn()}
        {...frame}
      />
    )
    expect(mockFitBounds).toHaveBeenCalledTimes(1)

    act(() => {
      rerender(
        <TrackMap
          locations={[]}
          colors={colors}
          trackColor="#000"
          fitVersion={2}
          onSelectPoint={jest.fn()}
          onFocusTrip={jest.fn()}
          {...frame}
        />
      )
    })
    expect(mockFitBounds).toHaveBeenCalledTimes(1)

    act(() => {
      rerender(
        <TrackMap
          locations={locsB}
          colors={colors}
          trackColor="#000"
          fitVersion={3}
          onSelectPoint={jest.fn()}
          onFocusTrip={jest.fn()}
          {...frame}
        />
      )
    })
    expect(mockFitBounds).toHaveBeenCalledTimes(2)
  })

  it("centres a lone point at a fixed zoom instead of fitting a zero-extent box", () => {
    renderMap({ locations: [loc(52.5, 13.4)], fitVersion: 1 })

    expect(mockFitBounds).not.toHaveBeenCalled()
    expect(mockSetStop).toHaveBeenCalledWith(
      expect.objectContaining({ center: [13.4, 52.5], zoom: DEFAULT_MAP_ZOOM, padding: cameraPadding })
    )
  })

  it("eases to the point a Data row chose once the map is ready, instead of fitting the day", () => {
    renderMap({
      locations: [loc(52.5, 13.4, 1), loc(52.6, 13.5, 2), loc(52.7, 13.6, 3)],
      selectedPointId: 2,
      fitVersion: 1
    })

    expect(mockEaseTo).toHaveBeenCalledWith({
      center: [13.5, 52.6],
      zoom: DEFAULT_MAP_ZOOM,
      padding: cameraPadding,
      duration: MAP_ANIMATION_DURATION_MS
    })
    expect(mockFitBounds).not.toHaveBeenCalled()
  })

  it("tells the screen when the map is ready", () => {
    const onMapReady = jest.fn()
    renderMap({ onMapReady })

    expect(onMapReady).toHaveBeenCalledTimes(1)
  })
})

describe("TrackMap fit-the-day disc", () => {
  it("offers to refit only after the user has panned away", () => {
    const { queryByRole, getByRole } = renderMap({ fitVersion: 1 })
    expect(queryByRole("button")).toBeNull()

    panMap()

    const button = getByRole("button")
    expect(button.props.accessibilityLabel).toBe("Fit the day")
    fireEvent.press(button)
    expect(mockFitBounds).toHaveBeenCalledTimes(2)
    expect(queryByRole("button")).toBeNull()
  })

  it("sits one slot above the attribution disc in the screen's disc column", () => {
    const { getByRole } = renderMap()
    panMap()

    let disc = getByRole("button").parent as Node | null
    while (disc && disc.type !== "View") disc = disc.parent
    const style = flat(disc!.props.style)
    expect(style.position).toBe("absolute")
    expect(style.bottom).toBe(frame.controlsBottom + size.iconColumn + space.lg)
    expect(style.right).toBe(frame.controlsEnd)
  })

  it("stays away on an empty day, where there is nothing to fit", () => {
    const { queryByRole } = renderMap({ locations: [] })
    panMap()

    expect(queryByRole("button")).toBeNull()
  })

  it("passes the frame through to the map so its own discs share the column", () => {
    renderMap()

    expect(mockMapProps.mock.calls.at(-1)![0]).toMatchObject(frame)
  })
})

describe("TrackMap note overrides", () => {
  /** The tabs unmount this map, so a note saved here used to come back stale. */
  it("renders a note saved this session instead of the stored one", () => {
    renderMap({
      locations: [{ ...loc(52.5, 13.4), id: 42, note: "stored" }] as any,
      noteOverrides: { 42: "saved this session" }
    })

    const [locationsPassed] = mockBuildPoints.mock.calls.at(-1)!
    expect(locationsPassed[0].note).toBe("saved this session")
  })

  /** Cleared notes are stored as undefined, so the merge has to test presence, not truthiness. */
  it("shows a note cleared this session as cleared, not as the stored text", () => {
    renderMap({
      locations: [{ ...loc(52.5, 13.4), id: 42, note: "stored" }] as any,
      noteOverrides: { 42: undefined }
    })

    const [locationsPassed] = mockBuildPoints.mock.calls.at(-1)!
    expect(locationsPassed[0].note).toBeUndefined()
  })

  it("leaves the stored note alone when nothing was edited", () => {
    renderMap({ locations: [{ ...loc(52.5, 13.4), id: 42, note: "stored" }] as any })

    const [locationsPassed] = mockBuildPoints.mock.calls.at(-1)!
    expect(locationsPassed[0].note).toBe("stored")
  })
})
