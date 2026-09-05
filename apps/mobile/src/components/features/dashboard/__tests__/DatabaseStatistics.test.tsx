import React from "react"
import { render } from "@testing-library/react-native"

let mockSettings = { isOfflineMode: false }

jest.mock("../../../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings
  })
}))

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
      primaryDark: "#115E59",
      text: "#000",
      textSecondary: "#6b7280",
      textLight: "#9ca3af",
      success: "#22c55e",
      info: "#3b82f6",
      card: "#fff",
      border: "#e5e7eb"
    }
  })
}))

jest.mock("../../../index", () => {
  const R = require("react")
  const { View, Text } = require("react-native")
  return {
    SectionTitle: ({ children }: any) => R.createElement(Text, null, children),
    Card: ({ children, variant }: any) => R.createElement(View, { testID: `card-${variant || "default"}` }, children)
  }
})

jest.mock("../../../../utils/queueStatus", () => ({
  getQueueColor: () => "#000"
}))

import { DatabaseStatistics } from "../DatabaseStatistics"

const baseStats = {
  queued: 12,
  sent: 100,
  total: 500,
  today: 8,
  databaseSizeMB: 2.5
}

describe("DatabaseStatistics", () => {
  beforeEach(() => {
    mockSettings = { isOfflineMode: false }
  })

  it("shows section title", () => {
    const { getByText } = render(<DatabaseStatistics stats={baseStats} />)

    expect(getByText("DATABASE STATISTICS")).toBeTruthy()
  })

  describe("online mode (default)", () => {
    it("shows Queued and Sent cards", () => {
      const { getByText } = render(<DatabaseStatistics stats={baseStats} />)

      expect(getByText("Queued")).toBeTruthy()
      expect(getByText("12")).toBeTruthy()
      expect(getByText("pending")).toBeTruthy()
      expect(getByText("Sent")).toBeTruthy()
      expect(getByText("100")).toBeTruthy()
      expect(getByText("synced")).toBeTruthy()
    })

    it("does not show Total locations card", () => {
      const { queryByText } = render(<DatabaseStatistics stats={baseStats} />)

      expect(queryByText("locations")).toBeNull()
    })

    it("shows Today and Storage cards", () => {
      const { getByText } = render(<DatabaseStatistics stats={baseStats} />)

      expect(getByText("Today")).toBeTruthy()
      expect(getByText("8")).toBeTruthy()
      expect(getByText("tracked")).toBeTruthy()
      expect(getByText("Storage")).toBeTruthy()
      expect(getByText("2.5")).toBeTruthy()
      expect(getByText("MB")).toBeTruthy()
    })
  })

  describe("offline mode", () => {
    beforeEach(() => {
      mockSettings = { isOfflineMode: true }
    })

    it("shows Total locations card instead of Queued/Sent", () => {
      const { getByText } = render(<DatabaseStatistics stats={baseStats} />)

      expect(getByText("Total")).toBeTruthy()
      expect(getByText("500")).toBeTruthy()
      expect(getByText("locations")).toBeTruthy()
    })

    it("hides Queued and Sent cards", () => {
      const { queryByText } = render(<DatabaseStatistics stats={baseStats} />)

      expect(queryByText("Queued")).toBeNull()
      expect(queryByText("pending")).toBeNull()
      expect(queryByText("Sent")).toBeNull()
      expect(queryByText("synced")).toBeNull()
    })

    it("still shows Today and Storage cards", () => {
      const { getByText } = render(<DatabaseStatistics stats={baseStats} />)

      expect(getByText("Today")).toBeTruthy()
      expect(getByText("Storage")).toBeTruthy()
    })
  })

  it("formats large numbers with locale string", () => {
    mockSettings = { isOfflineMode: true }
    const largeStats = { ...baseStats, total: 1234567 }
    const { getByText } = render(<DatabaseStatistics stats={largeStats} />)

    expect(getByText((1234567).toLocaleString())).toBeTruthy()
  })
})
