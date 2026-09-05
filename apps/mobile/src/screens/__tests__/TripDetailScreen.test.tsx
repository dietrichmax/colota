import React from "react"
import { render, fireEvent, waitFor, act } from "@testing-library/react-native"
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
  showConfirm: jest.fn().mockResolvedValue(false)
}))

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn() }
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
  return { InteractiveLineChart: (_props: any) => R.createElement(View, { testID: "Chart" }) }
})

jest.mock("../../components/ui/Container", () => {
  const R = require("react")
  const { View } = require("react-native")
  return { Container: ({ children }: any) => R.createElement(View, null, children) }
})

jest.mock("../../components/ui/Button", () => ({
  Button: function (props: any) {
    return require("react").createElement(
      require("react-native").Pressable,
      { testID: props.testID, onPress: props.onPress, disabled: props.disabled, accessibilityRole: "button" },
      require("react").createElement(require("react-native").Text, null, props.title)
    )
  }
}))

jest.mock("../../components/ui/Card", () => {
  const R = require("react")
  const { View } = require("react-native")
  return { Card: ({ children }: any) => R.createElement(View, null, children) }
})

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
      text: "#000",
      textSecondary: "#6b7280",
      textDisabled: "#9ca3af",
      textOnPrimary: "#fff",
      border: "#e5e7eb",
      card: "#fff",
      background: "#fff",
      error: "#ef4444",
      pressedOpacity: 0.7,
      borderRadius: 8
    }
  })
}))

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const { Text } = require("react-native")
  const stub = (name: string) => (_props: any) => R.createElement(Text, null, name)
  return {
    Route: stub("Route"),
    Clock: stub("Clock"),
    Gauge: stub("Gauge"),
    TrendingUp: stub("TrendingUp"),
    TrendingDown: stub("TrendingDown"),
    MapPin: stub("MapPin"),
    Share: stub("Share"),
    Trash2: stub("Trash2"),
    ChevronLeft: stub("ChevronLeft"),
    ChevronRight: stub("ChevronRight")
  }
})

import { TripDetailScreen } from "../TripDetailScreen"
import NativeLocationService from "../../services/NativeLocationService"
import { showConfirm, showAlert } from "../../services/modalService"
import { BOUNDARY_ACTION_SPLIT } from "../../types/global"

function makeTrip(pointCount: number): Trip {
  const locations = Array.from({ length: pointCount }, (_, i) => ({
    id: i + 1,
    latitude: 52.52 + i * 0.01,
    longitude: 13.405,
    timestamp: 1000 + i * 100
  }))
  return {
    index: 1,
    locations,
    startTime: locations[0].timestamp,
    endTime: locations[locations.length - 1].timestamp,
    distance: 4000,
    locationCount: pointCount,
    startIndex: 0
  }
}

const makeProps = (trip: Trip) =>
  ({
    navigation: { setOptions: jest.fn(), goBack: jest.fn(), setParams: jest.fn() },
    route: { params: { trip, trips: [trip] } }
  }) as any

describe("TripDetailScreen - split from the map", () => {
  beforeEach(() => jest.clearAllMocks())

  // Splitting is refused until the boundary overrides land, so pressing straight after render
  // would exercise that guard rather than the reason each test is named for
  const renderLoaded = async (props: ReturnType<typeof makeProps>) => {
    const utils = render(<TripDetailScreen {...props} />)
    await act(async () => {})
    return utils
  }

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
    expect(showAlert).toHaveBeenCalledWith("Cannot Split Here", expect.any(String), "info")
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
