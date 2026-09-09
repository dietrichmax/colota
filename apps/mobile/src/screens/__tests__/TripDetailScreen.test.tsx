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
    getSetting: jest.fn().mockResolvedValue(""),
    exportTripsToFile: jest.fn().mockResolvedValue("/tmp/export"),
    shareFile: jest.fn()
  }
}))

jest.mock("../../services/modalService", () => ({
  showAlert: jest.fn(),
  showConfirm: jest.fn().mockResolvedValue(false),
  showPrompt: jest.fn().mockResolvedValue(null)
}))

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

// A point tap hands the screen an id, and the screen docks the card; no real map is needed
jest.mock("../../components/features/inspector/TrackMap", () => {
  const R = require("react")
  const { View, Pressable, Text } = require("react-native")
  const trigger = (props: any, testID: string, pick: (locations: any[]) => any) =>
    R.createElement(Pressable, { key: testID, testID, onPress: () => props.onSelectPoint(pick(props.locations)?.id) })
  return {
    TrackMap: (props: any) =>
      R.createElement(
        View,
        { testID: "TrackMap" },
        R.createElement(Text, { testID: "TrackMap-overrides" }, JSON.stringify(props.noteOverrides ?? {})),
        R.createElement(
          Text,
          { testID: "TrackMap-frame" },
          JSON.stringify({ cameraPadding: props.cameraPadding, controlsBottom: props.controlsBottom })
        ),
        trigger(props, "select-point-first", (l) => l[0]),
        trigger(props, "select-point", (l) => l[2]),
        trigger(props, "select-point-last", (l) => l[l.length - 1])
      )
  }
})

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 })
}))

jest.mock("../../components/features/inspector/InteractiveLineChart", () => {
  const R = require("react")
  const { View } = require("react-native")
  return { InteractiveLineChart: (_props: any) => R.createElement(View, { testID: "Chart" }) }
})

jest.mock("../../components/ui/ExportFormatDialog", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    ExportFormatDialog: (props: any) =>
      props.visible ? R.createElement(View, { testID: "ExportFormatDialog", ...props }) : null
  }
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

jest.mock("../../components/ui/Divider", () => {
  const R = require("react")
  const { View } = require("react-native")
  return { Divider: (props: any) => R.createElement(View, { testID: "divider", ...props }) }
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
      error: "#ef4444"
    }
  })
}))

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const { Text } = require("react-native")
  return new Proxy({}, { get: (_target, name) => (_props: any) => R.createElement(Text, null, String(name)) })
})

import { TripDetailScreen } from "../TripDetailScreen"
import NativeLocationService from "../../services/NativeLocationService"
import { showConfirm, showAlert, showPrompt } from "../../services/modalService"
import { BOUNDARY_ACTION_SPLIT } from "../../types/global"
import { space, size } from "../../constants"

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

  const splitAt = (getByTestId: (id: string) => any, point: string) => {
    fireEvent.press(getByTestId(point))
    fireEvent.press(getByTestId("point-split"))
  }

  it("splits at the tapped point, keyed off the point before it", async () => {
    // A trip's locations are contiguous in the day, so the preceding point is the real boundary.
    // An off-by-one would write a pair that matches no gap and quietly do nothing.
    ;(showConfirm as jest.Mock).mockResolvedValueOnce(true)
    const props = makeProps(makeTrip(4))
    const { getByTestId } = await renderLoaded(props)

    splitAt(getByTestId, "select-point")

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

    splitAt(getByTestId, "select-point")

    await waitFor(() => expect(props.navigation.goBack).toHaveBeenCalled())
  })

  it("splits nothing when the confirm is dismissed", async () => {
    const props = makeProps(makeTrip(4))
    const { getByTestId } = await renderLoaded(props)

    splitAt(getByTestId, "select-point")

    await waitFor(() => expect(showConfirm).toHaveBeenCalled())
    expect(NativeLocationService.addBoundaryOverrides).not.toHaveBeenCalled()
    expect(props.navigation.goBack).not.toHaveBeenCalled()
  })

  it("does not split at the trip's first point", async () => {
    // That point already starts the trip, so it bails before the dialog - there is no
    // question worth asking.
    const props = makeProps(makeTrip(4))
    const { getByTestId } = await renderLoaded(props)

    splitAt(getByTestId, "select-point-first")

    expect(showConfirm).not.toHaveBeenCalled()
    expect(NativeLocationService.addBoundaryOverrides).not.toHaveBeenCalled()
  })

  it("does not split a two-point trip into a one-point trip", async () => {
    // A one-point trip has no duration and no distance, and cannot be split again
    const props = makeProps(makeTrip(2))
    const { getByTestId } = await renderLoaded(props)

    splitAt(getByTestId, "select-point-last")

    // Says why instead of doing nothing
    expect(showAlert).toHaveBeenCalledWith("Cannot Split Here", expect.any(String), "info")
    expect(showConfirm).not.toHaveBeenCalled()
    expect(NativeLocationService.addBoundaryOverrides).not.toHaveBeenCalled()
  })

  it("does not split at the trip's last point", async () => {
    const props = makeProps(makeTrip(4))
    const { getByTestId } = await renderLoaded(props)

    splitAt(getByTestId, "select-point-last")

    expect(showConfirm).not.toHaveBeenCalled()
    expect(NativeLocationService.addBoundaryOverrides).not.toHaveBeenCalled()
  })

  it("keeps the user on the screen when the split fails", async () => {
    ;(showConfirm as jest.Mock).mockResolvedValueOnce(true)
    ;(NativeLocationService.addBoundaryOverrides as jest.Mock).mockRejectedValueOnce(new Error("bridge down"))
    const props = makeProps(makeTrip(4))
    const { getByTestId } = await renderLoaded(props)

    splitAt(getByTestId, "select-point")

    await waitFor(() => expect(NativeLocationService.addBoundaryOverrides).toHaveBeenCalled())
    expect(props.navigation.goBack).not.toHaveBeenCalled()
  })
})

describe("TripDetailScreen - point card over the map", () => {
  beforeEach(() => jest.clearAllMocks())

  it("docks the tapped point's card over the map and lifts the camera above it until the card closes", async () => {
    const { getByTestId, queryByTestId } = render(<TripDetailScreen {...makeProps(makeTrip(4))} />)
    await act(async () => {})
    const frame = () => JSON.parse(getByTestId("TrackMap-frame").props.children)
    const base = {
      top: space.lg,
      bottom: space.lg + space.lg,
      left: space.lg,
      right: space.lg + size.iconColumn + space.lg
    }
    expect(queryByTestId("point-card")).toBeNull()
    expect(frame()).toEqual({ cameraPadding: base, controlsBottom: space.lg + space.sm })

    fireEvent.press(getByTestId("select-point"))
    fireEvent(getByTestId("inspector-dock"), "layout", { nativeEvent: { layout: { height: 200 } } })

    expect(getByTestId("point-card")).toBeTruthy()
    expect(frame()).toEqual({
      cameraPadding: { ...base, bottom: 200 + space.lg + space.lg },
      controlsBottom: space.lg + 200 + space.sm
    })

    fireEvent.press(getByTestId("point-close"))

    expect(queryByTestId("point-card")).toBeNull()
    expect(frame()).toEqual({ cameraPadding: base, controlsBottom: space.lg + space.sm })
  })

  it("offers split and a note but no delete, since a trip's points are removed with the trip", async () => {
    const { getByTestId, queryByLabelText, getByLabelText } = render(<TripDetailScreen {...makeProps(makeTrip(4))} />)
    await act(async () => {})

    fireEvent.press(getByTestId("select-point"))

    expect(getByLabelText("Start a new trip here")).toBeTruthy()
    expect(getByLabelText("Note, Add a note")).toBeTruthy()
    expect(queryByLabelText("Delete point")).toBeNull()
  })

  it("drops the card when the chevrons swap in another trip, whose points it does not describe", async () => {
    const props = makeProps(makeTrip(4))
    const { getByTestId, queryByTestId, rerender } = render(<TripDetailScreen {...props} />)
    await act(async () => {})
    fireEvent.press(getByTestId("select-point"))
    expect(getByTestId("point-card")).toBeTruthy()

    const next = { ...makeTrip(4), index: 2 }
    rerender(<TripDetailScreen {...props} route={{ params: { trip: next, trips: [props.route.params.trip, next] } }} />)

    expect(queryByTestId("point-card")).toBeNull()
  })

  /** The map is unmounted when this screen is left, so a saved note has to live in the screen. */
  it("hands a note saved from the card back to the map", async () => {
    const { getByTestId, getByText } = render(<TripDetailScreen {...makeProps(makeTrip(3))} />)
    await act(async () => {})

    fireEvent.press(getByTestId("select-point-first"))
    ;(showPrompt as jest.Mock).mockResolvedValueOnce("lunch")
    fireEvent.press(getByTestId("point-note"))

    await waitFor(() => expect(NativeLocationService.updateLocationNote).toHaveBeenCalledWith(1, "lunch"))
    await waitFor(() => expect(getByTestId("TrackMap-overrides").props.children).toContain("lunch"))
    expect(getByText("lunch")).toBeTruthy()
  })
})

describe("TripDetailScreen - figures card", () => {
  beforeEach(() => jest.clearAllMocks())

  it("starts every seam between the figure rows at the text column, so it meets the label like the dock's do", async () => {
    const { getAllByTestId } = render(<TripDetailScreen {...makeProps(makeTrip(4))} />)
    await act(async () => {})

    const seams = getAllByTestId("divider")
    expect(seams).toHaveLength(3)
    for (const seam of seams) expect(seam.props).toMatchObject({ tight: true, inset: true })
  })
})

describe("TripDetailScreen - header and stepper", () => {
  beforeEach(() => jest.clearAllMocks())

  const headerRight = (props: any) => render(props.navigation.setOptions.mock.calls.at(-1)[0].headerRight())

  it("names the trip with its swatch over its date and times, between chevrons that step the day's trips", async () => {
    const first = makeTrip(3)
    const second = { ...makeTrip(3), index: 2 }
    const props = { ...makeProps(first), route: { params: { trip: first, trips: [first, second] } } }
    const { getByTestId, getByLabelText } = render(<TripDetailScreen {...props} />)
    await act(async () => {})

    expect(getByTestId("trip-title").props.accessibilityLabel).toMatch(/^Trip 1, /)
    expect(getByLabelText("Previous trip").props.accessibilityState).toEqual({ disabled: true })
    fireEvent.press(getByLabelText("Next trip"))
    expect(props.navigation.setParams).toHaveBeenCalledWith({ trip: second })
  })

  it("exports from the app bar through the format dialog, with no button at the foot of the page", async () => {
    const props = makeProps(makeTrip(3))
    const { getByTestId, queryByTestId, queryByText } = render(<TripDetailScreen {...props} />)
    await act(async () => {})
    expect(queryByText("Export trip")).toBeNull()
    expect(queryByTestId("ExportFormatDialog")).toBeNull()

    fireEvent.press(headerRight(props).getByLabelText("Export trip"))
    const dialog = getByTestId("ExportFormatDialog")
    expect(dialog.props.title).toBe("Export Trip 1")
    await act(async () => dialog.props.onSelect("gpx"))

    await waitFor(() => expect(NativeLocationService.exportTripsToFile).toHaveBeenCalled())
    expect((NativeLocationService.exportTripsToFile as jest.Mock).mock.calls[0][1]).toBe("gpx")
    expect(queryByTestId("ExportFormatDialog")).toBeNull()
  })

  it("keeps Delete in the app bar beside Export", async () => {
    const props = makeProps(makeTrip(3))
    render(<TripDetailScreen {...props} />)
    await act(async () => {})

    const bar = headerRight(props)
    expect(bar.getByLabelText("Export trip")).toBeTruthy()
    expect(bar.getByLabelText("Delete trip")).toBeTruthy()
  })
})
