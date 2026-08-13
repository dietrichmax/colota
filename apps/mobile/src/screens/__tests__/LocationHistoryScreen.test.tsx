import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"

// --- Mocks ---

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getDaysWithData: jest.fn().mockResolvedValue([]),
    getDaysWithNotes: jest.fn().mockResolvedValue([]),
    getDailyStats: jest.fn().mockResolvedValue([]),
    getLocationsByDateRange: jest.fn().mockResolvedValue([]),
    exportTripsToFile: jest.fn().mockResolvedValue("/tmp/export"),
    shareFile: jest.fn(),
    deleteLocationsInRange: jest.fn().mockResolvedValue(0),
    deleteLocationsByIds: jest.fn().mockResolvedValue(0),
    getBoundaryOverrides: jest.fn().mockResolvedValue([]),
    addBoundaryOverrides: jest.fn().mockResolvedValue(undefined)
  }
}))

// boundarySplits stays real - the split guard's correctness is what the tests below check
jest.mock("../../utils/trips", () => ({
  ...jest.requireActual("../../utils/trips"),
  segmentTrips: jest.fn().mockReturnValue([]),
  getTripColor: jest.fn().mockReturnValue("#3B82F6"),
  buildBoundaryOverrideMap: jest.fn().mockReturnValue(new Map()),
  gapsBetweenTrips: jest.fn().mockReturnValue([])
}))

// The screen uses all four. A partial mock throws inside fetchTrackData's own catch, which
// skips the fetch without failing anything.
jest.mock("../../utils/geo", () => ({
  formatDistance: jest.fn().mockReturnValue("0 km"),
  formatTime: jest.fn().mockReturnValue("12:00"),
  startOfDaySec: jest.fn().mockReturnValue(0),
  endOfDaySec: jest.fn().mockReturnValue(86399)
}))

jest.mock("../../utils/exportConverters", () => ({
  EXPORT_FORMATS: {}
}))

jest.mock("../../services/modalService", () => ({
  showAlert: jest.fn(),
  showConfirm: jest.fn().mockResolvedValue(false)
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
      primaryDark: "#115E59",
      border: "#e5e7eb",
      text: "#000",
      textSecondary: "#6b7280",
      textLight: "#9ca3af",
      background: "#fff",
      success: "#22c55e",
      error: "#ef4444",
      card: "#fff",
      surface: "#fff",
      backgroundElevated: "#f9fafb",
      textOnPrimary: "#fff",
      borderRadius: 8
    }
  })
}))

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const { Text } = require("react-native")
  const stub = (name: string) => (_props: any) => R.createElement(Text, null, name)
  return {
    BarChart2: stub("BarChart2")
  }
})

jest.mock("../../components", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children)
  }
})

jest.mock("../../components/features/inspector/CalendarPicker", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    CalendarPicker: (_props: any) => R.createElement(View, { testID: "CalendarPicker" })
  }
})

jest.mock("../../components/features/inspector/TrackMap", () => {
  const R = require("react")
  const { View, Pressable } = require("react-native")
  return {
    TrackMap: (props: any) =>
      R.createElement(View, { testID: "TrackMap" }, [
        props.onPointDelete
          ? R.createElement(Pressable, {
              key: "d",
              testID: "trigger-point-delete",
              onPress: () => props.onPointDelete(7)
            })
          : null,
        props.onPointSplit
          ? R.createElement(Pressable, {
              key: "s",
              testID: "trigger-point-split",
              onPress: () => props.onPointSplit(props.locations?.[2]?.id ?? 7)
            })
          : null,
        props.onPointSplit
          ? R.createElement(Pressable, {
              key: "s0",
              testID: "trigger-point-split-first",
              onPress: () => props.onPointSplit(props.locations?.[0]?.id ?? 7)
            })
          : null
      ])
  }
})

jest.mock("../../components/features/inspector/TripList", () => {
  const R = require("react")
  const { View, Pressable } = require("react-native")
  const TRIP_A = { index: 1, locations: [], startTime: 100, endTime: 200, distance: 0, locationCount: 2, startIndex: 0 }
  const TRIP_B = { index: 2, locations: [], startTime: 900, endTime: 950, distance: 0, locationCount: 2, startIndex: 5 }
  return {
    TripList: (props: any) =>
      R.createElement(
        View,
        { testID: "TripList" },
        props.onMerge
          ? R.createElement(Pressable, {
              testID: "trigger-trip-merge",
              onPress: () => props.onMerge([TRIP_A, TRIP_B])
            })
          : null
      )
  }
})

jest.mock("../../components/features/inspector/LocationTable", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    LocationTable: (_props: any) => R.createElement(View, { testID: "LocationTable" })
  }
})

jest.mock("../../styles/typography", () => ({
  fonts: { regular: {}, bold: {}, semiBold: {} }
}))

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn()
}))

import { LocationHistoryScreen } from "../LocationInspectorScreen"
import NativeLocationService from "../../services/NativeLocationService"
import { showConfirm, showAlert } from "../../services/modalService"
import { gapsBetweenTrips, segmentTrips } from "../../utils/trips"
import { BOUNDARY_ACTION_SPLIT } from "../../types/global"

const createProps = () =>
  ({
    navigation: {
      navigate: jest.fn(),
      setOptions: jest.fn()
    },
    route: {
      params: {}
    }
  }) as any

// Five points 100s apart: one trip, with index 2 the only point a split can apply to
const DAY_TRIP = {
  index: 1,
  locations: [],
  startTime: 1000,
  endTime: 1400,
  distance: 500,
  locationCount: 5,
  startIndex: 0
}

const DAY_POINTS = [
  { id: 1, latitude: 52.52, longitude: 13.405, timestamp: 1000 },
  { id: 2, latitude: 52.53, longitude: 13.405, timestamp: 1100 },
  { id: 3, latitude: 52.54, longitude: 13.405, timestamp: 1200 },
  { id: 4, latitude: 52.55, longitude: 13.405, timestamp: 1300 },
  { id: 5, latitude: 52.56, longitude: 13.405, timestamp: 1400 }
]

describe("LocationHistoryScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("renders all three tabs (Map, Trips, Data)", () => {
    const props = createProps()
    const { getByText } = render(<LocationHistoryScreen {...props} />)

    expect(getByText("Map")).toBeTruthy()
    expect(getByText("Trips")).toBeTruthy()
    expect(getByText("Data")).toBeTruthy()
  })

  it("Map tab is active by default", () => {
    const props = createProps()
    const { getByTestId, queryByTestId } = render(<LocationHistoryScreen {...props} />)

    // Map tab shows TrackMap
    expect(getByTestId("TrackMap")).toBeTruthy()
    // Trips and Data content should not be visible
    expect(queryByTestId("TripList")).toBeNull()
    expect(queryByTestId("LocationTable")).toBeNull()
  })

  it("deletes nothing when the point delete confirm is dismissed", async () => {
    const props = createProps()
    const { getByTestId } = render(<LocationHistoryScreen {...props} />)

    fireEvent.press(getByTestId("trigger-point-delete"))

    await waitFor(() => expect(showConfirm).toHaveBeenCalled())
    expect(NativeLocationService.deleteLocationsByIds).not.toHaveBeenCalled()
  })

  it("splits at the tapped point, keyed off the point before it", async () => {
    // Resolved through the day's array, so the boundary matches a gap segmentTrips will see
    ;(showConfirm as jest.Mock).mockResolvedValueOnce(true)
    ;(segmentTrips as jest.Mock).mockReturnValue([DAY_TRIP])
    ;(NativeLocationService.getLocationsByDateRange as jest.Mock).mockResolvedValueOnce(DAY_POINTS)
    const { getByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await waitFor(() => expect(NativeLocationService.getLocationsByDateRange).toHaveBeenCalled())

    fireEvent.press(getByTestId("trigger-point-split"))

    await waitFor(() =>
      expect(NativeLocationService.addBoundaryOverrides).toHaveBeenCalledWith([
        { before_timestamp: 1100, after_timestamp: 1200, action: BOUNDARY_ACTION_SPLIT }
      ])
    )
  })

  it("does not split a run that is not a displayed trip", async () => {
    // The map draws stationary runs the extent filter dropped. Splitting inside one would exempt
    // both halves from that filter and turn GPS jitter into trips, with its path length counted
    // as distance - exactly what the filter exists to prevent.
    ;(segmentTrips as jest.Mock).mockReturnValue([])
    ;(NativeLocationService.getLocationsByDateRange as jest.Mock).mockResolvedValueOnce(DAY_POINTS)
    const { getByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await waitFor(() => expect(NativeLocationService.getLocationsByDateRange).toHaveBeenCalled())

    fireEvent.press(getByTestId("trigger-point-split"))

    await waitFor(() => expect(showAlert).toHaveBeenCalledWith("Cannot Split Here", expect.any(String), "info"))
    expect(showConfirm).not.toHaveBeenCalled()
    expect(NativeLocationService.addBoundaryOverrides).not.toHaveBeenCalled()
  })

  it("splits nothing when the split confirm is dismissed", async () => {
    ;(segmentTrips as jest.Mock).mockReturnValue([DAY_TRIP])
    ;(NativeLocationService.getLocationsByDateRange as jest.Mock).mockResolvedValueOnce(DAY_POINTS)
    const { getByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await waitFor(() => expect(NativeLocationService.getLocationsByDateRange).toHaveBeenCalled())

    fireEvent.press(getByTestId("trigger-point-split"))

    await waitFor(() => expect(showConfirm).toHaveBeenCalled())
    expect(NativeLocationService.addBoundaryOverrides).not.toHaveBeenCalled()
  })

  it("does not split at a boundary that already splits", async () => {
    // Forcing a split where the gap threshold already splits is not a harmless no-op: a forced
    // split exempts the segments either side from the extent filter, so a stationary run the
    // segmenter drops on purpose would reappear as a trip in both the list and the calendar.
    ;(segmentTrips as jest.Mock).mockReturnValue([
      { ...DAY_TRIP, locationCount: 2 },
      { ...DAY_TRIP, index: 2, locationCount: 3, startIndex: 2 }
    ])
    ;(NativeLocationService.getLocationsByDateRange as jest.Mock).mockResolvedValueOnce([
      { id: 1, latitude: 52.52, longitude: 13.405, timestamp: 1000 },
      { id: 2, latitude: 52.53, longitude: 13.405, timestamp: 1100 },
      // 1000s later, over the 900s threshold, so index 2 already starts a trip
      { id: 3, latitude: 52.54, longitude: 13.405, timestamp: 2100 },
      { id: 4, latitude: 52.55, longitude: 13.405, timestamp: 2200 },
      { id: 5, latitude: 52.56, longitude: 13.405, timestamp: 2300 }
    ])
    const { getByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await waitFor(() => expect(NativeLocationService.getLocationsByDateRange).toHaveBeenCalled())

    fireEvent.press(getByTestId("trigger-point-split"))

    // Explains rather than doing nothing
    await waitFor(() => expect(showAlert).toHaveBeenCalledWith("Cannot Split Here", expect.any(String), "info"))
    expect(showConfirm).not.toHaveBeenCalled()
    expect(NativeLocationService.addBoundaryOverrides).not.toHaveBeenCalled()
  })

  it("does not split at the first point of the day", async () => {
    // There is no earlier point to end a trip on, so the boundary would be meaningless
    ;(segmentTrips as jest.Mock).mockReturnValue([DAY_TRIP])
    ;(NativeLocationService.getLocationsByDateRange as jest.Mock).mockResolvedValueOnce(DAY_POINTS)
    const { getByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await waitFor(() => expect(NativeLocationService.getLocationsByDateRange).toHaveBeenCalled())

    fireEvent.press(getByTestId("trigger-point-split-first"))

    await waitFor(() => expect(NativeLocationService.getBoundaryOverrides).toHaveBeenCalled())
    // Bails before the dialog: there is no question worth asking
    expect(showConfirm).not.toHaveBeenCalled()
    expect(NativeLocationService.addBoundaryOverrides).not.toHaveBeenCalled()
  })

  it("merges nothing when the merge confirm is dismissed", async () => {
    const props = createProps()
    const { getByText, getByTestId } = render(<LocationHistoryScreen {...props} />)

    fireEvent.press(getByText("Trips"))
    fireEvent.press(getByTestId("trigger-trip-merge"))

    await waitFor(() => expect(showConfirm).toHaveBeenCalled())
    expect(NativeLocationService.addBoundaryOverrides).not.toHaveBeenCalled()
  })

  it("passes whatever gapsBetweenTrips resolves straight through to the bridge", async () => {
    // gapsBetweenTrips is mocked, so this covers the plumbing only - which boundaries it picks
    // is tested against the real function in trips.test.ts
    ;(showConfirm as jest.Mock).mockResolvedValueOnce(true)
    const gaps = [
      { before_timestamp: 200, after_timestamp: 500, action: 0 },
      { before_timestamp: 500, after_timestamp: 900, action: 0 }
    ]
    ;(gapsBetweenTrips as jest.Mock).mockReturnValueOnce(gaps)

    const props = createProps()
    const { getByText, getByTestId } = render(<LocationHistoryScreen {...props} />)

    fireEvent.press(getByText("Trips"))
    fireEvent.press(getByTestId("trigger-trip-merge"))

    await waitFor(() => expect(NativeLocationService.addBoundaryOverrides).toHaveBeenCalledWith(gaps))
  })

  it("switches to Trips tab on press", () => {
    const props = createProps()
    const { getByText, getByTestId, queryByTestId } = render(<LocationHistoryScreen {...props} />)

    fireEvent.press(getByText("Trips"))

    expect(getByTestId("TripList")).toBeTruthy()
    expect(queryByTestId("TrackMap")).toBeNull()
    expect(queryByTestId("LocationTable")).toBeNull()
  })

  it("switches to Data tab on press", () => {
    const props = createProps()
    const { getByText, getByTestId, queryByTestId } = render(<LocationHistoryScreen {...props} />)

    fireEvent.press(getByText("Data"))

    expect(getByTestId("LocationTable")).toBeTruthy()
    expect(queryByTestId("TrackMap")).toBeNull()
    expect(queryByTestId("TripList")).toBeNull()
  })

  it("renders CalendarPicker in each tab", () => {
    const props = createProps()
    const { getByText, getByTestId } = render(<LocationHistoryScreen {...props} />)

    // Map tab (default) - should have CalendarPicker
    expect(getByTestId("CalendarPicker")).toBeTruthy()

    // Switch to Trips tab
    fireEvent.press(getByText("Trips"))
    expect(getByTestId("CalendarPicker")).toBeTruthy()

    // Switch to Data tab
    fireEvent.press(getByText("Data"))
    expect(getByTestId("CalendarPicker")).toBeTruthy()
  })

  it("shows LocationTable in Data tab", () => {
    const props = createProps()
    const { getByText, getByTestId } = render(<LocationHistoryScreen {...props} />)

    // Initially not visible
    expect(() => getByTestId("LocationTable")).toThrow()

    // Switch to Data tab
    fireEvent.press(getByText("Data"))

    expect(getByTestId("LocationTable")).toBeTruthy()
  })
})
