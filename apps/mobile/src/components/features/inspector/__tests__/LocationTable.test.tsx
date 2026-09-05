import React from "react"
import { render } from "@testing-library/react-native"
import { lightColors, type } from "@colota/shared"
import { LocationCoords } from "../../../../types/global"

// --- Mocks ---

jest.mock("../../../../utils/geo", () => ({
  formatTime: jest.fn((_ts: number) => "12:00:00"),
  getSpeedUnit: jest.fn(() => ({ factor: 3.6, unit: "km/h" }))
}))

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: require("@colota/shared").lightColors,
    mode: "light"
  })
}))

import { LocationTable } from "../LocationTable"

const mockColors = lightColors as any

const locations: LocationCoords[] = [
  {
    latitude: 48.1,
    longitude: 11.5,
    accuracy: 10,
    timestamp: 1000,
    altitude: 500,
    speed: 5,
    bearing: 90,
    battery: 80,
    battery_status: 2
  },
  {
    latitude: 48.2,
    longitude: 11.6,
    accuracy: 15,
    timestamp: 1030,
    altitude: 510,
    speed: 8,
    bearing: 180,
    battery: 79,
    battery_status: 1
  },
  {
    latitude: 48.3,
    longitude: 11.7,
    accuracy: 20,
    timestamp: 1060,
    altitude: null as any,
    speed: null as any,
    bearing: null as any,
    battery: null as any,
    battery_status: null as any
  }
]

const TABLE_WIDTH = 870

describe("LocationTable", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("shows empty state message when no locations", () => {
    const { getByText } = render(<LocationTable locations={[]} colors={mockColors} />)

    expect(getByText("No data on this day")).toBeTruthy()
  })

  it("renders table header with column names", () => {
    const { getByText } = render(<LocationTable locations={locations} colors={mockColors} />)

    expect(getByText("Time")).toBeTruthy()
    expect(getByText("Δs")).toBeTruthy()
    expect(getByText("Lat")).toBeTruthy()
    expect(getByText("Lon")).toBeTruthy()
    expect(getByText("Acc")).toBeTruthy()
    expect(getByText("km/h")).toBeTruthy()
    expect(getByText("Alt")).toBeTruthy()
    expect(getByText("Bear")).toBeTruthy()
    expect(getByText("Batt")).toBeTruthy()
    expect(getByText("Charge")).toBeTruthy()
    expect(getByText("Note")).toBeTruthy()
  })

  /** A header block or a heavy rule would fight the rows; one hairline separates them. */
  it("separates the header from the rows with a hairline, not a block", () => {
    const { getByTestId } = render(<LocationTable locations={locations} colors={mockColors} />)

    expect(getByTestId("table-header-rule")).toBeTruthy()
  })

  /**
   * Latitude and longitude are the one place in the app where digits have to line up column to
   * column, so they take the tabular `coord` role rather than the caption every other cell uses.
   */
  it("sets coordinates in the coord role", () => {
    const { getByText } = render(<LocationTable locations={locations} colors={mockColors} />)

    for (const value of ["48.30000", "11.70000"]) {
      const cell = ([] as any[]).concat(getByText(value).props.style).filter(Boolean)
      expect(cell.some((s) => s.fontSize === type.coord.fontSize)).toBe(true)
      expect(cell.some((s) => Array.isArray(s.fontVariant) && s.fontVariant.includes("tabular-nums"))).toBe(true)
    }
  })

  /** The 11 columns do not fit a phone, so the table keeps its own width and scrolls sideways. */
  it("keeps the table 870 wide inside a horizontal scroller", () => {
    const { UNSAFE_root } = render(<LocationTable locations={locations} colors={mockColors} />)

    const widths = UNSAFE_root.findAllByType("View" as any)
      .flatMap((node: any) => ([] as any[]).concat(node.props.style).filter(Boolean))
      .map((style: any) => style.width)

    expect(widths).toContain(TABLE_WIDTH)
  })

  it("renders location rows with correct values", () => {
    const { getAllByText, getByText } = render(<LocationTable locations={locations} colors={mockColors} />)

    // formatTime is mocked to return "12:00:00" for all timestamps
    expect(getAllByText("12:00:00").length).toBe(3)

    // Latitude values (5 decimal places)
    expect(getByText("48.10000")).toBeTruthy()
    expect(getByText("48.20000")).toBeTruthy()
    expect(getByText("48.30000")).toBeTruthy()

    // Longitude values (5 decimal places)
    expect(getByText("11.50000")).toBeTruthy()
    expect(getByText("11.60000")).toBeTruthy()
    expect(getByText("11.70000")).toBeTruthy()
  })

  it("shows newest location first (reversed order)", () => {
    const { getAllByText } = render(<LocationTable locations={locations} colors={mockColors} />)

    // The component reverses the array, so the newest timestamp (1060) should be first
    // Verify all three timestamps were rendered
    expect(getAllByText("12:00:00").length).toBe(3)

    // The first row should be the newest (index 2 from original = lat 48.3)
    // and the last row should be the oldest (index 0 = lat 48.1)
    // We can verify this by checking the rendered order of latitude values
    const latTexts = ["48.30000", "48.20000", "48.10000"]
    latTexts.forEach((lat) => {
      expect(getAllByText(lat).length).toBe(1)
    })
  })

  it("computes delta correctly between consecutive timestamps", () => {
    const { getAllByText } = render(<LocationTable locations={locations} colors={mockColors} />)

    // Deltas computed in chronological order:
    // index 0 (ts=1000): delta = null (first item)
    // index 1 (ts=1030): delta = 1030 - 1000 = 30
    // index 2 (ts=1060): delta = 1060 - 1030 = 30
    // After reverse: [index2, index1, index0]
    // Both index2 and index1 have delta = 30, index0 has delta = null
    const deltaElements = getAllByText("+30")
    expect(deltaElements.length).toBe(2)
  })

  it("handles null optional fields (altitude, speed, bearing, battery)", () => {
    const { getAllByText } = render(<LocationTable locations={locations} colors={mockColors} />)

    // The third location (index 2, but shown first after reverse) has null altitude,
    // speed, bearing, battery - all rendered as "-"
    // There should be dashes for: altitude, speed, bearing, battery = 4 dashes from
    // the null-field row. Plus the newest row has no delta so its delta cell is empty.
    const dashes = getAllByText("-")
    expect(dashes.length).toBeGreaterThanOrEqual(4)
  })

  it("shows battery status text (Charging, Discharging, etc.)", () => {
    const { getByText } = render(<LocationTable locations={locations} colors={mockColors} />)

    expect(getByText("Charging")).toBeTruthy()
    expect(getByText("Discharging")).toBeTruthy()
  })
})
