import React from "react"
import { render, waitFor } from "@testing-library/react-native"

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

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    Card: ({ children, onPress }: any) =>
      onPress
        ? R.createElement(Pressable, { onPress, accessibilityRole: "button" }, children)
        : R.createElement(View, null, children),
    EmptyState: ({ title }: any) => R.createElement(Text, null, title),
    StatRow: ({ label, value }: any) =>
      R.createElement(View, null, R.createElement(Text, null, label), R.createElement(Text, null, value))
  }
})

jest.mock("../../utils/logger", () => ({
  logger: { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }
}))

import { LocationSummaryScreen } from "../LocationSummaryScreen"

describe("LocationSummaryScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetDailyStats.mockResolvedValue([
      { day: "2026-09-06", count: 412, distanceMeters: 8200, tripCount: 3, startTime: 0, endTime: 8040 }
    ])
  })

  function renderScreen() {
    return render(<LocationSummaryScreen navigation={{ navigate: jest.fn() } as any} />)
  }

  it("reads the totals as a ledger, not as four cards each holding one number", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => expect(getByText("Distance")).toBeTruthy())
    expect(getByText("Trips")).toBeTruthy()
    expect(getByText("Active days")).toBeTruthy()
    expect(getByText("Avg / day")).toBeTruthy()
  })

  it("names the period group, because its chips are radios with nothing binding them", async () => {
    const { getByLabelText } = renderScreen()

    await waitFor(() => expect(getByLabelText("Period")).toBeTruthy())
    expect(getByLabelText("Period").props.accessibilityRole).toBe("radiogroup")
  })

  it("offers the periods in sentence case", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => expect(getByText("Last 30 days")).toBeTruthy())
    expect(getByText("This week")).toBeTruthy()
  })

  it("gives a day one caption rather than three loose stats", async () => {
    const { getByText } = renderScreen()

    await waitFor(() => expect(getByText(/3 trips · 412 points/)).toBeTruthy())
  })
})
