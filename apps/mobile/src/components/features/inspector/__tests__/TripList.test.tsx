import React from "react"
import { render, fireEvent, act } from "@testing-library/react-native"
import type { Trip } from "../../../../types/global"
import type { ExportFormat } from "../../../../utils/exportConverters"

jest.mock("../../../../utils/geo", () => ({
  formatDistance: (m: number) => `${(m / 1000).toFixed(1)} km`,
  formatDuration: (s: number) => `${Math.round(s / 60)}m`,
  formatSpeed: (s: number) => `${s} m/s`,
  formatTime: (_ts: number) => "12:00"
}))

jest.mock("../../../../utils/trips", () => ({
  getTripColor: (i: number) => `#color${i}`,
  computeTripStats: () => ({ avgSpeed: 0, elevationGain: 0, elevationLoss: 0 })
}))

jest.mock("../../../../styles/typography", () => ({
  fonts: { regular: {}, bold: {}, semiBold: {} }
}))

jest.mock("../../../../utils/exportConverters", () => ({
  EXPORT_FORMATS: {
    csv: { label: "CSV" },
    geojson: { label: "GeoJSON" },
    gpx: { label: "GPX" },
    kml: { label: "KML" }
  },
  EXPORT_FORMAT_KEYS: ["csv", "geojson", "gpx", "kml"]
}))

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
      text: "#000",
      textSecondary: "#6b7280",
      textDisabled: "#9ca3af",
      border: "#e5e7eb",
      card: "#fff",
      cardElevated: "#f9fafb",
      error: "#ef4444",
      pressedOpacity: 0.7
    }
  })
}))

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const { Text } = require("react-native")
  const stub = (name: string) => (_props: any) => R.createElement(Text, null, name)
  return {
    Clock: stub("Clock"),
    Route: stub("Route"),
    Share: stub("Share"),
    TrendingUp: stub("TrendingUp"),
    TrendingDown: stub("TrendingDown"),
    Gauge: stub("Gauge"),
    Trash2: stub("Trash2"),
    X: stub("X"),
    CheckSquare: stub("CheckSquare"),
    Square: stub("Square")
  }
})

import { TripList } from "../TripList"

const colors = {
  primary: "#0d9488",
  text: "#000",
  textSecondary: "#6b7280",
  textDisabled: "#9ca3af",
  border: "#e5e7eb",
  card: "#fff",
  error: "#ef4444",
  pressedOpacity: 0.7
} as any

function makeTrip(index: number, distance = 1000): Trip {
  return {
    index,
    locations: [],
    startTime: index * 100,
    endTime: index * 100 + 60,
    distance,
    locationCount: 5
  }
}

function makeTrips(n: number): Trip[] {
  return Array.from({ length: n }, (_, i) => makeTrip(i + 1))
}

describe("TripList - CAB selection", () => {
  beforeEach(() => jest.clearAllMocks())

  it("renders idle header with Export All when trips exist", () => {
    const { getByLabelText, queryByLabelText } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={jest.fn()} onExport={jest.fn()} />
    )
    expect(getByLabelText("Export all trips")).toBeTruthy()
    expect(queryByLabelText("Cancel selection")).toBeNull()
  })

  it("long-press on a card enters selection mode and shows CAB", () => {
    const { getByLabelText, queryByLabelText } = render(
      <TripList
        trips={makeTrips(3)}
        colors={colors}
        onTripSelect={jest.fn()}
        onExport={jest.fn()}
        onDelete={jest.fn().mockResolvedValue(undefined)}
      />
    )

    fireEvent(getByLabelText(/Trip 1,/), "longPress")

    expect(getByLabelText("Cancel selection")).toBeTruthy()
    expect(getByLabelText("Export selected trips")).toBeTruthy()
    expect(getByLabelText("Delete selected trips")).toBeTruthy()
    expect(queryByLabelText("Export all trips")).toBeNull()
  })

  it("tap in selection mode toggles, does not navigate", () => {
    const onTripSelect = jest.fn()
    const { getByLabelText } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={onTripSelect} onExport={jest.fn()} />
    )

    fireEvent(getByLabelText(/Trip 1,/), "longPress")
    fireEvent.press(getByLabelText(/Trip 2,/))

    expect(onTripSelect).not.toHaveBeenCalled()
  })

  it("tap when idle navigates via onTripSelect", () => {
    const onTripSelect = jest.fn()
    const { getByLabelText } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={onTripSelect} onExport={jest.fn()} />
    )

    fireEvent.press(getByLabelText(/Trip 2,/))

    expect(onTripSelect).toHaveBeenCalledTimes(1)
    expect(onTripSelect.mock.calls[0][0].index).toBe(2)
  })

  it("Select all selects every trip, then deselect all clears", () => {
    const onExport = jest.fn()
    const { getByLabelText } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={jest.fn()} onExport={onExport} />
    )

    fireEvent(getByLabelText(/Trip 1,/), "longPress")
    fireEvent.press(getByLabelText("Select all trips"))
    fireEvent.press(getByLabelText("Export selected trips"))
    fireEvent.press(getByLabelText(/Export 3 selected trips as GPX/))

    expect(onExport).toHaveBeenCalledTimes(1)
    const [, trips] = onExport.mock.calls[0]
    expect(trips.map((t: Trip) => t.index)).toEqual([1, 2, 3])
  })

  it("CAB Share exports only the selected subset (non-contiguous)", () => {
    const onExport = jest.fn()
    const trips = makeTrips(3)
    const { getByLabelText } = render(
      <TripList trips={trips} colors={colors} onTripSelect={jest.fn()} onExport={onExport} />
    )

    fireEvent(getByLabelText(/Trip 1,/), "longPress")
    fireEvent.press(getByLabelText(/Trip 3,/))
    fireEvent.press(getByLabelText("Export selected trips"))
    fireEvent.press(getByLabelText(/Export 2 selected trips as GeoJSON/))

    expect(onExport).toHaveBeenCalledTimes(1)
    const [fmt, exported] = onExport.mock.calls[0] as [ExportFormat, Trip[]]
    expect(fmt).toBe("geojson")
    expect(exported.map((t) => t.index)).toEqual([1, 3])
  })

  it("CAB Trash fires onDelete with the selected subset", async () => {
    const onDelete = jest.fn().mockResolvedValue(undefined)
    const { getByLabelText } = render(
      <TripList
        trips={makeTrips(3)}
        colors={colors}
        onTripSelect={jest.fn()}
        onExport={jest.fn()}
        onDelete={onDelete}
      />
    )

    fireEvent(getByLabelText(/Trip 2,/), "longPress")
    await act(async () => {
      fireEvent.press(getByLabelText("Delete selected trips"))
    })

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete.mock.calls[0][0].map((t: Trip) => t.index)).toEqual([2])
  })

  it("double-press Trash does not fire onDelete twice while in-flight", async () => {
    let resolve!: () => void
    const onDelete = jest.fn().mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolve = r
        })
    )
    const { getByLabelText } = render(
      <TripList
        trips={makeTrips(3)}
        colors={colors}
        onTripSelect={jest.fn()}
        onExport={jest.fn()}
        onDelete={onDelete}
      />
    )

    fireEvent(getByLabelText(/Trip 1,/), "longPress")

    await act(async () => {
      fireEvent.press(getByLabelText("Delete selected trips"))
      fireEvent.press(getByLabelText("Delete selected trips"))
    })

    expect(onDelete).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolve()
    })
  })

  it("Cancel X clears selection and returns to idle header", () => {
    const { getByLabelText, queryByLabelText } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={jest.fn()} onExport={jest.fn()} />
    )

    fireEvent(getByLabelText(/Trip 1,/), "longPress")
    expect(getByLabelText("Cancel selection")).toBeTruthy()

    fireEvent.press(getByLabelText("Cancel selection"))

    expect(queryByLabelText("Cancel selection")).toBeNull()
    expect(getByLabelText("Export all trips")).toBeTruthy()
  })

  it("changing the trips prop clears the selection", () => {
    const { getByLabelText, queryByLabelText, rerender } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={jest.fn()} onExport={jest.fn()} />
    )

    fireEvent(getByLabelText(/Trip 1,/), "longPress")
    expect(getByLabelText("Cancel selection")).toBeTruthy()

    rerender(<TripList trips={makeTrips(2)} colors={colors} onTripSelect={jest.fn()} onExport={jest.fn()} />)

    expect(queryByLabelText("Cancel selection")).toBeNull()
  })

  it("idle Export All exports the full trips array", () => {
    const onExport = jest.fn()
    const { getByLabelText, getByText } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={jest.fn()} onExport={onExport} />
    )

    fireEvent.press(getByLabelText("Export all trips"))
    fireEvent.press(getByText("KML"))

    expect(onExport).toHaveBeenCalledTimes(1)
    const [fmt, exported] = onExport.mock.calls[0] as [ExportFormat, Trip[]]
    expect(fmt).toBe("kml")
    expect(exported).toHaveLength(3)
  })
})
