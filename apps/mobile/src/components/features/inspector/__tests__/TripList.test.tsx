import React from "react"
import { render, fireEvent, act, waitFor } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"
import { TRIP_COLORS } from "../../../../utils/trips"
import type { Trip } from "../../../../types/global"
import type { ExportFormat } from "../../../../utils/exportConverters"

jest.mock("../../../../utils/geo", () => ({
  formatDistance: (m: number) => `${(m / 1000).toFixed(1)} km`,
  formatDuration: (s: number) => `${Math.round(s / 60)}m`,
  formatShortDistance: (m: number) => `${Math.round(m)}m`,
  formatSpeed: (s: number) => `${s} m/s`,
  formatTime: (_ts: number) => "12:00"
}))

jest.mock("../../../../utils/trips", () => ({
  TRIP_COLORS: ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"],
  getTripColor: (i: number) => `#color${i}`,
  computeTripStats: () => ({ avgSpeed: 0, elevationGain: 0, elevationLoss: 0 })
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

jest.mock("../../../../services/modalService", () => ({
  showChoice: jest.fn()
}))

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: require("@colota/shared").lightColors,
    mode: "light"
  })
}))

import { TripList } from "../TripList"
import { showChoice } from "../../../../services/modalService"

const colors = lightColors as any

function makeTrip(index: number, distance = 1000): Trip {
  return {
    index,
    locations: [],
    startTime: index * 100,
    endTime: index * 100 + 60,
    distance,
    locationCount: 5,
    startIndex: (index - 1) * 5
  }
}

function makeTrips(n: number): Trip[] {
  return Array.from({ length: n }, (_, i) => makeTrip(i + 1))
}

/** The choice sheet answers with the index of the pressed button. */
const chooseFormat = (index: number) => (showChoice as jest.Mock).mockResolvedValueOnce(index)

describe("TripList - row presentation", () => {
  beforeEach(() => jest.clearAllMocks())

  /**
   * All six trip inks fail AA as text on both grounds, so the ink identifying a trip has to be
   * the dot. A title painted in the trip colour would be unreadable for the pale members of
   * the set and would come back the moment someone "restores" the old look.
   */
  it("never paints a trip title in a trip ink", () => {
    const { getByText } = render(
      <TripList trips={makeTrips(6)} colors={colors} onTripSelect={jest.fn()} selectedTripIndex={2} />
    )

    const inks = new Set([...TRIP_COLORS, ...Array.from({ length: 6 }, (_, i) => `#color${i + 1}`)])
    for (let index = 1; index <= 6; index++) {
      const title = getByText(`Trip ${index}`)
      const painted = ([] as any[]).concat(title.props.style).filter(Boolean)
      for (const style of painted) {
        expect(inks.has(style.color)).toBe(false)
      }
    }
  })

  /** The map's selection and the CAB's both read as one tonal row, never as coloured text. */
  it("marks the map-selected trip with the tonal container, not its colour", () => {
    const { getByTestId } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={jest.fn()} selectedTripIndex={2} />
    )

    const selected = ([] as any[]).concat(getByTestId("trip-row-2").props.style).filter(Boolean)
    expect(selected.some((s) => s.backgroundColor === colors.primaryContainer)).toBe(true)

    const other = ([] as any[]).concat(getByTestId("trip-row-1").props.style).filter(Boolean)
    expect(other.some((s) => s.backgroundColor === colors.primaryContainer)).toBe(false)
  })

  it("puts distance, duration and elevation on one detail line", () => {
    const { getByText } = render(<TripList trips={[makeTrip(1, 1100)]} colors={colors} onTripSelect={jest.fn()} />)

    expect(getByText("1.1 km · 1m")).toBeTruthy()
  })
})

describe("TripList - entering selection", () => {
  beforeEach(() => jest.clearAllMocks())

  /**
   * Long-press is invisible and unreachable with switch access, so the list must also offer a
   * plain tap into selection mode.
   */
  it("enters selection mode from a tap on the Select action", () => {
    const { getByTestId, getByLabelText, getByText } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={jest.fn()} onDelete={jest.fn()} />
    )

    fireEvent.press(getByTestId("select-trips-btn"))

    expect(getByLabelText("Cancel selection")).toBeTruthy()
    expect(getByText("0 selected")).toBeTruthy()
  })

  it("selects by tap once selection mode is armed, without navigating", () => {
    const onTripSelect = jest.fn()
    const { getByTestId, getByText } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={onTripSelect} onDelete={jest.fn()} />
    )

    fireEvent.press(getByTestId("select-trips-btn"))
    fireEvent.press(getByTestId("trip-row-2"))

    expect(onTripSelect).not.toHaveBeenCalled()
    expect(getByText("1 selected")).toBeTruthy()
  })

  it("long-press on a row still enters selection mode and shows the CAB", () => {
    const { getByLabelText, queryByTestId } = render(
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
    expect(queryByTestId("select-trips-btn")).toBeNull()
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

  it("Cancel clears selection and returns to the idle header", () => {
    const { getByLabelText, queryByLabelText } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={jest.fn()} onExport={jest.fn()} />
    )

    fireEvent(getByLabelText(/Trip 1,/), "longPress")
    fireEvent.press(getByLabelText("Cancel selection"))

    expect(queryByLabelText("Cancel selection")).toBeNull()
    expect(getByLabelText("Export all")).toBeTruthy()
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
})

describe("TripList - bulk actions", () => {
  beforeEach(() => jest.clearAllMocks())

  it("Select all selects every trip, then the CAB export sends them all", async () => {
    const onExport = jest.fn()
    chooseFormat(2)
    const { getByLabelText } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={jest.fn()} onExport={onExport} />
    )

    fireEvent(getByLabelText(/Trip 1,/), "longPress")
    fireEvent.press(getByLabelText("Select all trips"))
    await act(async () => {
      fireEvent.press(getByLabelText("Export selected trips"))
    })

    expect(onExport).toHaveBeenCalledTimes(1)
    const [fmt, trips] = onExport.mock.calls[0] as [ExportFormat, Trip[]]
    expect(fmt).toBe("gpx")
    expect(trips.map((t) => t.index)).toEqual([1, 2, 3])
  })

  it("CAB export sends only the selected subset (non-contiguous)", async () => {
    const onExport = jest.fn()
    chooseFormat(1)
    const { getByLabelText } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={jest.fn()} onExport={onExport} />
    )

    fireEvent(getByLabelText(/Trip 1,/), "longPress")
    fireEvent.press(getByLabelText(/Trip 3,/))
    await act(async () => {
      fireEvent.press(getByLabelText("Export selected trips"))
    })

    const [fmt, exported] = onExport.mock.calls[0] as [ExportFormat, Trip[]]
    expect(fmt).toBe("geojson")
    expect(exported.map((t) => t.index)).toEqual([1, 3])
  })

  it("idle Export all exports the full trips array", async () => {
    const onExport = jest.fn()
    chooseFormat(3)
    const { getByLabelText } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={jest.fn()} onExport={onExport} />
    )

    await act(async () => {
      fireEvent.press(getByLabelText("Export all"))
    })

    const [fmt, exported] = onExport.mock.calls[0] as [ExportFormat, Trip[]]
    expect(fmt).toBe("kml")
    expect(exported).toHaveLength(3)
  })

  /** The dismiss button sits after the four formats, so its index must not export anything. */
  it("exports nothing when the format sheet is dismissed", async () => {
    const onExport = jest.fn()
    chooseFormat(4)
    const { getByLabelText } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={jest.fn()} onExport={onExport} />
    )

    await act(async () => {
      fireEvent.press(getByLabelText("Export all"))
    })

    expect(onExport).not.toHaveBeenCalled()
  })

  it("Delete fires onDelete with the selected subset", async () => {
    const onDelete = jest.fn().mockResolvedValue(undefined)
    const { getByLabelText } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={jest.fn()} onDelete={onDelete} />
    )

    fireEvent(getByLabelText(/Trip 2,/), "longPress")
    await act(async () => {
      fireEvent.press(getByLabelText("Delete selected trips"))
    })

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onDelete.mock.calls[0][0].map((t: Trip) => t.index)).toEqual([2])
  })

  it("double-press Delete does not fire onDelete twice while in-flight", async () => {
    let resolve!: () => void
    const onDelete = jest.fn().mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolve = r
        })
    )
    const { getByLabelText } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={jest.fn()} onDelete={onDelete} />
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

  it("Merge fires onMerge with the selected adjacent trips", async () => {
    const onMerge = jest.fn().mockResolvedValue(undefined)
    const { getByLabelText } = render(
      <TripList trips={makeTrips(4)} colors={colors} onTripSelect={jest.fn()} onMerge={onMerge} />
    )

    fireEvent(getByLabelText(/Trip 2,/), "longPress")
    fireEvent.press(getByLabelText(/Trip 3,/))
    await act(async () => {
      fireEvent.press(getByLabelText("Merge selected trips"))
    })

    expect(onMerge).toHaveBeenCalledTimes(1)
    expect(onMerge.mock.calls[0][0].map((t: Trip) => t.index)).toEqual([2, 3])
  })

  it("does not merge a non-contiguous selection", async () => {
    // Merging trips 1 and 3 would have to swallow trip 2, which the user never asked for
    const onMerge = jest.fn().mockResolvedValue(undefined)
    const { getByLabelText } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={jest.fn()} onMerge={onMerge} />
    )

    fireEvent(getByLabelText(/Trip 1,/), "longPress")
    fireEvent.press(getByLabelText(/Trip 3,/))

    const mergeBtn = getByLabelText("Merge selected trips")
    expect(mergeBtn.props.accessibilityState.disabled).toBe(true)
    await act(async () => {
      fireEvent.press(mergeBtn)
    })
    expect(onMerge).not.toHaveBeenCalled()
  })

  it("keeps the selection when a merge fails so the user can retry", async () => {
    const onMerge = jest.fn().mockRejectedValue(new Error("bridge down"))
    const { getByLabelText } = render(
      <TripList trips={makeTrips(3)} colors={colors} onTripSelect={jest.fn()} onMerge={onMerge} />
    )

    fireEvent(getByLabelText(/Trip 1,/), "longPress")
    fireEvent.press(getByLabelText(/Trip 2,/))
    await act(async () => {
      fireEvent.press(getByLabelText("Merge selected trips"))
    })

    expect(getByLabelText("Cancel selection")).toBeTruthy()
    await act(async () => {
      fireEvent.press(getByLabelText("Merge selected trips"))
    })
    expect(onMerge).toHaveBeenCalledTimes(2)
  })
})

describe("TripList - empty day", () => {
  beforeEach(() => jest.clearAllMocks())

  /** The action stays on this screen: jumping to today would answer a question nobody asked. */
  it("offers an action that acts on the day being shown", async () => {
    const onShowOnMap = jest.fn()
    const { getByText } = render(
      <TripList trips={[]} colors={colors} onTripSelect={jest.fn()} onShowOnMap={onShowOnMap} />
    )

    expect(getByText("No trips on this day")).toBeTruthy()
    fireEvent.press(getByText("Show the day on the map"))

    await waitFor(() => expect(onShowOnMap).toHaveBeenCalled())
  })

  it("shows no action when the screen offers none", () => {
    const { queryByText } = render(<TripList trips={[]} colors={colors} onTripSelect={jest.fn()} />)

    expect(queryByText("Show the day on the map")).toBeNull()
  })
})
