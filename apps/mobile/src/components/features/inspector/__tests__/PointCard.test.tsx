import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"
import { StyleSheet } from "react-native"
import { lightColors } from "@colota/shared"
import { size, space } from "../../../../constants"
import { Divider } from "../../../ui/Divider"
import { PointCard } from "../PointCard"

const mockShowPrompt = jest.fn()
jest.mock("../../../../services/modalService", () => ({
  showPrompt: (...args: unknown[]) => mockShowPrompt(...args)
}))

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

jest.mock("../../../../utils/geo", () => ({
  formatSpeed: (mps: number) => `${(mps * 3.6).toFixed(1)} km/h`,
  formatTime: (ts: number, seconds?: boolean) => {
    const h = Math.floor(ts / 3600)
    const m = Math.floor((ts % 3600) / 60)
    const s = ts % 60
    const pad = (n: number) => String(n).padStart(2, "0")
    return seconds ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}`
  }
}))

const TS = 8 * 3600 + 12 * 60 + 1
const point = {
  id: 7,
  latitude: 48.1,
  longitude: 11.5,
  timestamp: TS,
  speed: 5,
  accuracy: 8.4,
  altitude: 412.3,
  sent: 1
}

function renderCard(props: Partial<React.ComponentProps<typeof PointCard>> = {}) {
  const callbacks = { onSplit: jest.fn(), onDelete: jest.fn(), onClose: jest.fn(), onSaveNote: jest.fn() }
  const utils = render(<PointCard point={point} note={undefined} hasEndpoint {...callbacks} {...props} />)
  return { ...utils, ...callbacks }
}

describe("PointCard", () => {
  it("heads with the exact time and the three actions, so the card says which point it is and what can be done", () => {
    const { getByTestId, getByLabelText, onSplit, onDelete, onClose } = renderCard()

    const time = getByTestId("point-time")
    expect(time.props.children).toBe("08:12:01")
    expect(StyleSheet.flatten(time.props.style).fontVariant).toEqual(["tabular-nums"])
    expect(StyleSheet.flatten(time.props.style).marginStart).toBeUndefined()
    expect(StyleSheet.flatten(time.parent?.parent?.props.style).gap).toBe(space.lg)
    expect(getByTestId("icon-Clock").props.size).toBe(size.icon.md)

    fireEvent.press(getByLabelText("Start a new trip here"))
    fireEvent.press(getByLabelText("Delete point"))
    fireEvent.press(getByLabelText("Close"))
    expect(onSplit).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(getByTestId("icon-Trash2").props.color).toBe(lightColors.error)
  })

  it("offers no Delete on a screen that cannot remove a point, rather than a button that does nothing", () => {
    const { queryByLabelText, getByLabelText } = renderCard({ onDelete: undefined })

    expect(queryByLabelText("Delete point")).toBeNull()
    expect(getByLabelText("Start a new trip here")).toBeTruthy()
    expect(getByLabelText("Close")).toBeTruthy()
  })

  it("lists speed, accuracy, altitude and sync with a seam before each, and the note row last", () => {
    const { getByLabelText, UNSAFE_getAllByType } = renderCard()

    expect(getByLabelText("Speed, 18.0 km/h")).toBeTruthy()
    expect(getByLabelText("Accuracy, ±8 m")).toBeTruthy()
    expect(getByLabelText("Altitude, 412 m")).toBeTruthy()
    expect(getByLabelText("Sync, Sent")).toBeTruthy()
    expect(getByLabelText("Note, Add a note").props.accessibilityRole).toBe("button")
    const dividers = UNSAFE_getAllByType(Divider)
    expect(dividers).toHaveLength(5)
    for (const divider of dividers) {
      expect(divider.props.tight).toBe(true)
      expect(divider.props.inset).toBe(true)
    }
  })

  it("omits a fact the fix did not carry together with its seam, rather than printing a blank", () => {
    const { queryByLabelText, getByLabelText, UNSAFE_getAllByType } = renderCard({
      point: { ...point, speed: undefined, altitude: undefined }
    })

    expect(queryByLabelText(/^Speed/)).toBeNull()
    expect(queryByLabelText(/^Altitude/)).toBeNull()
    expect(getByLabelText("Accuracy, ±8 m")).toBeTruthy()
    expect(UNSAFE_getAllByType(Divider)).toHaveLength(3)
  })

  it("hides the sync row without an endpoint, since nothing is queued anywhere", () => {
    const { queryByLabelText } = renderCard({ hasEndpoint: false })

    expect(queryByLabelText(/^Sync/)).toBeNull()
  })

  it("reads Queued for a point the server has not received yet", () => {
    const { getByLabelText } = renderCard({ point: { ...point, sent: 0 } })

    expect(getByLabelText("Sync, Queued")).toBeTruthy()
  })

  it("shows the note under the Note row, or invites one when the point has none", () => {
    const empty = renderCard()
    expect(empty.getByText("Add a note")).toBeTruthy()
    empty.unmount()

    const noted = renderCard({ note: "Coffee stop" })
    expect(noted.getByText("Coffee stop")).toBeTruthy()
    expect(noted.queryByText("Add a note")).toBeNull()
  })

  it("edits the note through the app's prompt dialog seeded with the note, and hands the answer back", async () => {
    mockShowPrompt.mockResolvedValueOnce("Lunch")
    const { getByTestId, onSaveNote } = renderCard({ note: "Coffee stop" })

    fireEvent.press(getByTestId("point-note"))

    expect(mockShowPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Note",
        initialValue: "Coffee stop",
        multiline: true,
        placeholder: "Add a note"
      })
    )
    await waitFor(() => expect(onSaveNote).toHaveBeenCalledWith("Lunch"))
  })

  it("clears the note on an empty answer and keeps it when the prompt is dismissed", async () => {
    const first = renderCard({ note: "Coffee stop" })
    mockShowPrompt.mockResolvedValueOnce("")
    fireEvent.press(first.getByTestId("point-note"))
    await waitFor(() => expect(first.onSaveNote).toHaveBeenCalledWith(null))

    const second = renderCard({ note: "Coffee stop" })
    mockShowPrompt.mockResolvedValueOnce(null)
    fireEvent.press(second.getByTestId("point-note"))
    await new Promise<void>((r) => setTimeout(() => r(), 0))
    expect(second.onSaveNote).not.toHaveBeenCalled()
  })

  it("shows Split only where a caller offers it, since only Trip Detail edits a trip", () => {
    const { queryByTestId } = renderCard({ onSplit: undefined })

    expect(queryByTestId("point-split")).toBeNull()
  })
})
