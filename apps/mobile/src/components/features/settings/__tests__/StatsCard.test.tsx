import React from "react"
import { render, fireEvent } from "@testing-library/react-native"

let mockSettings = { isOfflineMode: false }

jest.mock("../../../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings
  })
}))

jest.mock("../../../../utils/queueStatus", () => ({
  getQueueColor: () => "#000"
}))

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    AlertTriangle: () => R.createElement(View, null),
    ChevronRight: () => R.createElement(View, null)
  }
})

import { StatsCard } from "../StatsCard"

const mockColors = {
  primary: "#0d9488",
  text: "#000",
  textSecondary: "#6b7280",
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#3b82f6",
  card: "#fff",
  border: "#e5e7eb"
} as any

const baseProps = {
  queueCount: 5,
  sentCount: 100,
  todayCount: 8,
  interval: "30",
  colors: mockColors
}

describe("StatsCard", () => {
  beforeEach(() => {
    mockSettings = { isOfflineMode: false }
  })

  describe("online mode", () => {
    it("shows Queued, Sent, and Interval stats", () => {
      const { getByText } = render(<StatsCard {...baseProps} />)

      expect(getByText("Queued")).toBeTruthy()
      expect(getByText("5")).toBeTruthy()
      expect(getByText("Sent")).toBeTruthy()
      expect(getByText("100")).toBeTruthy()
      expect(getByText("Interval")).toBeTruthy()
    })

    it("does not show Today stat", () => {
      const { queryByText } = render(<StatsCard {...baseProps} />)

      expect(queryByText("Today")).toBeNull()
    })

    it("shows warning banner when queue is high", () => {
      const onManage = jest.fn()
      const { getByText } = render(<StatsCard {...baseProps} queueCount={75} onManageClick={onManage} />)

      expect(getByText("High Queue Size")).toBeTruthy()
      expect(getByText("Tap to manage data")).toBeTruthy()
    })

    it("shows critical warning when queue is very high", () => {
      const onManage = jest.fn()
      const { getByText } = render(<StatsCard {...baseProps} queueCount={200} onManageClick={onManage} />)

      expect(getByText("Critical Queue Size")).toBeTruthy()
    })

    it("calls onManageClick when warning banner is pressed", () => {
      const onManage = jest.fn()
      const { getByText } = render(<StatsCard {...baseProps} queueCount={75} onManageClick={onManage} />)

      fireEvent.press(getByText("Tap to manage data"))

      expect(onManage).toHaveBeenCalledTimes(1)
    })
  })

  describe("offline mode", () => {
    beforeEach(() => {
      mockSettings = { isOfflineMode: true }
    })

    it("shows Today and Interval instead of Queued/Sent", () => {
      const { getByText } = render(<StatsCard {...baseProps} />)

      expect(getByText("Today")).toBeTruthy()
      expect(getByText("8")).toBeTruthy()
      expect(getByText("Interval")).toBeTruthy()
    })

    it("hides Queued and Sent stats", () => {
      const { queryByText } = render(<StatsCard {...baseProps} />)

      expect(queryByText("Queued")).toBeNull()
      expect(queryByText("Sent")).toBeNull()
    })

    it("hides warning banner even with high queue count", () => {
      const onManage = jest.fn()
      const { queryByText } = render(<StatsCard {...baseProps} queueCount={200} onManageClick={onManage} />)

      expect(queryByText("High Queue Size")).toBeNull()
      expect(queryByText("Critical Queue Size")).toBeNull()
    })
  })
})
