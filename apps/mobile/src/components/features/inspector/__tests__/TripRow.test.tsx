import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { StyleSheet } from "react-native"
import { lightColors } from "@colota/shared"
import { size, space } from "../../../../constants"
import type { Trip } from "../../../../types/global"

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

jest.mock("../../../../utils/geo", () => ({
  formatDistance: (m: number) => `${(m / 1000).toFixed(1)} km`,
  spokenDistance: (m: number) => `${(m / 1000).toFixed(1)} kilometres`,
  formatDuration: (s: number) => `${Math.round(s / 60)}min`,
  formatSpeed: (mps: number) => `${(mps * 3.6).toFixed(1)} km/h`,
  formatTime: (ts: number) => {
    const h = Math.floor(ts / 3600)
    const m = Math.floor((ts % 3600) / 60)
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  }
}))

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const { Text } = require("react-native")
  return { Check: (_props: any) => R.createElement(Text, null, "Check") }
})

import { TripRow } from "../TripRow"

const START = 8 * 3600 + 12 * 60
const END = START + 6 * 60

function makeTrip(): Trip {
  const speed = 17 / 3.6
  return {
    index: 2,
    locations: [
      { latitude: 0, longitude: 0, timestamp: START, speed },
      { latitude: 0.01, longitude: 0, timestamp: END, speed }
    ],
    startTime: START,
    endTime: END,
    distance: 1100,
    locationCount: 2,
    startIndex: 5
  }
}

function renderRow(props: Partial<React.ComponentProps<typeof TripRow>> = {}) {
  return render(
    <TripRow
      trip={makeTrip()}
      index={2}
      selected={false}
      selecting={false}
      onPress={jest.fn()}
      onLongPress={jest.fn()}
      testID="trip-row"
      {...props}
    />
  )
}

describe("TripRow", () => {
  it("names the trip and sums it up in one line, so a row reads as a legend entry and a list item", () => {
    const { getByText } = renderRow()

    expect(getByText("Trip 2")).toBeTruthy()
    expect(getByText("1.1 km · 6min · 17.0 km/h")).toBeTruthy()
  })

  it("speaks the whole row with units a screen reader can say, and offers the details it opens", () => {
    const { getByTestId } = renderRow()
    const row = getByTestId("trip-row")

    expect(row.props.accessibilityRole).toBe("button")
    expect(row.props.accessibilityLabel).toBe("Trip 2, 08:12 to 08:18, 1.1 kilometres, 6 minutes")
    expect(row.props.accessibilityHint).toBe("Opens trip details")
  })

  it("puts the time range in the trailing slot with tabular figures, so rows line up down the card", () => {
    const { getByText } = renderRow()
    const time = getByText("08:12 - 08:18")

    expect(StyleSheet.flatten(time.props.style).fontVariant).toEqual(["tabular-nums"])
    expect(StyleSheet.flatten(time.props.style).color).toBe(lightColors.textSecondary)
  })

  it("leads with the trip's map colour, so the row doubles as the legend", () => {
    const { getByTestId, queryByText, UNSAFE_getAllByType } = renderRow()
    const { View } = require("react-native")

    expect(queryByText("Check")).toBeNull()
    const swatch = UNSAFE_getAllByType(View).find((v: any) => StyleSheet.flatten(v.props.style)?.width === 8)
    expect(StyleSheet.flatten(swatch?.props.style).backgroundColor).toBe(
      require("../../../../utils/trips").getTripColor(2)
    )
    expect(getByTestId("trip-row").props.accessibilityState.selected).toBe(false)
  })

  it("marks a selected trip with a fill and a check, never a border that comes and goes", () => {
    const { getByTestId, getByText } = renderRow({ selected: true })
    const row = getByTestId("trip-row")

    expect(StyleSheet.flatten(row.props.style).backgroundColor).toBe(lightColors.primaryContainer)
    expect(getByText("Check")).toBeTruthy()
    expect(StyleSheet.flatten(getByText("Trip 2").props.style).color).toBe(lightColors.onPrimaryContainer)
    expect(StyleSheet.flatten(getByText("08:12 - 08:18").props.style).color).toBe(lightColors.onPrimaryContainer)
    expect(row.props.accessibilityState.selected).toBe(true)
  })

  it("fires a tap and a long press separately, so the list can open a trip or start selecting", () => {
    const onPress = jest.fn()
    const onLongPress = jest.fn()
    const { getByTestId } = renderRow({ onPress, onLongPress })

    fireEvent.press(getByTestId("trip-row"))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(onLongPress).not.toHaveBeenCalled()

    fireEvent(getByTestId("trip-row"), "longPress")
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it("drops the details hint while selecting, because a tap then toggles the row instead", () => {
    const { getByTestId } = renderRow({ selecting: true })

    expect(getByTestId("trip-row").props.accessibilityHint).toBeUndefined()
  })

  it("wraps the time under the title at a large font scale rather than clipping either", () => {
    const { getByText, UNSAFE_getAllByType } = renderRow()
    const { View } = require("react-native")

    expect(getByText("Trip 2").props.numberOfLines).toBeUndefined()
    expect(getByText("1.1 km · 6min · 17.0 km/h").props.numberOfLines).toBeUndefined()
    const titleRow = UNSAFE_getAllByType(View).find((v: any) => StyleSheet.flatten(v.props.style)?.flexWrap === "wrap")
    expect(titleRow).toBeTruthy()
    expect(StyleSheet.flatten(getByText("Trip 2").props.style).flexShrink).toBeUndefined()
  })

  it("cancels the card's inset and reapplies it, so the ripple spans the card and text starts at 36", () => {
    const { getByTestId } = renderRow()
    const style = StyleSheet.flatten(getByTestId("trip-row").props.style)

    expect(style.marginHorizontal).toBe(-space.lg)
    expect(style.paddingHorizontal).toBe(space.lg)
    expect(style.gap).toBe(space.lg)
    expect(style.minHeight).toBe(size.row)
  })
})
