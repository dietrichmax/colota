import React from "react"
import { render, waitFor, fireEvent } from "@testing-library/react-native"

const mockGetDailyStats = jest.fn()
jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getDailyStats: (...args: any[]) => mockGetDailyStats(...args)
  }
}))

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => (() => void) | void) => {
    const R = require("react")
    R.useEffect(() => {
      const cleanup = cb()
      return typeof cleanup === "function" ? cleanup : undefined
    }, [cb])
  }
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    Card: ({ children, testID }: any) => R.createElement(View, { testID }, children),
    Divider: () => null,
    EmptyState: ({ title, hint, action }: any) =>
      R.createElement(
        View,
        { testID: "EmptyState" },
        R.createElement(Text, null, title),
        R.createElement(Text, null, hint),
        action &&
          R.createElement(
            Pressable,
            { accessibilityRole: "button", onPress: action.onPress },
            R.createElement(Text, null, action.label)
          )
      ),
    ListItem: ({ label, sub, onPress, testID }: any) =>
      R.createElement(
        Pressable,
        { accessibilityRole: "button", onPress, testID },
        R.createElement(Text, null, label),
        R.createElement(Text, null, sub)
      ),
    StatRow: ({ label, value }: any) =>
      R.createElement(View, null, R.createElement(Text, null, label), R.createElement(Text, null, value)),
    StepperHeader: (props: any) =>
      R.createElement(
        View,
        { testID: "StepperHeader", ...props },
        R.createElement(Text, null, props.title),
        R.createElement(Text, null, props.caption),
        R.createElement(Pressable, {
          accessibilityRole: "button",
          accessibilityLabel: props.previousLabel,
          accessibilityState: { disabled: !!props.previousDisabled },
          disabled: props.previousDisabled,
          onPress: props.onPrevious
        }),
        R.createElement(Pressable, {
          accessibilityRole: "button",
          accessibilityLabel: props.nextLabel,
          accessibilityState: { disabled: !!props.nextDisabled },
          disabled: props.nextDisabled,
          onPress: props.onNext
        })
      )
  }
})

// Pinned to metric so the ledger is tested for its sums, not for the unit system of the machine.
jest.mock("../../utils/geo", () => ({
  ...jest.requireActual("../../utils/geo"),
  formatDistance: (m: number) => `${(m / 1000).toFixed(1)} km`
}))

jest.mock("../../utils/logger", () => ({
  logger: { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }
}))

import { LocationSummaryScreen } from "../LocationSummaryScreen"

const day = (d: string, distanceMeters: number, tripCount: number) => ({
  day: d,
  count: 412,
  distanceMeters,
  tripCount,
  startTime: 0,
  endTime: 37_200
})

describe("LocationSummaryScreen", () => {
  const now = new Date(2026, 8, 9, 15, 0)
  const nowSec = Math.floor(now.getTime() / 1000)
  const navigate = jest.fn()
  const sec = (y: number, m: number, d: number) => Math.floor(new Date(y, m, d).getTime() / 1000)

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers({ now, advanceTimers: true })
    mockGetDailyStats.mockImplementation(async (start: number) => {
      if (start === sec(2026, 8, 7)) return [day("2026-09-08", 8200, 3), day("2026-09-07", 4000, 1)]
      if (start === sec(2026, 7, 24)) return [day("2026-08-26", 12_400, 2)]
      if (start === sec(2026, 8, 1)) return [day("2026-09-08", 8200, 3), day("2026-09-07", 4000, 1)]
      return []
    })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  function renderScreen() {
    return render(<LocationSummaryScreen navigation={{ navigate } as any} />)
  }

  it("reads only this week on focus and shows it as a ledger over its days", async () => {
    const { getByText, getByTestId, queryByText } = renderScreen()

    await waitFor(() => expect(getByTestId("period-ledger")).toBeTruthy())
    expect(mockGetDailyStats).toHaveBeenCalledTimes(1)
    expect(mockGetDailyStats).toHaveBeenCalledWith(sec(2026, 8, 7), nowSec)
    expect(getByText("This week")).toBeTruthy()
    expect(getByText("12.2 km")).toBeTruthy()
    expect(getByText("Active days")).toBeTruthy()
    expect(getByText("2")).toBeTruthy()
    expect(getByText(/8\.2 km · 3 trips · 412 points/)).toBeTruthy()
    expect(queryByText(/12\.4 km · 2 trips/)).toBeNull()
  })

  it("opens a day in Location History on its trips", async () => {
    const { getByTestId } = renderScreen()
    await waitFor(() => expect(getByTestId("day-2026-09-08")).toBeTruthy())

    fireEvent.press(getByTestId("day-2026-09-08"))

    expect(navigate).toHaveBeenCalledWith("Location History", {
      initialDate: new Date(2026, 8, 8).getTime(),
      initialTab: "trips"
    })
  })

  it("reads each stepped week once and forward again only as far as this week", async () => {
    const { getByLabelText, getByText, getByTestId } = renderScreen()
    await waitFor(() => expect(getByTestId("period-ledger")).toBeTruthy())
    expect(getByLabelText("Next week").props.accessibilityState.disabled).toBe(true)

    fireEvent.press(getByLabelText("Previous week"))
    await waitFor(() => expect(getByText("Nothing recorded")).toBeTruthy())
    expect(getByText("Last week")).toBeTruthy()
    expect(mockGetDailyStats).toHaveBeenLastCalledWith(sec(2026, 7, 31), sec(2026, 8, 7) - 1)
    expect(getByLabelText("Next week").props.accessibilityState.disabled).toBe(false)

    fireEvent.press(getByLabelText("Previous week"))
    await waitFor(() => expect(getByText(/12\.4 km · 2 trips/)).toBeTruthy())
    expect(getByText(/Aug 24 - Aug 30/)).toBeTruthy()

    fireEvent.press(getByLabelText("Next week"))
    fireEvent.press(getByLabelText("Next week"))
    expect(getByText("This week")).toBeTruthy()
    expect(mockGetDailyStats).toHaveBeenCalledTimes(3)
  })

  it("reads a month as one window and lists its days", async () => {
    const { getByText, getByTestId } = renderScreen()
    await waitFor(() => expect(getByTestId("period-ledger")).toBeTruthy())

    fireEvent.press(getByText("Month"))
    await waitFor(() => expect(getByText("This month")).toBeTruthy())
    await waitFor(() => expect(getByText("12.2 km")).toBeTruthy())
    expect(mockGetDailyStats).toHaveBeenLastCalledWith(sec(2026, 8, 1), nowSec)
    expect(getByTestId("period-days")).toBeTruthy()
  })

  it("shows an empty week with its range and no jump, since the next week with data is not known", async () => {
    mockGetDailyStats.mockResolvedValue([])
    const { getByText, getAllByText, queryByText } = renderScreen()

    await waitFor(() => expect(getByText("Nothing recorded")).toBeTruthy())
    expect(getAllByText("Sep 7 - Sep 13")).toHaveLength(2)
    expect(queryByText(/with data/)).toBeNull()
  })
})
