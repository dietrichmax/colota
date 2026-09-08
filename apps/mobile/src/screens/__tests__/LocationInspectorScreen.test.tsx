import React from "react"
import { AccessibilityInfo, BackHandler } from "react-native"
import { render, fireEvent, waitFor, act } from "@testing-library/react-native"
import { DEFAULT_SETTINGS, type Settings } from "../../types/global"
import { dayKey } from "../../utils/inspectorDay"

// Every locations array the map is handed, so a test can assert the identity survives a save
const mockMapLocationsSeen: any[] = []
let mockSettings: Settings = { ...DEFAULT_SETTINGS, endpoint: "" }
let mockTracking = false

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getSetting: jest.fn((key: string) => Promise.resolve(key === "unitSystem" ? "metric" : "24h")),
    getDaysWithData: jest.fn().mockResolvedValue([]),
    getDailyStats: jest.fn().mockResolvedValue([]),
    getLocationsByDateRange: jest.fn().mockResolvedValue([]),
    getBoundaryOverrides: jest.fn().mockResolvedValue([]),
    addBoundaryOverrides: jest.fn().mockResolvedValue(undefined),
    deleteLocationsInRanges: jest.fn().mockResolvedValue(0),
    deleteLocationsByIds: jest.fn().mockResolvedValue(0),
    updateLocationNote: jest.fn().mockResolvedValue(undefined),
    exportTripsToFile: jest.fn().mockResolvedValue("/tmp/export"),
    shareFile: jest.fn().mockResolvedValue(true)
  }
}))

// boundarySplits stays real - the split guard's correctness is what the split tests check
jest.mock("../../utils/trips", () => ({
  ...jest.requireActual("../../utils/trips"),
  segmentTrips: jest.fn().mockReturnValue([]),
  getTripColor: jest.fn().mockReturnValue("#3B82F6"),
  buildBoundaryOverrideMap: jest.fn().mockReturnValue(new Map()),
  gapsBetweenTrips: jest.fn().mockReturnValue([])
}))

jest.mock("../../services/modalService", () => ({
  showAlert: jest.fn(),
  showConfirm: jest.fn().mockResolvedValue(false),
  showChoice: jest.fn().mockResolvedValue(-1)
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors, isDark: false })
}))

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 })
}))

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn()
}))

jest.mock("../../contexts/TrackingProvider", () => ({
  useTracking: () => ({ settings: mockSettings, tracking: mockTracking })
}))

jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  const { dayKey: key } = require("../../utils/inspectorDay")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    HeaderAction: ({ label, hint, disabled, onPress, testID }: any) =>
      R.createElement(Pressable, {
        testID,
        onPress,
        disabled,
        accessibilityRole: "button",
        accessibilityLabel: label,
        accessibilityHint: hint,
        accessibilityState: { disabled: !!disabled }
      }),
    Divider: () => R.createElement(View, { testID: "divider" }),
    SpinningLoader: () => R.createElement(View, { testID: "spinner" }),
    EmptyState: ({ title, hint, action }: any) =>
      R.createElement(
        View,
        { testID: "EmptyState" },
        R.createElement(Text, null, title),
        hint ? R.createElement(Text, null, hint) : null,
        action
          ? R.createElement(
              Pressable,
              { accessibilityRole: "button", accessibilityLabel: action.label, onPress: action.onPress },
              R.createElement(Text, null, action.label)
            )
          : null
      ),
    DayHeader: (props: any) =>
      R.createElement(
        View,
        { testID: "DayHeader" },
        R.createElement(Text, { testID: "day-header-date" }, key(props.date)),
        R.createElement(Text, { testID: "day-header-ledger" }, props.loading ? "Loading" : JSON.stringify(props.stats)),
        R.createElement(Pressable, { testID: "day-previous", onPress: props.onPrevious }),
        R.createElement(Pressable, { testID: "day-title", onPress: props.onOpenPicker }),
        R.createElement(Pressable, {
          testID: "day-next",
          onPress: props.onNext,
          disabled: props.nextDisabled,
          accessibilityState: { disabled: props.nextDisabled }
        })
      ),
    DayPickerModal: (props: any) =>
      props.visible
        ? R.createElement(
            View,
            { testID: "DayPickerModal" },
            R.createElement(Pressable, {
              testID: "picker-select",
              onPress: () => {
                props.onSelect(new Date(2026, 0, 15))
                props.onRequestClose()
              }
            })
          )
        : null,
    InspectorDock: ({ content }: any) => {
      const children = [R.createElement(Text, { key: "kind", testID: "dock-kind" }, content.kind)]
      if (content.kind === "legend") {
        children.push(R.createElement(Text, { key: "f", testID: "dock-focused" }, String(content.focusedTripIndex)))
        content.trips.forEach((t: any) =>
          children.push(
            R.createElement(Pressable, {
              key: t.index,
              testID: `dock-trip-${t.index}`,
              onPress: () => content.onFocusTrip(content.focusedTripIndex === t.index ? null : t.index)
            })
          )
        )
      }
      if (content.kind === "points") children.push(R.createElement(Text, { key: "c" }, `${content.count} points`))
      if (content.kind === "point") {
        children.push(
          R.createElement(Text, { key: "id", testID: "point-id" }, String(content.point.id)),
          R.createElement(Text, { key: "n", testID: "point-note" }, content.note ?? ""),
          R.createElement(Text, { key: "e", testID: "point-endpoint" }, String(content.hasEndpoint)),
          content.onSplit && R.createElement(Pressable, { key: "s", testID: "point-split", onPress: content.onSplit }),
          R.createElement(Pressable, { key: "d", testID: "point-delete", onPress: content.onDelete }),
          R.createElement(Pressable, { key: "x", testID: "point-close", onPress: content.onClose }),
          R.createElement(Pressable, {
            key: "w",
            testID: "point-save-note",
            onPress: () => content.onSaveNote("lunch")
          })
        )
      }
      if (content.kind === "empty") {
        children.push(
          R.createElement(Text, { key: "t" }, content.title),
          R.createElement(Text, { key: "h" }, content.hint),
          content.action
            ? R.createElement(
                Pressable,
                { key: "a", testID: "dock-empty-action", onPress: content.action.onPress },
                R.createElement(Text, null, content.action.label),
                R.createElement(Text, null, content.action.sub)
              )
            : null
        )
      }
      return R.createElement(View, { testID: "InspectorDock" }, children)
    },
    TrackMap: (props: any) => {
      mockMapLocationsSeen.push(props.locations)
      return R.createElement(
        View,
        { testID: "TrackMap" },
        R.createElement(Text, { key: "o", testID: "TrackMap-overrides" }, JSON.stringify(props.noteOverrides ?? {})),
        R.createElement(Text, { key: "s", testID: "TrackMap-selected" }, String(props.selectedPointId)),
        R.createElement(Text, { key: "f", testID: "TrackMap-focused" }, String(props.focusedTripIndex)),
        R.createElement(Pressable, {
          key: "p",
          testID: "map-select-point",
          onPress: () => props.onSelectPoint(props.locations?.[2]?.id ?? 7)
        }),
        R.createElement(Pressable, {
          key: "p0",
          testID: "map-select-first-point",
          onPress: () => props.onSelectPoint(props.locations?.[0]?.id ?? 7)
        }),
        R.createElement(Pressable, { key: "l", testID: "map-focus-line", onPress: () => props.onFocusTrip(2) })
      )
    }
  }
})

jest.mock("../../components/features/inspector/ExportFormatDialog", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    ExportFormatDialog: (props: any) =>
      props.visible ? R.createElement(View, { testID: "ExportFormatDialog", ...props }) : null
  }
})

jest.mock("../../components/features/inspector/TripList", () => {
  const R = require("react")
  const { View, Pressable } = require("react-native")
  return {
    TripList: ({ trips, selected, onToggle, onEnterSelection, onOpenTrip }: any) =>
      R.createElement(
        View,
        { testID: "TripList" },
        trips.map((t: any) =>
          R.createElement(Pressable, {
            key: t.index,
            testID: `trip-row-${t.index}`,
            accessibilityState: { selected: selected.has(t.index) },
            onPress: () => (selected.size > 0 ? onToggle(t.index) : onOpenTrip(t.index)),
            onLongPress: () => (selected.size > 0 ? onToggle(t.index) : onEnterSelection(t.index))
          })
        )
      )
  }
})

jest.mock("../../components/features/inspector/LocationTable", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    LocationTable: ({ locations, hasEndpoint, selectedPointId, onSelectPoint }: any) =>
      R.createElement(
        View,
        { testID: "LocationTable" },
        R.createElement(Text, { key: "e", testID: "table-endpoint" }, String(hasEndpoint)),
        R.createElement(Text, { key: "s", testID: "table-selected" }, String(selectedPointId)),
        locations.map((l: any) =>
          R.createElement(Pressable, { key: l.id, testID: `table-row-${l.id}`, onPress: () => onSelectPoint(l.id) })
        )
      )
  }
})

import { LocationHistoryScreen } from "../LocationInspectorScreen"
import NativeLocationService from "../../services/NativeLocationService"
import { showAlert, showChoice, showConfirm } from "../../services/modalService"
import { gapsBetweenTrips, segmentTrips } from "../../utils/trips"
import { lightColors } from "@colota/shared"
import { loadDisplayPreferences } from "../../utils/geo"

beforeAll(() => loadDisplayPreferences())

const TODAY = new Date()
const daysAgo = (n: number) => new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - n)

const DAY_POINTS = [
  { id: 1, latitude: 52.52, longitude: 13.405, timestamp: 1000 },
  { id: 2, latitude: 52.53, longitude: 13.405, timestamp: 1100 },
  { id: 3, latitude: 52.54, longitude: 13.405, timestamp: 1200 },
  { id: 4, latitude: 52.55, longitude: 13.405, timestamp: 1300 },
  { id: 5, latitude: 52.56, longitude: 13.405, timestamp: 1400 }
]

// Five points 100s apart: one trip, with index 2 the only point a split can apply to
const DAY_TRIP = {
  index: 1,
  locations: DAY_POINTS,
  startTime: 1000,
  endTime: 1400,
  distance: 500,
  locationCount: 5,
  startIndex: 0
}

const TRIP_1 = {
  index: 1,
  locations: DAY_POINTS.slice(0, 2),
  startTime: 1000,
  endTime: 1100,
  distance: 500,
  locationCount: 2,
  startIndex: 0
}
const TRIP_2 = {
  index: 2,
  locations: DAY_POINTS.slice(2, 4),
  startTime: 1200,
  endTime: 1300,
  distance: 700,
  locationCount: 2,
  startIndex: 2
}
const TRIP_3 = {
  index: 3,
  locations: DAY_POINTS.slice(4),
  startTime: 1400,
  endTime: 1400,
  distance: 300,
  locationCount: 1,
  startIndex: 4
}

const createProps = (params: Record<string, unknown> = {}) =>
  ({
    navigation: { navigate: jest.fn(), setOptions: jest.fn() },
    route: { params }
  }) as any

const lastOptions = (props: any) => props.navigation.setOptions.mock.calls.at(-1)[0]
const headerRight = (props: any) => render(lastOptions(props).headerRight())
const headerLeft = (props: any) => render(lastOptions(props).headerLeft())

const settled = (getByTestId: (id: string) => any) =>
  waitFor(() => expect(getByTestId("day-header-ledger").props.children).not.toBe("Loading"))

const withDay = (points = DAY_POINTS, trips: any[] = [TRIP_1, TRIP_2, TRIP_3]) => {
  ;(NativeLocationService.getLocationsByDateRange as jest.Mock).mockResolvedValue(points)
  ;(segmentTrips as jest.Mock).mockReturnValue(trips)
}

beforeEach(() => {
  jest.clearAllMocks()
  mockMapLocationsSeen.length = 0
  mockSettings = { ...DEFAULT_SETTINGS, endpoint: "" }
  mockTracking = false
  ;(NativeLocationService.getLocationsByDateRange as jest.Mock).mockResolvedValue([])
  ;(NativeLocationService.getDaysWithData as jest.Mock).mockResolvedValue([])
  ;(NativeLocationService.getDailyStats as jest.Mock).mockResolvedValue([])
  ;(segmentTrips as jest.Mock).mockReturnValue([])
  ;(showConfirm as jest.Mock).mockResolvedValue(false)
  ;(showChoice as jest.Mock).mockResolvedValue(-1)
})

describe("day navigation", () => {
  it("opens on the day the Summary screen asked for, in the lens it named", async () => {
    withDay()
    const target = daysAgo(3)
    const props = createProps({ initialDate: target.getTime(), initialTab: "trips" })
    const { getByTestId } = render(<LocationHistoryScreen {...props} />)
    await settled(getByTestId)

    expect(getByTestId("day-header-date").props.children).toBe(dayKey(target))
    expect(getByTestId("TripList")).toBeTruthy()
  })

  it("opens on today with the next chevron disabled and the summary as the only header action", async () => {
    const props = createProps()
    const { getByTestId } = render(<LocationHistoryScreen {...props} />)
    await settled(getByTestId)

    expect(getByTestId("day-header-date").props.children).toBe(dayKey(TODAY))
    expect(getByTestId("day-next").props.accessibilityState.disabled).toBe(true)
    const header = headerRight(props)
    expect(header.getByLabelText("Location summary")).toBeTruthy()
    expect(header.queryByLabelText("Go to today")).toBeNull()
    expect(header.queryByLabelText("Export day")).toBeNull()
  })

  it("steps back a day and offers the way back to today", async () => {
    const props = createProps()
    const { getByTestId } = render(<LocationHistoryScreen {...props} />)
    await settled(getByTestId)

    fireEvent.press(getByTestId("day-previous"))
    await settled(getByTestId)
    expect(getByTestId("day-header-date").props.children).toBe(dayKey(daysAgo(1)))
    expect(getByTestId("day-next").props.accessibilityState.disabled).toBe(false)

    fireEvent.press(headerRight(props).getByLabelText("Go to today"))
    await settled(getByTestId)
    expect(getByTestId("day-header-date").props.children).toBe(dayKey(TODAY))
  })

  it("opens the calendar from the title and jumps to the picked day", async () => {
    const props = createProps()
    const { getByTestId, queryByTestId } = render(<LocationHistoryScreen {...props} />)
    await settled(getByTestId)
    expect(queryByTestId("DayPickerModal")).toBeNull()

    fireEvent.press(getByTestId("day-title"))
    fireEvent.press(getByTestId("picker-select"))
    await settled(getByTestId)

    expect(queryByTestId("DayPickerModal")).toBeNull()
    expect(getByTestId("day-header-date").props.children).toBe("2026-01-15")
  })

  it("hands the header the day's ledger once the fetch lands", async () => {
    withDay()
    const { getByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await settled(getByTestId)

    expect(JSON.parse(getByTestId("day-header-ledger").props.children)).toEqual({
      points: 5,
      trips: 3,
      distanceMeters: 1500
    })
  })
})

describe("lenses", () => {
  it("shows exactly one lens and switches by tap", async () => {
    withDay()
    const { getByText, getByTestId, queryByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await settled(getByTestId)
    expect(getByTestId("TrackMap")).toBeTruthy()
    expect(queryByTestId("TripList")).toBeNull()

    fireEvent.press(getByText("Trips"))
    expect(getByTestId("TripList")).toBeTruthy()
    expect(queryByTestId("TrackMap")).toBeNull()

    fireEvent.press(getByText("Data"))
    expect(getByTestId("LocationTable")).toBeTruthy()
    expect(queryByTestId("TripList")).toBeNull()
  })

  it("tells the table whether a sync endpoint is configured", async () => {
    withDay()
    mockSettings = { ...DEFAULT_SETTINGS, endpoint: "https://example.org/api" }
    const { getByText, getByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await settled(getByTestId)

    fireEvent.press(getByText("Data"))
    expect(getByTestId("table-endpoint").props.children).toBe("true")
  })

  it("a Data row tap opens that point on the map", async () => {
    withDay()
    const { getByText, getByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await settled(getByTestId)

    fireEvent.press(getByText("Data"))
    fireEvent.press(getByTestId("table-row-3"))

    expect(getByTestId("TrackMap-selected").props.children).toBe("3")
    expect(getByTestId("dock-kind").props.children).toBe("point")
    expect(getByTestId("point-id").props.children).toBe("3")
  })

  it("the dock lists the trips as the legend and a row tap focuses one", async () => {
    withDay()
    const { getByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await settled(getByTestId)
    expect(getByTestId("dock-kind").props.children).toBe("legend")

    fireEvent.press(getByTestId("dock-trip-2"))
    expect(getByTestId("TrackMap-focused").props.children).toBe("2")
    expect(getByTestId("dock-focused").props.children).toBe("2")

    fireEvent.press(getByTestId("dock-trip-2"))
    expect(getByTestId("TrackMap-focused").props.children).toBe("null")
  })

  it("a day with points but no trips shows the points line on the map and the Show points route in Trips", async () => {
    withDay(DAY_POINTS, [])
    const { getByText, getByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await settled(getByTestId)
    expect(getByTestId("dock-kind").props.children).toBe("points")
    expect(getByText("5 points")).toBeTruthy()

    fireEvent.press(getByText("Trips"))
    expect(getByText("No trips")).toBeTruthy()
    fireEvent.press(getByText("Show points"))
    expect(getByTestId("LocationTable")).toBeTruthy()
  })

  it("changing day drops the selected point and the focused trip", async () => {
    withDay()
    const { getByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await settled(getByTestId)
    fireEvent.press(getByTestId("dock-trip-2"))
    expect(getByTestId("TrackMap-focused").props.children).toBe("2")
    fireEvent.press(getByTestId("map-select-point"))
    expect(getByTestId("dock-kind").props.children).toBe("point")

    fireEvent.press(getByTestId("day-previous"))
    expect(getByTestId("TrackMap-selected").props.children).toBe("null")
    expect(getByTestId("TrackMap-focused").props.children).toBe("null")
    await settled(getByTestId)
  })
})

describe("export", () => {
  it("offers Export day only with trips and runs the chosen format through the day naming", async () => {
    withDay()
    const props = createProps()
    const { getByTestId, queryByTestId } = render(<LocationHistoryScreen {...props} />)
    await settled(getByTestId)
    expect(queryByTestId("ExportFormatDialog")).toBeNull()

    fireEvent.press(headerRight(props).getByLabelText("Export day"))

    const dialog = getByTestId("ExportFormatDialog")
    expect(dialog.props.title).toBe("Export day")
    expect(dialog.props.message).toMatch(/3 trips/)
    await act(async () => dialog.props.onSelect("gpx"))

    await waitFor(() => expect(NativeLocationService.shareFile).toHaveBeenCalled())
    expect(NativeLocationService.exportTripsToFile).toHaveBeenCalledWith(
      [
        expect.objectContaining({ index: 1 }),
        expect.objectContaining({ index: 2 }),
        expect.objectContaining({ index: 3 })
      ],
      "gpx",
      expect.stringMatching(/^colota_trips_\d{4}-\d{2}-\d{2}\.gpx$/)
    )
    expect(queryByTestId("ExportFormatDialog")).toBeNull()
  })

  it("exports nothing when the chooser is dismissed", async () => {
    withDay()
    const props = createProps()
    const { getByTestId, queryByTestId } = render(<LocationHistoryScreen {...props} />)
    await settled(getByTestId)

    fireEvent.press(headerRight(props).getByLabelText("Export day"))
    await act(async () => getByTestId("ExportFormatDialog").props.onRequestClose())

    expect(queryByTestId("ExportFormatDialog")).toBeNull()
    expect(NativeLocationService.exportTripsToFile).not.toHaveBeenCalled()
  })
})

describe("selection", () => {
  const selectTrips = async (props: any, indices: number[]) => {
    const screen = render(<LocationHistoryScreen {...props} />)
    await settled(screen.getByTestId)
    fireEvent.press(screen.getByText("Trips"))
    fireEvent(screen.getByTestId(`trip-row-${indices[0]}`), "longPress")
    indices.slice(1).forEach((i) => fireEvent.press(screen.getByTestId(`trip-row-${i}`)))
    return screen
  }

  it("the header becomes the contextual bar while trips are selected and the X leaves it", async () => {
    withDay()
    const props = createProps()
    const screen = await selectTrips(props, [1, 2])

    expect(lastOptions(props).headerTitle).toBe("2 selected")
    expect(lastOptions(props).headerStyle).toEqual({ backgroundColor: lightColors.card })
    expect(screen.getByTestId("trip-row-2").props.accessibilityState.selected).toBe(true)
    const bar = headerRight(props)
    expect(bar.getByLabelText("Export selected trips")).toBeTruthy()
    expect(bar.getByLabelText("Merge trips")).toBeTruthy()
    expect(bar.getByLabelText("Delete trips")).toBeTruthy()
    expect(bar.getByLabelText("More")).toBeTruthy()

    fireEvent.press(headerLeft(props).getByLabelText("Exit selection"))

    expect(lastOptions(props).headerTitle).toBe("Location history")
    expect(lastOptions(props).headerLeft).toBeUndefined()
    expect(lastOptions(props).headerStyle).toBeUndefined()
    expect(screen.getByTestId("trip-row-2").props.accessibilityState.selected).toBe(false)
  })

  it("tapping the last selected row off exits selection", async () => {
    withDay()
    const props = createProps()
    const screen = await selectTrips(props, [1])

    fireEvent.press(screen.getByTestId("trip-row-1"))
    expect(lastOptions(props).headerTitle).toBe("Location history")
  })

  it("hardware back leaves selection instead of the screen", async () => {
    withDay()
    const handlers: Array<() => boolean> = []
    const remove = jest.fn()
    const spy = jest.spyOn(BackHandler, "addEventListener").mockImplementation((_event, handler) => {
      handlers.push(handler as () => boolean)
      return { remove }
    })
    const props = createProps()
    await selectTrips(props, [1])
    expect(handlers).toHaveLength(1)

    let handled = false
    act(() => {
      handled = handlers[0]()
    })

    expect(handled).toBe(true)
    expect(lastOptions(props).headerTitle).toBe("Location history")
    expect(remove).toHaveBeenCalled()
    spy.mockRestore()
  })

  it("switching lens or day exits selection", async () => {
    withDay()
    const props = createProps()
    const screen = await selectTrips(props, [1])
    expect(lastOptions(props).headerTitle).toBe("1 selected")

    fireEvent.press(screen.getByText("Map"))
    expect(lastOptions(props).headerTitle).toBe("Location history")

    fireEvent.press(screen.getByText("Trips"))
    fireEvent(screen.getByTestId("trip-row-1"), "longPress")
    expect(lastOptions(props).headerTitle).toBe("1 selected")
    fireEvent.press(screen.getByTestId("day-previous"))
    expect(lastOptions(props).headerTitle).toBe("Location history")
    await settled(screen.getByTestId)
  })

  it("Merge explains itself when the selected trips do not follow each other", async () => {
    withDay()
    const props = createProps()
    await selectTrips(props, [1, 3])

    const merge = headerRight(props).getByLabelText("Merge trips")
    expect(merge.props.accessibilityHint).toBe("Select two or more trips that follow each other")
    fireEvent.press(merge)

    await waitFor(() =>
      expect(showAlert).toHaveBeenCalledWith("Merge trips", "Select two or more trips that follow each other.", "info")
    )
    expect(showConfirm).not.toHaveBeenCalled()
  })

  it("offers no Merge while one trip is selected, since there is nothing to merge it with", async () => {
    withDay()
    const props = createProps()
    await selectTrips(props, [2])

    const bar = headerRight(props)
    expect(bar.queryByLabelText("Merge trips")).toBeNull()
    expect(bar.getByLabelText("Delete trips")).toBeTruthy()
  })

  it("Merge on consecutive trips confirms, suppresses the gaps and leaves selection", async () => {
    withDay()
    const gaps = [{ before_timestamp: 1100, after_timestamp: 1200, action: 0 }]
    ;(gapsBetweenTrips as jest.Mock).mockReturnValueOnce(gaps)
    ;(showConfirm as jest.Mock).mockResolvedValueOnce(true)
    const props = createProps()
    await selectTrips(props, [1, 2])

    const merge = headerRight(props).getByLabelText("Merge trips")
    expect(merge.props.accessibilityHint).toBeUndefined()
    fireEvent.press(merge)

    await waitFor(() => expect(NativeLocationService.addBoundaryOverrides).toHaveBeenCalledWith(gaps))
    await waitFor(() => expect(lastOptions(props).headerTitle).toBe("Location history"))
  })

  it("keeps the selection when a merge fails, so the user can retry", async () => {
    withDay()
    ;(showConfirm as jest.Mock).mockResolvedValueOnce(true)
    ;(NativeLocationService.addBoundaryOverrides as jest.Mock).mockRejectedValueOnce(new Error("db"))
    const props = createProps()
    await selectTrips(props, [1, 2])

    fireEvent.press(headerRight(props).getByLabelText("Merge trips"))

    await waitFor(() => expect(showAlert).toHaveBeenCalledWith("Merge Failed", expect.any(String), "error"))
    expect(lastOptions(props).headerTitle).toBe("2 selected")
  })

  it("merges nothing when the merge confirm is dismissed", async () => {
    withDay()
    const props = createProps()
    await selectTrips(props, [1, 2])

    fireEvent.press(headerRight(props).getByLabelText("Merge trips"))

    await waitFor(() => expect(showConfirm).toHaveBeenCalled())
    expect(NativeLocationService.addBoundaryOverrides).not.toHaveBeenCalled()
    expect(lastOptions(props).headerTitle).toBe("2 selected")
  })

  it("Delete trips removes the selected ranges after a destructive confirm", async () => {
    withDay()
    ;(showConfirm as jest.Mock).mockResolvedValueOnce(true)
    const props = createProps()
    await selectTrips(props, [2, 3])

    fireEvent.press(headerRight(props).getByLabelText("Delete trips"))

    await waitFor(() =>
      expect(NativeLocationService.deleteLocationsInRanges).toHaveBeenCalledWith([
        { start: 1200, end: 1300 },
        { start: 1400, end: 1400 }
      ])
    )
    expect(showConfirm).toHaveBeenCalledWith(expect.objectContaining({ destructive: true, confirmText: "Delete" }))
    await waitFor(() => expect(lastOptions(props).headerTitle).toBe("Location history"))
  })

  it("keeps the selection when a delete fails, so the user can retry", async () => {
    withDay()
    ;(showConfirm as jest.Mock).mockResolvedValueOnce(true)
    ;(NativeLocationService.deleteLocationsInRanges as jest.Mock).mockRejectedValueOnce(new Error("db"))
    const props = createProps()
    await selectTrips(props, [2, 3])

    fireEvent.press(headerRight(props).getByLabelText("Delete trips"))

    await waitFor(() => expect(showAlert).toHaveBeenCalledWith("Delete Failed", expect.any(String), "error"))
    expect(lastOptions(props).headerTitle).toBe("2 selected")
  })

  it("ignores a second tap on Delete, or a tap on Merge, while the confirm is up", async () => {
    withDay()
    let resolveConfirm: (confirmed: boolean) => void = () => {}
    ;(showConfirm as jest.Mock).mockReturnValueOnce(new Promise<boolean>((resolve) => (resolveConfirm = resolve)))
    const props = createProps()
    await selectTrips(props, [2, 3])
    const bar = headerRight(props)

    fireEvent.press(bar.getByLabelText("Delete trips"))
    fireEvent.press(bar.getByLabelText("Delete trips"))
    fireEvent.press(bar.getByLabelText("Merge trips"))
    await waitFor(() => expect(showConfirm).toHaveBeenCalledTimes(1))
    await act(async () => resolveConfirm(false))

    expect(showConfirm).toHaveBeenCalledTimes(1)
    expect(NativeLocationService.deleteLocationsInRanges).not.toHaveBeenCalled()
    expect(lastOptions(props).headerTitle).toBe("2 selected")
  })

  it("announces the count as the selection grows and its end, because the title change is silent", async () => {
    withDay()
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {})
    const props = createProps()
    await selectTrips(props, [1, 2])
    expect(announce.mock.calls.map((c) => c[0])).toEqual(["1 selected", "2 selected"])

    fireEvent.press(headerLeft(props).getByLabelText("Exit selection"))

    expect(announce).toHaveBeenLastCalledWith("Selection cleared")
    expect(announce).toHaveBeenCalledTimes(3)
    announce.mockRestore()
  })

  it("More offers Select all and Clear selection", async () => {
    withDay()
    ;(showChoice as jest.Mock).mockResolvedValueOnce(0)
    const props = createProps()
    await selectTrips(props, [1])

    fireEvent.press(headerRight(props).getByLabelText("More"))
    await waitFor(() => expect(lastOptions(props).headerTitle).toBe("3 selected"))
    expect(showChoice).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Selection",
        message: "1 of 3 trips selected",
        buttons: [{ text: "Select all" }, { text: "Clear selection" }, { text: "Cancel", style: "secondary" }]
      })
    )
    ;(showChoice as jest.Mock).mockResolvedValueOnce(1)
    fireEvent.press(headerRight(props).getByLabelText("More"))
    await waitFor(() => expect(lastOptions(props).headerTitle).toBe("Location history"))
  })

  it("Export selected trips keeps the single-trip file name", async () => {
    withDay()
    const props = createProps()
    const view = await selectTrips(props, [2])

    fireEvent.press(headerRight(props).getByLabelText("Export selected trips"))
    await act(async () => view.getByTestId("ExportFormatDialog").props.onSelect("geojson"))

    await waitFor(() =>
      expect(NativeLocationService.exportTripsToFile).toHaveBeenCalledWith(
        [expect.objectContaining({ index: 2 })],
        "geojson",
        expect.stringMatching(/^colota_trip2_\d{4}-\d{2}-\d{2}\.geojson$/)
      )
    )
  })

  it("a row tap outside selection opens Trip Detail with the day's trips", async () => {
    withDay()
    const props = createProps()
    const { getByText, getByTestId } = render(<LocationHistoryScreen {...props} />)
    await settled(getByTestId)

    fireEvent.press(getByText("Trips"))
    fireEvent.press(getByTestId("trip-row-2"))

    expect(props.navigation.navigate).toHaveBeenCalledWith(
      "Trip Detail",
      expect.objectContaining({ trip: expect.objectContaining({ index: 2 }), trips: expect.any(Array) })
    )
  })
})

describe("empty day", () => {
  it("a past day with nothing recorded points at the last day with data", async () => {
    const shown = daysAgo(3)
    const last = daysAgo(5)
    ;(NativeLocationService.getDaysWithData as jest.Mock).mockResolvedValue([dayKey(last)])
    ;(NativeLocationService.getDailyStats as jest.Mock).mockResolvedValue([
      { day: dayKey(last), count: 40, startTime: 0, endTime: 0, distanceMeters: 12_400, tripCount: 3 }
    ])
    const props = createProps({ initialDate: shown.getTime() })
    const { getByTestId, getByText, queryByTestId } = render(<LocationHistoryScreen {...props} />)
    await settled(getByTestId)

    expect(getByTestId("dock-kind").props.children).toBe("empty")
    expect(getByText("Nothing recorded")).toBeTruthy()
    expect(getByText("Last day with data")).toBeTruthy()
    expect(getByText(/3 trips · 12.4 km$/)).toBeTruthy()
    expect(queryByTestId("spinner")).toBeNull()

    fireEvent.press(getByTestId("dock-empty-action"))
    await settled(getByTestId)
    expect(getByTestId("day-header-date").props.children).toBe(dayKey(last))
  })

  it("today with tracking on waits for the first fix and offers no action", async () => {
    mockTracking = true
    const { getByTestId, getByText, queryByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await settled(getByTestId)

    expect(getByText("No locations yet")).toBeTruthy()
    expect(getByText("Tracking is on. The first fix lands here.")).toBeTruthy()
    expect(queryByTestId("dock-empty-action")).toBeNull()
  })

  it("today with tracking off and data on other days opens the Dashboard", async () => {
    ;(NativeLocationService.getDaysWithData as jest.Mock).mockResolvedValue([dayKey(daysAgo(2))])
    const props = createProps()
    const { getByTestId, getByText } = render(<LocationHistoryScreen {...props} />)
    await settled(getByTestId)

    expect(getByText("No locations today")).toBeTruthy()
    fireEvent.press(getByTestId("dock-empty-action"))
    expect(props.navigation.navigate).toHaveBeenCalledWith("Dashboard")
  })

  it("a fresh install reads as such in every lens", async () => {
    const props = createProps()
    const { getByTestId, getByText, getAllByText, getByLabelText } = render(<LocationHistoryScreen {...props} />)
    await settled(getByTestId)

    expect(getByText("Nothing recorded yet")).toBeTruthy()
    fireEvent.press(getByText("Trips"))
    expect(getByTestId("EmptyState")).toBeTruthy()
    expect(getAllByText("Nothing recorded yet")).toHaveLength(1)
    fireEvent.press(getByLabelText("Open Dashboard"))
    expect(props.navigation.navigate).toHaveBeenCalledWith("Dashboard")

    fireEvent.press(getByText("Data"))
    expect(getByTestId("EmptyState")).toBeTruthy()
    expect(getByText("Start tracking on the Dashboard and today's track appears here.")).toBeTruthy()
  })

  it("hides the Share action on a day without trips", async () => {
    const props = createProps()
    const { getByTestId } = render(<LocationHistoryScreen {...props} />)
    await settled(getByTestId)

    expect(headerRight(props).queryByLabelText("Export day")).toBeNull()
  })
})

describe("loading", () => {
  afterEach(() => jest.useRealTimers())

  it("shows the spinner only once a fetch outlasts the delay, never the empty composition", async () => {
    jest.useFakeTimers()
    ;(NativeLocationService.getLocationsByDateRange as jest.Mock).mockReturnValue(new Promise(() => {}))
    const { getByTestId, queryByTestId, queryByText } = render(<LocationHistoryScreen {...createProps()} />)
    await act(async () => {})

    expect(getByTestId("day-header-ledger").props.children).toBe("Loading")
    expect(queryByTestId("spinner")).toBeNull()
    expect(queryByTestId("InspectorDock")).toBeNull()

    act(() => {
      jest.advanceTimersByTime(200)
    })

    expect(getByTestId("spinner")).toBeTruthy()
    expect(queryByTestId("InspectorDock")).toBeNull()
    expect(queryByText("Nothing recorded yet")).toBeNull()
  })

  it("clears the day and reports a failed fetch, so nothing acts on another day's data under the new date", async () => {
    withDay()
    const { getByTestId, queryByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await settled(getByTestId)
    ;(NativeLocationService.getLocationsByDateRange as jest.Mock).mockRejectedValueOnce(new Error("db"))

    fireEvent.press(getByTestId("day-previous"))

    await waitFor(() => expect(showAlert).toHaveBeenCalledWith("Load Failed", expect.any(String), "error"))
    expect(getByTestId("day-header-date").props.children).toBe(dayKey(daysAgo(1)))
    expect(getByTestId("dock-kind").props.children).toBe("empty")
    expect(queryByTestId("spinner")).toBeNull()
  })
})

describe("point card", () => {
  it("offers no Split from the map, because a trip is edited on Trip Detail", async () => {
    withDay(DAY_POINTS, [DAY_TRIP])
    const { getByTestId, queryByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await settled(getByTestId)

    fireEvent.press(getByTestId("map-select-point"))

    expect(queryByTestId("point-split")).toBeNull()
  })

  it("deletes the point after confirming and the dock returns to the legend", async () => {
    withDay()
    ;(showConfirm as jest.Mock).mockResolvedValueOnce(true)
    const { getByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await settled(getByTestId)

    fireEvent.press(getByTestId("map-select-point"))
    fireEvent.press(getByTestId("point-delete"))

    await waitFor(() => expect(NativeLocationService.deleteLocationsByIds).toHaveBeenCalledWith([3]))
    await waitFor(() => expect(getByTestId("dock-kind").props.children).toBe("legend"))
  })

  it("deletes nothing when the confirm is dismissed and keeps the card open", async () => {
    withDay()
    const { getByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await settled(getByTestId)

    fireEvent.press(getByTestId("map-select-point"))
    fireEvent.press(getByTestId("point-delete"))

    await waitFor(() => expect(showConfirm).toHaveBeenCalled())
    expect(NativeLocationService.deleteLocationsByIds).not.toHaveBeenCalled()
    expect(getByTestId("dock-kind").props.children).toBe("point")
  })

  it("closing the card returns the dock to the legend", async () => {
    withDay()
    const { getByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await settled(getByTestId)

    fireEvent.press(getByTestId("map-select-point"))
    fireEvent.press(getByTestId("point-close"))

    expect(getByTestId("dock-kind").props.children).toBe("legend")
    expect(getByTestId("TrackMap-selected").props.children).toBe("null")
  })
})

describe("notes saved on the map", () => {
  it("shows the saved note in the card and hands it to the map without a new locations array", async () => {
    withDay()
    const { getByTestId } = render(<LocationHistoryScreen {...createProps()} />)
    await settled(getByTestId)
    fireEvent.press(getByTestId("map-select-point"))
    const before = mockMapLocationsSeen[mockMapLocationsSeen.length - 1]

    fireEvent.press(getByTestId("point-save-note"))

    await waitFor(() => expect(NativeLocationService.updateLocationNote).toHaveBeenCalledWith(3, "lunch"))
    await waitFor(() => expect(getByTestId("TrackMap-overrides").props.children).toContain("lunch"))
    expect(getByTestId("point-note").props.children).toBe("lunch")
    expect(getByTestId("dock-kind").props.children).toBe("point")
    expect(mockMapLocationsSeen[mockMapLocationsSeen.length - 1]).toBe(before)
  })

  it("hands Trip Detail the notes saved this session", async () => {
    withDay(DAY_POINTS, [DAY_TRIP])
    const props = createProps()
    const { getByTestId, getByText } = render(<LocationHistoryScreen {...props} />)
    await settled(getByTestId)

    fireEvent.press(getByTestId("map-select-point"))
    fireEvent.press(getByTestId("point-save-note"))
    await waitFor(() => expect(getByTestId("TrackMap-overrides").props.children).toContain("lunch"))
    fireEvent.press(getByText("Trips"))
    fireEvent.press(getByTestId("trip-row-1"))

    expect(props.navigation.navigate).toHaveBeenCalledWith(
      "Trip Detail",
      expect.objectContaining({
        trip: expect.objectContaining({
          locations: expect.arrayContaining([expect.objectContaining({ id: 3, note: "lunch" })])
        }),
        trips: expect.arrayContaining([
          expect.objectContaining({
            locations: expect.arrayContaining([expect.objectContaining({ id: 3, note: "lunch" })])
          })
        ])
      })
    )
  })
})
