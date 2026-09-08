import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { ScrollView, StyleSheet } from "react-native"
import { space } from "../../../../constants"
import type { Trip } from "../../../../types/global"

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

jest.mock("../../../../utils/geo", () => ({
  formatDistance: (m: number) => `${(m / 1000).toFixed(1)} km`,
  spokenDistance: (m: number) => `${(m / 1000).toFixed(1)} kilometres`,
  formatDuration: (s: number) => `${Math.round(s / 60)}min`,
  formatSpeed: (mps: number) => `${(mps * 3.6).toFixed(1)} km/h`,
  formatTime: (_ts: number) => "12:00"
}))

jest.mock("../../../../utils/trips", () => ({
  getTripColor: (i: number) => `#color${i}`,
  computeTripStats: () => ({ avgSpeed: 0, elevationGain: 0, elevationLoss: 0 })
}))

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const { Text } = require("react-native")
  return { Check: (_props: any) => R.createElement(Text, null, "Check") }
})

import { TripList } from "../TripList"
import { Card } from "../../../ui/Card"
import { Divider } from "../../../ui/Divider"

function makeTrip(index: number): Trip {
  return {
    index,
    locations: [],
    startTime: index * 100,
    endTime: index * 100 + 60,
    distance: 1000,
    locationCount: 5,
    startIndex: (index - 1) * 5
  }
}

function makeTrips(n: number): Trip[] {
  return Array.from({ length: n }, (_, i) => makeTrip(i + 1))
}

function renderList(props: Partial<React.ComponentProps<typeof TripList>> = {}) {
  const handlers = { onToggle: jest.fn(), onEnterSelection: jest.fn(), onOpenTrip: jest.fn() }
  const utils = render(<TripList trips={makeTrips(3)} selected={new Set<number>()} {...handlers} {...props} />)
  return { ...utils, ...handlers }
}

describe("TripList", () => {
  it("lists the day's trips in order inside one card, seamed by inset hairlines", () => {
    const { getAllByRole, UNSAFE_getAllByType, UNSAFE_getByType } = renderList()

    const rows = getAllByRole("button")
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual([
      expect.stringMatching(/^Trip 1,/),
      expect.stringMatching(/^Trip 2,/),
      expect.stringMatching(/^Trip 3,/)
    ])
    expect(UNSAFE_getByType(Card).props.rows).toBe(true)
    const dividers = UNSAFE_getAllByType(Divider)
    expect(dividers).toHaveLength(2)
    expect(dividers.every((d) => d.props.tight && d.props.inset)).toBe(true)
  })

  it("scrolls with the screen skeleton's insets, so the card lands where every other screen's does", () => {
    const { UNSAFE_getByType } = renderList()
    const content = StyleSheet.flatten(UNSAFE_getByType(ScrollView).props.contentContainerStyle)

    expect(content).toEqual({ paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xxl })
  })

  it("starts selecting on a long press, so a row is picked without opening it", () => {
    const { getByTestId, onEnterSelection, onToggle, onOpenTrip } = renderList()

    fireEvent(getByTestId("trip-row-2"), "longPress")

    expect(onEnterSelection).toHaveBeenCalledWith(2)
    expect(onToggle).not.toHaveBeenCalled()
    expect(onOpenTrip).not.toHaveBeenCalled()
  })

  it("toggles a row on tap while selecting and marks the picked ones, so the tap never navigates away", () => {
    const { getByTestId, onToggle, onOpenTrip, onEnterSelection } = renderList({ selected: new Set([1]) })

    fireEvent.press(getByTestId("trip-row-2"))
    fireEvent(getByTestId("trip-row-3"), "longPress")

    expect(onToggle.mock.calls).toEqual([[2], [3]])
    expect(onOpenTrip).not.toHaveBeenCalled()
    expect(onEnterSelection).not.toHaveBeenCalled()
    expect(getByTestId("trip-row-1").props.accessibilityState.selected).toBe(true)
    expect(getByTestId("trip-row-2").props.accessibilityState.selected).toBe(false)
    expect(getByTestId("trip-row-2").props.accessibilityHint).toBeUndefined()
  })

  it("opens a trip on tap when nothing is selected", () => {
    const { getByTestId, onOpenTrip, onToggle } = renderList()

    fireEvent.press(getByTestId("trip-row-2"))

    expect(onOpenTrip).toHaveBeenCalledWith(2)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it("renders nothing on an empty day, leaving the empty composition to the screen", () => {
    const { toJSON } = renderList({ trips: [] })

    expect(toJSON()).toBeNull()
  })
})
