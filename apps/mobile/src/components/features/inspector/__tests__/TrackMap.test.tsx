import React from "react"
import { render, act, fireEvent } from "@testing-library/react-native"
import { TrackMap } from "../TrackMap"
import { DEFAULT_MAP_ZOOM } from "../../../../constants"
import type { Trip } from "../../../../types/global"

const mockFitBounds = jest.fn()
const mockSetStop = jest.fn()
const mockBuildSegments = jest.fn()
const mockBuildPoints = jest.fn()

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
        camera: { fitBounds: mockFitBounds, setStop: mockSetStop },
        mapView: null
      }))
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
    const Stub = (props: any) =>
      R.createElement(View, { testID: props.id ?? name, onPress: props.onPress }, props.children)
    Stub.displayName = name
    return Stub
  }
  return {
    GeoJSONSource: stub("GeoJSONSource"),
    Layer: stub("Layer")
  }
})

jest.mock("../../map/MapCenterButton", () => ({
  MapCenterButton: () => null
}))

jest.mock("../../../../styles/typography", () => ({
  fonts: { regular: {}, bold: {}, semiBold: {} },
  // The real scale, not stubs: these tests render styles that read a named size, and a
  // stubbed object would let a renamed key through.
  fontSizes: jest.requireActual("@colota/shared").fontSizes
}))

jest.mock("../../../../utils/geo", () => ({
  getSpeedUnit: () => ({ factor: 3.6, unit: "km/h" })
}))

jest.mock("../../../../utils/trips", () => ({
  getTripColor: (index: number) => `#trip${index}`
}))

const colors = {
  primary: "#00f",
  card: "#fff",
  border: "#ccc",
  text: "#000",
  textSecondary: "#666",
  borderRadius: 8,
  pressedOpacity: 0.6
} as any

const loc = (lat: number, lon: number) => ({
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

// Run the auto-fit synchronously, otherwise it lands after the test has torn down
beforeEach(() => {
  jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb: any) => {
    cb(0)
    return 0
  })
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe("TrackMap auto-fit", () => {
  beforeEach(() => {
    mockFitBounds.mockClear()
    mockSetStop.mockClear()
  })

  it("fits bounds when switching from empty day to non-empty day", () => {
    const locsA = [loc(48.1, 11.5), loc(48.2, 11.6)]
    const locsB = [loc(52.5, 13.4), loc(52.6, 13.5)]

    const { rerender } = render(<TrackMap locations={locsA} colors={colors} trackColor="#000" fitVersion={1} />)
    expect(mockFitBounds).toHaveBeenCalledTimes(1)

    // Switch to empty day
    act(() => {
      rerender(<TrackMap locations={[]} colors={colors} trackColor="#000" fitVersion={2} />)
    })
    expect(mockFitBounds).toHaveBeenCalledTimes(1) // no new fit on empty

    // Switch to another non-empty day - the regression target
    act(() => {
      rerender(<TrackMap locations={locsB} colors={colors} trackColor="#000" fitVersion={3} />)
    })
    expect(mockFitBounds).toHaveBeenCalledTimes(2)
  })

  it("centers a single point at a fixed zoom instead of fitting bounds", () => {
    render(<TrackMap locations={[loc(52.5, 13.4)]} colors={colors} trackColor="#000" fitVersion={1} />)

    // A zero-extent bounds would make fitBounds zoom to the max level, so a lone point must not fit
    expect(mockFitBounds).not.toHaveBeenCalled()
    expect(mockSetStop).toHaveBeenCalledWith(expect.objectContaining({ center: [13.4, 52.5], zoom: DEFAULT_MAP_ZOOM }))
  })
})

describe("TrackMap point deletion", () => {
  const tapPoint = (points: any, id: number) =>
    fireEvent(points, "press", {
      nativeEvent: {
        features: [
          {
            properties: { id, color: "#000", speed: 0, timestamp: 1000, accuracy: 5, altitude: 10, note: "" },
            geometry: { type: "Point", coordinates: [13.4, 52.5] }
          }
        ]
      }
    })

  it("reports the tapped point's id to the delete handler", () => {
    const onPointDelete = jest.fn()
    const { getByTestId } = render(
      <TrackMap locations={[loc(52.5, 13.4)]} colors={colors} trackColor="#000" onPointDelete={onPointDelete} />
    )

    tapPoint(getByTestId("track-points"), 42)
    fireEvent.press(getByTestId("popup-delete-point"))

    expect(onPointDelete).toHaveBeenCalledWith(42)
  })

  it("offers no delete action on a read-only map", () => {
    const { getByTestId, queryByTestId } = render(
      <TrackMap locations={[loc(52.5, 13.4)]} colors={colors} trackColor="#000" />
    )

    tapPoint(getByTestId("track-points"), 42)

    expect(queryByTestId("popup-delete-point")).toBeNull()
  })

  it("offers no delete action for a point with no row id", () => {
    const { getByTestId, queryByTestId } = render(
      <TrackMap locations={[loc(52.5, 13.4)]} colors={colors} trackColor="#000" onPointDelete={jest.fn()} />
    )

    tapPoint(getByTestId("track-points"), -1)

    expect(queryByTestId("popup-delete-point")).toBeNull()
  })

  it("reports the tapped point's id to the split handler", () => {
    // The id, not the timestamp: the caller resolves the boundary from it and two fixes
    // in one trip can share a second
    const onPointSplit = jest.fn()
    const { getByTestId } = render(
      <TrackMap locations={[loc(52.5, 13.4)]} colors={colors} trackColor="#000" onPointSplit={onPointSplit} />
    )

    tapPoint(getByTestId("track-points"), 42)
    fireEvent.press(getByTestId("popup-split-point"))

    expect(onPointSplit).toHaveBeenCalledWith(42)
  })

  it("offers no split action on a read-only map", () => {
    const { getByTestId, queryByTestId } = render(
      <TrackMap locations={[loc(52.5, 13.4)]} colors={colors} trackColor="#000" />
    )

    tapPoint(getByTestId("track-points"), 42)

    expect(queryByTestId("popup-split-point")).toBeNull()
  })

  it("offers no split action for a point with no row id", () => {
    // Without a row id there is no way to locate the point in the day's array
    const { getByTestId, queryByTestId } = render(
      <TrackMap locations={[loc(52.5, 13.4)]} colors={colors} trackColor="#000" onPointSplit={jest.fn()} />
    )

    tapPoint(getByTestId("track-points"), -1)

    expect(queryByTestId("popup-split-point")).toBeNull()
  })

  it("offers the split action on every point with a row id", () => {
    // The map has no view of the surrounding day, so it cannot tell which points are splittable.
    // The screen takes every tap and explains the ones it cannot act on.
    const { getByTestId, queryByTestId } = render(
      <TrackMap locations={[loc(52.5, 13.4)]} colors={colors} trackColor="#000" onPointSplit={jest.fn()} />
    )

    tapPoint(getByTestId("track-points"), 42)

    expect(getByTestId("popup-split-point")).toBeTruthy()
    // Delete is a separate opt-in and stays absent on a map that didn't ask for it
    expect(queryByTestId("popup-delete-point")).toBeNull()
  })
})

describe("TrackMap trip coloring", () => {
  beforeEach(() => mockBuildSegments.mockClear())

  it("keeps points aligned with their trip when segmentTrips dropped a segment", () => {
    // Points 2-4 were dropped by segmentTrips
    const locations = [loc(52.5, 13.4), loc(52.51, 13.4), loc(52.6, 13.4), loc(52.6, 13.4), loc(52.6, 13.4), loc(52.7, 13.4), loc(52.71, 13.4)] // prettier-ignore
    const trips: Trip[] = [
      { index: 1, locations: [], startTime: 0, endTime: 0, distance: 1000, locationCount: 2, startIndex: 0 },
      { index: 2, locations: [], startTime: 0, endTime: 0, distance: 1000, locationCount: 2, startIndex: 5 }
    ]

    render(<TrackMap locations={locations} colors={colors} trips={trips} trackColor="#track" fitVersion={1} />)

    const options = mockBuildSegments.mock.calls[0][2]
    expect(options.locationColors).toEqual(["#trip1", "#trip1", "#track", "#track", "#track", "#trip2", "#trip2"])
    expect([...options.skipIndices].sort((a: number, b: number) => a - b)).toEqual([2, 3, 4, 5])
  })
})

describe("TrackMap note overrides", () => {
  /** The tabs unmount this map, so a note saved here used to come back stale. */
  it("renders a note saved this session instead of the stored one", () => {
    mockBuildPoints.mockClear()
    render(
      <TrackMap
        locations={[{ ...loc(52.5, 13.4), id: 42, note: "stored" }] as any}
        colors={colors}
        trackColor="#000"
        noteOverrides={{ 42: "saved this session" }}
        onPointNoteChange={jest.fn()}
      />
    )

    const [locationsPassed] = mockBuildPoints.mock.calls.at(-1)!
    expect(locationsPassed[0].note).toBe("saved this session")
  })

  /** Cleared notes are stored as undefined, so the merge has to test presence, not truthiness. */
  it("shows a note cleared this session as cleared, not as the stored text", () => {
    mockBuildPoints.mockClear()
    render(
      <TrackMap
        locations={[{ ...loc(52.5, 13.4), id: 42, note: "stored" }] as any}
        colors={colors}
        trackColor="#000"
        noteOverrides={{ 42: undefined }}
        onPointNoteChange={jest.fn()}
      />
    )

    const [locationsPassed] = mockBuildPoints.mock.calls.at(-1)!
    expect(locationsPassed[0].note).toBeUndefined()
  })

  /**
   * Merging notes into locations instead would hand the map a new array on every save, and the
   * effect that clears the popup on a day change would close it mid-edit.
   */
  it("keeps the popup open when a note is saved", () => {
    const { getByTestId, queryByTestId } = render(
      <TrackMap
        locations={[{ ...loc(52.5, 13.4), id: 42, note: "" }] as any}
        colors={colors}
        trackColor="#000"
        onPointNoteChange={jest.fn()}
      />
    )
    fireEvent(getByTestId("track-points"), "press", {
      nativeEvent: {
        features: [
          {
            properties: { id: 42, color: "#000", speed: 0, timestamp: 1000, accuracy: 5, altitude: 10, note: "" },
            geometry: { type: "Point", coordinates: [13.4, 52.5] }
          }
        ]
      }
    })
    fireEvent.changeText(getByTestId("popup-note-input"), "lunch")
    fireEvent.press(getByTestId("popup-note-save"))

    expect(queryByTestId("popup-note-input")).not.toBeNull()
  })

  it("leaves the stored note alone when nothing was edited", () => {
    mockBuildPoints.mockClear()
    render(
      <TrackMap
        locations={[{ ...loc(52.5, 13.4), id: 42, note: "stored" }] as any}
        colors={colors}
        trackColor="#000"
        onPointNoteChange={jest.fn()}
      />
    )

    const [locationsPassed] = mockBuildPoints.mock.calls.at(-1)!
    expect(locationsPassed[0].note).toBe("stored")
  })
})
