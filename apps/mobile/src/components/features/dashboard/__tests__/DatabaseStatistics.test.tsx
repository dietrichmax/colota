import React from "react"
import { render } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"
import { HIGH_QUEUE_THRESHOLD, CRITICAL_QUEUE_THRESHOLD } from "../../../../constants"

let mockSettings = { isOfflineMode: false }

jest.mock("../../../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings
  })
}))

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: require("@colota/shared").lightColors
  })
}))

import { DatabaseStatistics } from "../DatabaseStatistics"

const baseStats = {
  queued: 12,
  sent: 100,
  total: 500,
  today: 8,
  databaseSizeMB: 2.5
}

const figureInk = (node: any) => {
  const style = Array.isArray(node.props.style)
    ? Object.assign({}, ...node.props.style.filter(Boolean))
    : node.props.style
  return style.color
}

describe("DatabaseStatistics", () => {
  beforeEach(() => {
    mockSettings = { isOfflineMode: false }
  })

  it("makes the queue the one figure and puts the rest in a caption", () => {
    const { getByTestId, getByText } = render(<DatabaseStatistics stats={baseStats} />)

    expect(getByTestId("stat-queued")).toBeTruthy()
    expect(getByText("Queued")).toBeTruthy()
    expect(getByText("12")).toBeTruthy()
    expect(getByText("100 sent · 8 today · 2.5 MB")).toBeTruthy()
  })

  it("counts every location instead of a queue in offline mode", () => {
    mockSettings = { isOfflineMode: true }

    const { getByTestId, queryByTestId, getByText } = render(<DatabaseStatistics stats={baseStats} />)

    expect(getByTestId("stat-total")).toBeTruthy()
    expect(queryByTestId("stat-queued")).toBeNull()
    expect(getByText("Locations")).toBeTruthy()
    expect(getByText("8 today · 2.5 MB")).toBeTruthy()
  })

  // A queue that colours itself at 1 cries wolf: below the high threshold a backlog is normal
  // and only the depth that needs acting on is allowed to leave ink.
  it("keeps the figure in ink at the high threshold", () => {
    const { getByText } = render(<DatabaseStatistics stats={{ ...baseStats, queued: HIGH_QUEUE_THRESHOLD }} />)

    expect(figureInk(getByText(String(HIGH_QUEUE_THRESHOLD)))).toBe(lightColors.text)
  })

  it("turns the figure to warning past the high threshold", () => {
    const queued = HIGH_QUEUE_THRESHOLD + 1
    const { getByText } = render(<DatabaseStatistics stats={{ ...baseStats, queued }} />)

    expect(figureInk(getByText(String(queued)))).toBe(lightColors.warning)
  })

  it("turns the figure to error past the critical threshold", () => {
    const queued = CRITICAL_QUEUE_THRESHOLD + 1
    const { getByText } = render(<DatabaseStatistics stats={{ ...baseStats, queued }} />)

    expect(figureInk(getByText(String(queued)))).toBe(lightColors.error)
  })

  it("formats large counts with the locale separator", () => {
    mockSettings = { isOfflineMode: true }
    const { getByText } = render(<DatabaseStatistics stats={{ ...baseStats, total: 1234567 }} />)

    expect(getByText((1234567).toLocaleString())).toBeTruthy()
  })
})
