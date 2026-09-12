import React from "react"
import { configure, render, fireEvent, within } from "@testing-library/react-native"
import { FlatList, StyleSheet } from "react-native"
import { lightColors } from "@colota/shared"
import { LocationCoords } from "../../../../types/global"

const mockGetSpeedUnit = jest.fn(() => ({ factor: 3.6, unit: "km/h" }))
let mockTimeFormat: "24h" | "12h" = "24h"
jest.mock("../../../../utils/geo", () => ({
  formatTime: (ts: number) => new Date(ts * 1000).toISOString().slice(11, 19),
  getSpeedUnit: () => mockGetSpeedUnit(),
  getTimeFormat: () => mockTimeFormat
}))

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { LocationTable } from "../LocationTable"

// The time pane is hidden from a screen reader on purpose, so the queries have to look past that.
configure({ defaultIncludeHiddenElements: true })

// The real palette: a hand-written subset reads a missing key as undefined and the style silently disappears.
const colors = lightColors

const locations: LocationCoords[] = [
  {
    id: 1,
    latitude: 48.1,
    longitude: 11.5,
    accuracy: 10,
    timestamp: 1000,
    altitude: 500,
    speed: 5,
    bearing: 90,
    battery: 80,
    battery_status: 2,
    sent: 1
  },
  {
    id: 2,
    latitude: 48.2,
    longitude: 11.6,
    accuracy: 15,
    timestamp: 1030,
    altitude: 510,
    speed: 8,
    bearing: 180,
    battery: 79,
    battery_status: 1,
    sent: 0,
    note: "Coffee"
  },
  {
    id: 3,
    latitude: 48.3,
    longitude: 11.7,
    accuracy: 20,
    timestamp: 1060,
    battery: 100,
    battery_status: 3,
    sent: 1
  }
]

const rowLabel = /show on map$/

const scrollEvent = (y: number) => ({
  nativeEvent: {
    contentOffset: { x: 0, y },
    contentSize: { width: 800, height: 1000 },
    layoutMeasurement: { width: 360, height: 500 }
  }
})

function renderTable(props: Partial<React.ComponentProps<typeof LocationTable>> = {}) {
  return render(
    <LocationTable locations={locations} colors={colors} hasEndpoint={false} onSelectPoint={jest.fn()} {...props} />
  )
}

describe("LocationTable", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSpeedUnit.mockReturnValue({ factor: 3.6, unit: "km/h" })
    mockTimeFormat = "24h"
  })

  it("widens the time column on a 12-hour clock so the seconds and the period both fit", () => {
    mockTimeFormat = "12h"
    const { getByTestId } = renderTable()

    expect(StyleSheet.flatten(getByTestId("table-time-pane").props.style).width).toBe(112)
  })

  it("keeps the time column outside the horizontal pane so it stays in view while the data scrolls", () => {
    const { getByTestId } = renderTable()

    const timePane = within(getByTestId("table-time-pane"))
    const dataPane = within(getByTestId("table-data-pane"))
    expect(timePane.getByText("Time")).toBeTruthy()
    expect(timePane.getAllByText(/^\d\d:\d\d:\d\d$/)).toHaveLength(3)
    expect(dataPane.queryByText("Time")).toBeNull()
    for (const heading of ["Δs", "Lat", "Lon", "Acc m", "Alt m", "Bear", "Batt %", "Note"]) {
      expect(dataPane.getByText(heading)).toBeTruthy()
    }
  })

  it("lists the newest point first so the top row answers whether it is still recording", () => {
    const { getByTestId } = renderTable()

    const times = within(getByTestId("table-time-pane"))
      .getAllByLabelText(rowLabel)
      .map((row) => row.props.accessibilityLabel)
    expect(times).toEqual(["00:17:40, show on map", "00:17:10, show on map", "00:16:40, show on map"])

    const dataRows = within(getByTestId("table-data-pane")).getAllByLabelText(rowLabel)
    expect(dataRows).toHaveLength(3)
    expect(within(dataRows[0]).getByText("48.30000")).toBeTruthy()
    expect(within(dataRows[0]).getByText("+30")).toBeTruthy()
    expect(within(dataRows[2]).getByText("48.10000")).toBeTruthy()
    expect(within(dataRows[2]).queryByText(/^\+/)).toBeNull()
  })

  it("names the speed unit in the header so the cells stay bare numbers", () => {
    const { getByText, rerender } = renderTable()
    expect(getByText("Speed km/h")).toBeTruthy()
    expect(getByText("18.0")).toBeTruthy()

    mockGetSpeedUnit.mockReturnValue({ factor: 2, unit: "mph" })
    rerender(<LocationTable locations={[]} colors={colors} hasEndpoint={false} onSelectPoint={jest.fn()} />)
    const fresh = renderTable()
    expect(fresh.getByText("Speed mph")).toBeTruthy()
    expect(fresh.getByText("10.0")).toBeTruthy()
  })

  it("shows the Sync column only when a server is configured, because without one nothing is queued", () => {
    const without = renderTable({ hasEndpoint: false })
    expect(without.queryByText("Sync")).toBeNull()
    expect(without.queryByText("Sent")).toBeNull()
    expect(without.queryByText("Queued")).toBeNull()

    const withServer = renderTable({ hasEndpoint: true })
    expect(withServer.getByText("Sync")).toBeTruthy()
    expect(withServer.getAllByText("Sent")).toHaveLength(2)
    expect(withServer.getAllByText("Queued")).toHaveLength(1)
  })

  it("draws a battery glyph only while charging or full and speaks the word for a screen reader", () => {
    const { getAllByTestId, getByTestId, getByLabelText, queryByLabelText } = renderTable()

    expect(getAllByTestId("icon-BatteryCharging")).toHaveLength(1)
    expect(getAllByTestId("icon-BatteryFull")).toHaveLength(1)
    expect(getByLabelText("80% charging")).toBeTruthy()
    expect(getByLabelText("100% full")).toBeTruthy()
    expect(getByLabelText("79%")).toBeTruthy()
    expect(queryByLabelText(/discharging/i)).toBeNull()

    const dataRows = within(getByTestId("table-data-pane")).getAllByLabelText(rowLabel)
    expect(dataRows[2].props.accessibilityLabel).toContain("battery 80% charging")
    expect(dataRows[1].props.accessibilityLabel).not.toContain("charging")
  })

  it("hands the point id to the screen from either pane so the map can open it", () => {
    const onSelectPoint = jest.fn()
    const { getByTestId } = renderTable({ onSelectPoint })

    fireEvent.press(within(getByTestId("table-time-pane")).getAllByLabelText(rowLabel)[1])
    expect(onSelectPoint).toHaveBeenCalledWith(2)

    fireEvent.press(within(getByTestId("table-data-pane")).getAllByLabelText(rowLabel)[0])
    expect(onSelectPoint).toHaveBeenCalledWith(3)
    expect(onSelectPoint).toHaveBeenCalledTimes(2)
  })

  it("fills the selected point's row in both panes and never a border", () => {
    const { getAllByLabelText } = renderTable({ selectedPointId: 2 })

    const rows = getAllByLabelText(rowLabel)
    const filled = rows.filter((r) => StyleSheet.flatten(r.props.style)?.backgroundColor === colors.primaryContainer)
    expect(filled).toHaveLength(2)
    filled.forEach((r) => {
      expect(r.props.accessibilityLabel).toMatch(/^00:17:10/)
      expect(r.props.accessibilityState).toEqual({ selected: true })
      expect(StyleSheet.flatten(r.props.style).borderWidth).toBeUndefined()
    })
    expect(rows.filter((r) => r.props.accessibilityState.selected)).toHaveLength(2)
  })

  it("weights the selected time and recolours the row's text, so the tint is never the only cue", () => {
    const { getByText, getAllByText } = renderTable({ selectedPointId: 2 })

    const selectedTime = StyleSheet.flatten(getByText("00:17:10").props.style)
    expect(selectedTime.fontWeight).toBe("bold")
    expect(selectedTime.fontFamily).toBe("monospace")
    expect(selectedTime.color).toBe(colors.onPrimaryContainer)
    expect(StyleSheet.flatten(getByText("48.20000").props.style).color).toBe(colors.onPrimaryContainer)

    const otherTime = StyleSheet.flatten(getByText("00:17:40").props.style)
    expect(otherTime.fontWeight).toBeUndefined()
    expect(otherTime.color).toBe(colors.text)
    expect(getAllByText(/^\d\d:\d\d:\d\d$/)).toHaveLength(3)
  })

  it("hides the time pane from a screen reader, since the data row already speaks the time and the action", () => {
    const { getByTestId, getAllByLabelText } = renderTable()

    expect(getByTestId("table-time-pane").props.importantForAccessibility).toBe("no-hide-descendants")
    expect(getByTestId("table-data-pane").props.importantForAccessibility).toBeUndefined()
    const spoken = getAllByLabelText(rowLabel, { includeHiddenElements: false })
    expect(spoken).toHaveLength(3)
    expect(spoken[0].props.accessibilityLabel).toMatch(/^00:17:40, .*show on map$/)
  })

  it("moves the time pane with the data pane and lets it take no drags of its own, so a fling keeps its momentum", () => {
    const scrollToOffset = jest.spyOn(FlatList.prototype, "scrollToOffset").mockImplementation(() => {})
    const { getByTestId } = renderTable()

    expect(getByTestId("table-time-list").props.scrollEnabled).toBe(false)

    fireEvent.scroll(getByTestId("table-data-list"), scrollEvent(96))
    fireEvent.scroll(getByTestId("table-data-list"), scrollEvent(144))
    expect(scrollToOffset.mock.calls.map((c) => c[0])).toEqual([
      { offset: 96, animated: false },
      { offset: 144, animated: false }
    ])

    scrollToOffset.mockRestore()
  })
})
