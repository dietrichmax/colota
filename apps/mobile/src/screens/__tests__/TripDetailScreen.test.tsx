import React from "react"
import { render, fireEvent, waitFor, act } from "@testing-library/react-native"
import { TRIP_COLORS } from "../../utils/trips"
import type { Trip } from "../../types/global"

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    addBoundaryOverrides: jest.fn().mockResolvedValue(undefined),
    getBoundaryOverrides: jest.fn().mockResolvedValue([]),
    deleteLocationsInRange: jest.fn().mockResolvedValue(0),
    updateLocationNote: jest.fn().mockResolvedValue(undefined),
    exportTripsToFile: jest.fn().mockResolvedValue("/tmp/export"),
    shareFile: jest.fn()
  }
}))

jest.mock("../../services/modalService", () => ({
  showAlert: jest.fn(),
  showChoice: jest.fn().mockResolvedValue(4),
  showConfirm: jest.fn().mockResolvedValue(false)
}))

jest.mock("../../utils/exportConverters", () => ({
  EXPORT_FORMATS: {
    csv: { label: "CSV", extension: ".csv", mimeType: "text/csv" },
    geojson: { label: "GeoJSON", extension: ".geojson", mimeType: "application/geo+json" },
    gpx: { label: "GPX", extension: ".gpx", mimeType: "application/gpx+xml" },
    kml: { label: "KML", extension: ".kml", mimeType: "application/vnd.google-earth.kml+xml" }
  },
  EXPORT_FORMAT_KEYS: ["csv", "geojson", "gpx", "kml"]
}))

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 })
}))

// Exposes the point popup's split action without a real map
jest.mock("../../components/features/inspector/TrackMap", () => {
  const R = require("react")
  const { View, Pressable, Text } = require("react-native")
  return {
    TrackMap: (props: any) =>
      R.createElement(
        View,
        { testID: "TrackMap" },
        R.createElement(Text, { testID: "TrackMap-overrides" }, JSON.stringify(props.noteOverrides ?? {})),
        R.createElement(Text, { testID: "TrackMap-trackColor" }, props.trackColor),
        props.onPointNoteChange
          ? R.createElement(Pressable, {
              testID: "trigger-point-note",
              onPress: () => props.onPointNoteChange(props.locations?.[0]?.id, "lunch")
            })
          : null,
        props.onPointSplit
          ? [
              R.createElement(Pressable, {
                key: "s",
                testID: "trigger-point-split",
                onPress: () => props.onPointSplit(props.locations?.[2]?.id)
              }),
              R.createElement(Pressable, {
                key: "s0",
                testID: "trigger-point-split-first",
                onPress: () => props.onPointSplit(props.locations?.[0]?.id)
              }),
              R.createElement(Pressable, {
                key: "sl",
                testID: "trigger-point-split-last",
                onPress: () => props.onPointSplit(props.locations?.[props.locations.length - 1]?.id)
              })
            ]
          : null
      )
  }
})

jest.mock("../../components/features/inspector/InteractiveLineChart", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    CHART_PADDING: { top: 24, bottom: 20, left: 40, right: 0 },
    InteractiveLineChart: (props: any) =>
      R.createElement(View, { testID: "Chart", accessibilityLabel: props.accessibilityLabel })
  }
})

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Pressable, Text } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    Card: ({ children }: any) => R.createElement(View, null, children),
    Divider: () => R.createElement(View, { testID: "Divider" }),
    Figure: ({ value, unit, label, testID }: any) =>
      R.createElement(View, { testID }, R.createElement(Text, null, `${value} ${unit} ${label}`)),
    StatRow: ({ label, value }: any) => R.createElement(Text, null, `${label}: ${value}`),
    Button: ({ title, onPress, disabled, testID, accessibilityLabel }: any) =>
      R.createElement(
        Pressable,
        {
          onPress,
          disabled,
          testID,
          accessibilityLabel: accessibilityLabel ?? title,
          accessibilityState: { disabled }
        },
        R.createElement(Text, null, title)
      ),
    MapOverlay: ({ children, testID, onPress, accessibilityLabel }: any) =>
      R.createElement(Pressable, { testID, onPress, accessibilityLabel, accessibilityRole: "button" }, children)
  }
})

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: require("@colota/shared").lightColors,
    mode: "light"
  })
}))

import { TripDetailScreen } from "../TripDetailScreen"
import NativeLocationService from "../../services/NativeLocationService"
import { showChoice, showConfirm, showAlert } from "../../services/modalService"
import { BOUNDARY_ACTION_SPLIT } from "../../types/global"

function makeTrip(pointCount: number, index = 1): Trip {
  const locations = Array.from({ length: pointCount }, (_, i) => ({
    id: i + 1,
    latitude: 52.52 + i * 0.01,
    longitude: 13.405,
    timestamp: 1000 + i * 100,
    speed: 3 + i,
    altitude: 100 + i * 5
  }))
  return {
    index,
    locations,
    startTime: locations[0].timestamp,
    endTime: locations[locations.length - 1].timestamp,
    distance: 4000,
    locationCount: pointCount,
    startIndex: 0
  }
}

const makeProps = (trip: Trip, trips: Trip[] = [trip]) =>
  ({
    navigation: { setOptions: jest.fn(), goBack: jest.fn(), setParams: jest.fn() },
    route: { params: { trip, trips } }
  }) as any

// Splitting is refused until the boundary overrides land, so pressing straight after render
// would exercise that guard rather than the reason each test is named for
const renderLoaded = async (props: ReturnType<typeof makeProps>) => {
  const utils = render(<TripDetailScreen {...props} />)
  await act(async () => {})
  return utils
}

describe("TripDetailScreen - sheet", () => {
  beforeEach(() => jest.clearAllMocks())

  /** The map carries back, share and delete, so each has to name itself to Voice Access. */
  it("puts back, share and delete on the map as labelled controls", async () => {
    const props = makeProps(makeTrip(4))
    const { getByTestId } = await renderLoaded(props)

    expect(getByTestId("trip-back-btn").props.accessibilityLabel).toBe("Back")
    expect(getByTestId("trip-share-btn").props.accessibilityLabel).toBe("Export trip")
    expect(getByTestId("trip-delete-btn").props.accessibilityLabel).toBe("Delete trip")

    fireEvent.press(getByTestId("trip-back-btn"))
    expect(props.navigation.goBack).toHaveBeenCalled()
  })

  /** Distance is the one hero figure; everything else is a ledger line. */
  it("shows distance as the figure and the rest as stat rows", async () => {
    const { getByTestId, getByText } = await renderLoaded(makeProps(makeTrip(4)))

    expect(getByTestId("trip-distance")).toBeTruthy()
    expect(getByText(/Duration:/)).toBeTruthy()
    expect(getByText(/Average speed:/)).toBeTruthy()
    expect(getByText(/Points: 4/)).toBeTruthy()
  })

  /**
   * A zero gain or loss is not a measurement, it is the absence of one, so the row goes rather
   * than reading "0 m" as if the trip were flat.
   */
  it("omits elevation rows when there is no climb or descent", async () => {
    const flat = makeTrip(4)
    flat.locations = flat.locations.map((l) => ({ ...l, altitude: 100 }))
    const { queryByText } = await renderLoaded(makeProps(flat))

    expect(queryByText(/Elevation gain:/)).toBeNull()
    expect(queryByText(/Elevation loss:/)).toBeNull()
  })

  it("shows elevation rows once the trip actually climbs", async () => {
    const { getByText } = await renderLoaded(makeProps(makeTrip(6)))

    expect(getByText(/Elevation gain:/)).toBeTruthy()
  })

  /** A chart is unreadable to a screen reader unless it says what it plots and over what range. */
  it("names each chart and its range for a screen reader", async () => {
    const { getAllByTestId } = await renderLoaded(makeProps(makeTrip(6)))

    // The units follow the device locale, so the assertion pins the sentence, not the numbers
    const labels = getAllByTestId("Chart").map((chart) => chart.props.accessibilityLabel)
    expect(labels.some((label: string) => /^Speed over the trip, max .+$/.test(label))).toBe(true)
    expect(labels.some((label: string) => /^Elevation over the trip, .+ to .+$/.test(label))).toBe(true)
  })

  /** The trip ink identifies the route on the map; the title stays in body ink so it is readable. */
  it("never paints the trip title in a trip ink", async () => {
    const { getByText } = await renderLoaded(makeProps(makeTrip(4)))

    const title = ([] as any[]).concat(getByText("Trip 1").props.style).filter(Boolean)
    for (const style of title) {
      expect(TRIP_COLORS).not.toContain(style.color)
    }
  })

  it("disables the previous and next ghosts at the ends of the day", async () => {
    const first = makeTrip(4, 1)
    const second = makeTrip(4, 2)
    const { getByTestId } = await renderLoaded(makeProps(first, [first, second]))

    expect(getByTestId("previous-trip-btn").props.accessibilityState.disabled).toBe(true)
    expect(getByTestId("next-trip-btn").props.accessibilityState.disabled).toBe(false)

    fireEvent.press(getByTestId("next-trip-btn"))
    expect(getByTestId("next-trip-btn")).toBeTruthy()
  })
})

describe("TripDetailScreen - export", () => {
  beforeEach(() => jest.clearAllMocks())

  it("exports the chosen format and shares the file", async () => {
    ;(showChoice as jest.Mock).mockResolvedValueOnce(2)
    const { getByTestId } = await renderLoaded(makeProps(makeTrip(4)))

    await act(async () => {
      fireEvent.press(getByTestId("export-trip-btn"))
    })

    await waitFor(() => expect(NativeLocationService.exportTripsToFile).toHaveBeenCalled())
    expect(NativeLocationService.exportTripsToFile).toHaveBeenCalledWith(expect.any(Array), "gpx", expect.any(String))
    expect(NativeLocationService.shareFile).toHaveBeenCalled()
  })

  /** The dismiss button sits after the four formats, so its index must not export anything. */
  it("exports nothing when the format sheet is dismissed", async () => {
    ;(showChoice as jest.Mock).mockResolvedValueOnce(4)
    const { getByTestId } = await renderLoaded(makeProps(makeTrip(4)))

    await act(async () => {
      fireEvent.press(getByTestId("export-trip-btn"))
    })

    expect(NativeLocationService.exportTripsToFile).not.toHaveBeenCalled()
  })
})

describe("TripDetailScreen - delete", () => {
  beforeEach(() => jest.clearAllMocks())

  it("deletes nothing when the confirm is dismissed", async () => {
    const props = makeProps(makeTrip(4))
    const { getByTestId } = await renderLoaded(props)

    await act(async () => {
      fireEvent.press(getByTestId("trip-delete-btn"))
    })

    expect(showConfirm).toHaveBeenCalled()
    expect(NativeLocationService.deleteLocationsInRange).not.toHaveBeenCalled()
  })

  it("deletes the trip's range and leaves the screen", async () => {
    ;(showConfirm as jest.Mock).mockResolvedValueOnce(true)
    const props = makeProps(makeTrip(4))
    const { getByTestId } = await renderLoaded(props)

    await act(async () => {
      fireEvent.press(getByTestId("trip-delete-btn"))
    })

    await waitFor(() => expect(NativeLocationService.deleteLocationsInRange).toHaveBeenCalledWith(1000, 1300))
    expect(props.navigation.goBack).toHaveBeenCalled()
  })
})

describe("TripDetailScreen - split from the map", () => {
  beforeEach(() => jest.clearAllMocks())

  it("splits at the tapped point, keyed off the point before it", async () => {
    // A trip's locations are contiguous in the day, so the preceding point is the real boundary.
    // An off-by-one would write a pair that matches no gap and quietly do nothing.
    ;(showConfirm as jest.Mock).mockResolvedValueOnce(true)
    const props = makeProps(makeTrip(4))
    const { getByTestId } = await renderLoaded(props)

    fireEvent.press(getByTestId("trigger-point-split"))

    await waitFor(() =>
      expect(NativeLocationService.addBoundaryOverrides).toHaveBeenCalledWith([
        { before_timestamp: 1100, after_timestamp: 1200, action: BOUNDARY_ACTION_SPLIT }
      ])
    )
  })

  it("returns to the day view, which re-segments on focus", async () => {
    // Staying would show route.params.trip, a snapshot the split just invalidated
    ;(showConfirm as jest.Mock).mockResolvedValueOnce(true)
    const props = makeProps(makeTrip(4))
    const { getByTestId } = await renderLoaded(props)

    fireEvent.press(getByTestId("trigger-point-split"))

    await waitFor(() => expect(props.navigation.goBack).toHaveBeenCalled())
  })

  it("splits nothing when the confirm is dismissed", async () => {
    const props = makeProps(makeTrip(4))
    const { getByTestId } = await renderLoaded(props)

    fireEvent.press(getByTestId("trigger-point-split"))

    await waitFor(() => expect(showConfirm).toHaveBeenCalled())
    expect(NativeLocationService.addBoundaryOverrides).not.toHaveBeenCalled()
    expect(props.navigation.goBack).not.toHaveBeenCalled()
  })

  it("does not split at the trip's first point", async () => {
    // That point already starts the trip, so it bails before the dialog - there is no
    // question worth asking.
    const props = makeProps(makeTrip(4))
    const { getByTestId } = await renderLoaded(props)

    fireEvent.press(getByTestId("trigger-point-split-first"))

    expect(showConfirm).not.toHaveBeenCalled()
    expect(NativeLocationService.addBoundaryOverrides).not.toHaveBeenCalled()
  })

  it("does not split a two-point trip into a one-point trip", async () => {
    // A one-point trip has no duration and no distance, and cannot be split again
    const props = makeProps(makeTrip(2))
    const { getByTestId } = await renderLoaded(props)

    fireEvent.press(getByTestId("trigger-point-split"))

    // Says why instead of doing nothing
    expect(showAlert).toHaveBeenCalledWith("Cannot split here", expect.any(String), "info")
    expect(showConfirm).not.toHaveBeenCalled()
    expect(NativeLocationService.addBoundaryOverrides).not.toHaveBeenCalled()
  })

  it("does not split at the trip's last point", async () => {
    const props = makeProps(makeTrip(4))
    const { getByTestId } = await renderLoaded(props)

    fireEvent.press(getByTestId("trigger-point-split-last"))

    expect(showConfirm).not.toHaveBeenCalled()
    expect(NativeLocationService.addBoundaryOverrides).not.toHaveBeenCalled()
  })

  it("keeps the user on the screen when the split fails", async () => {
    ;(showConfirm as jest.Mock).mockResolvedValueOnce(true)
    ;(NativeLocationService.addBoundaryOverrides as jest.Mock).mockRejectedValueOnce(new Error("bridge down"))
    const props = makeProps(makeTrip(4))
    const { getByTestId } = await renderLoaded(props)

    fireEvent.press(getByTestId("trigger-point-split"))

    await waitFor(() => expect(NativeLocationService.addBoundaryOverrides).toHaveBeenCalled())
    expect(props.navigation.goBack).not.toHaveBeenCalled()
  })
})

describe("TripDetailScreen - notes saved on the map", () => {
  beforeEach(() => jest.clearAllMocks())

  /** The map is unmounted when this screen is left, so a saved note has to live in the screen. */
  it("hands a note saved this session back to the map", async () => {
    const { getByTestId } = render(<TripDetailScreen {...makeProps(makeTrip(3))} />)
    await act(async () => {})

    fireEvent.press(getByTestId("trigger-point-note"))

    await waitFor(() => expect(NativeLocationService.updateLocationNote).toHaveBeenCalledWith(1, "lunch"))
    await waitFor(() => expect(getByTestId("TrackMap-overrides").props.children).toContain("lunch"))
  })
})
