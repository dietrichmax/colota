import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { ScrollView, StyleSheet } from "react-native"
import { CirclePause } from "lucide-react-native"
import { lightColors } from "@colota/shared"
import { space } from "../../../../constants"
import type { Trip } from "../../../../types/global"
import { Card } from "../../../ui/Card"
import { Divider } from "../../../ui/Divider"
import { InspectorDock, type DockContent } from "../InspectorDock"
import { TripRow } from "../TripRow"

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

jest.mock("../../../../utils/geo", () => ({
  formatDistance: (m: number) => `${(m / 1000).toFixed(1)} km`,
  spokenDistance: (m: number) => `${(m / 1000).toFixed(1)} kilometres`,
  formatDuration: (s: number) => `${Math.round(s / 60)}min`,
  formatSpeed: (mps: number) => `${(mps * 3.6).toFixed(1)} km/h`,
  formatTime: (ts: number, seconds?: boolean) => {
    const h = Math.floor(ts / 3600)
    const m = Math.floor((ts % 3600) / 60)
    const pad = (n: number) => String(n).padStart(2, "0")
    return seconds ? `${pad(h)}:${pad(m)}:${pad(ts % 60)}` : `${pad(h)}:${pad(m)}`
  }
}))

function makeTrip(index: number, startHour: number): Trip {
  const start = startHour * 3600
  const end = start + 6 * 60
  return {
    index,
    locations: [
      { latitude: 0, longitude: 0, timestamp: start, speed: 5 },
      { latitude: 0.01, longitude: 0, timestamp: end, speed: 5 }
    ],
    startTime: start,
    endTime: end,
    distance: 1100,
    locationCount: 2,
    startIndex: 0
  }
}

const trips = [makeTrip(1, 8), makeTrip(2, 12), makeTrip(3, 17)]

function renderDock(content: DockContent, props: Partial<React.ComponentProps<typeof InspectorDock>> = {}) {
  return render(<InspectorDock content={content} left={16} right={16} maxHeight={400} {...props} />)
}

describe("InspectorDock", () => {
  it("summarises the day over one chip per trip, so ten trips take no more of the map than one", () => {
    const many = Array.from({ length: 10 }, (_, i) => makeTrip(i + 1, 7 + i))
    const { getByTestId, UNSAFE_queryAllByType } = renderDock({
      kind: "legend",
      trips: many,
      focusedTripIndex: null,
      onFocusTrip: jest.fn()
    })

    expect(getByTestId("dock-legend").props.accessibilityLabel).toBe("10 trips, 07:00 - 16:06 · 11.0 km")
    expect(UNSAFE_queryAllByType(TripRow)).toHaveLength(0)
    expect(getByTestId("dock-trip-strip").props.horizontal).toBe(true)
    for (let i = 1; i <= 10; i++) expect(getByTestId(`dock-trip-${i}`)).toBeTruthy()
  })

  it("focuses a trip from its chip and shows that trip's row in place of the summary until it is tapped off", () => {
    const onFocusTrip = jest.fn()
    const { getByTestId, queryByTestId, rerender } = renderDock({
      kind: "legend",
      trips,
      focusedTripIndex: null,
      onFocusTrip
    })

    fireEvent.press(getByTestId("dock-trip-2"))
    expect(onFocusTrip).toHaveBeenLastCalledWith(2)
    expect(getByTestId("dock-trip-2").props.accessibilityState.selected).toBe(false)

    rerender(
      <InspectorDock
        content={{ kind: "legend", trips, focusedTripIndex: 2, onFocusTrip }}
        left={16}
        right={16}
        maxHeight={400}
      />
    )
    expect(getByTestId("dock-trip-2").props.accessibilityState.selected).toBe(true)
    expect(getByTestId("dock-trip-1").props.accessibilityState.selected).toBe(false)
    expect(queryByTestId("dock-legend")).toBeNull()
    expect(getByTestId("dock-focused-trip").props.accessibilityState.selected).toBe(true)
    expect(getByTestId("dock-focused-trip").props.accessibilityHint).toBeUndefined()

    fireEvent.press(getByTestId("dock-trip-2"))
    expect(onFocusTrip).toHaveBeenLastCalledWith(null)
    fireEvent.press(getByTestId("dock-focused-trip"))
    expect(onFocusTrip).toHaveBeenLastCalledWith(null)
  })

  it("names a day of points that formed no trip, with their count and span", () => {
    const { getByLabelText, getByTestId } = renderDock({
      kind: "points",
      count: 42,
      startTime: 8 * 3600 + 12 * 60,
      endTime: 18 * 3600 + 40 * 60
    })

    expect(getByLabelText("No trips, 42 points · 08:12 - 18:40")).toBeTruthy()
    expect(getByTestId("icon-MapPin").props.color).toBe(lightColors.textSecondary)
  })

  it("holds the point card once a point is chosen, in place of the legend", () => {
    const onClose = jest.fn()
    const { getByTestId, queryByText, getByLabelText } = renderDock({
      kind: "point",
      point: { latitude: 0, longitude: 0, timestamp: 8 * 3600, accuracy: 8 },
      note: undefined,
      hasEndpoint: false,
      onSplit: jest.fn(),
      onDelete: jest.fn(),
      onClose,
      onSaveNote: jest.fn()
    })

    expect(getByTestId("point-card")).toBeTruthy()
    expect(queryByText("Trip 1")).toBeNull()
    fireEvent.press(getByLabelText("Close"))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("states an empty day over the tiles and offers its next step as a row", () => {
    const onPress = jest.fn()
    const { getByLabelText, getByTestId, UNSAFE_getAllByType } = renderDock({
      kind: "empty",
      title: "No locations today",
      hint: "Tracking is off.",
      action: { icon: CirclePause, label: "Open Dashboard", sub: "Tracking is off", onPress }
    })

    expect(getByLabelText("No locations today, Tracking is off.")).toBeTruthy()
    expect(getByTestId("icon-MapPinOff").props.color).toBe(lightColors.textSecondary)
    expect(UNSAFE_getAllByType(Divider)).toHaveLength(1)
    expect(getByTestId("icon-CirclePause")).toBeTruthy()
    fireEvent.press(getByLabelText("Open Dashboard, Tracking is off"))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("shows the empty line alone when the day has no next step", () => {
    const { getByLabelText, queryByTestId, UNSAFE_queryAllByType } = renderDock({
      kind: "empty",
      title: "No locations yet",
      hint: "Tracking is on. The first fix lands here."
    })

    expect(getByLabelText("No locations yet, Tracking is on. The first fix lands here.")).toBeTruthy()
    expect(queryByTestId("dock-empty-action")).toBeNull()
    expect(UNSAFE_queryAllByType(Divider)).toHaveLength(0)
  })

  it("docks over the map's bottom edge on the elevated row surface and reports its height", () => {
    const onLayout = jest.fn()
    const { getByTestId, UNSAFE_getByType } = renderDock(
      { kind: "points", count: 1, startTime: 0, endTime: 60 },
      { left: 20, right: 24, maxHeight: 320, onLayout }
    )

    const dock = StyleSheet.flatten(getByTestId("inspector-dock").props.style)
    expect(dock.position).toBe("absolute")
    expect(dock.bottom).toBe(space.lg)
    expect(dock.left).toBe(20)
    expect(dock.right).toBe(24)
    fireEvent(getByTestId("inspector-dock"), "layout", { nativeEvent: { layout: { height: 120 } } })
    expect(onLayout).toHaveBeenCalledTimes(1)

    expect(UNSAFE_getByType(Card).props.variant).toBe("elevated")
    expect(UNSAFE_getByType(Card).props.rows).toBe(true)
    const scroll = UNSAFE_getByType(ScrollView)
    expect(StyleSheet.flatten(scroll.props.style).maxHeight).toBe(320)
    expect(StyleSheet.flatten(scroll.props.style).marginHorizontal).toBe(-space.lg)
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).paddingHorizontal).toBe(space.lg)
  })
})
