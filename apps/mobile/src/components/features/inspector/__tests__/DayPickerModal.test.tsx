import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { Modal, StyleSheet } from "react-native"
import { space } from "../../../../constants"

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { DayPickerModal } from "../DayPickerModal"

// September 2026, so the 15th is today and the 16th is a refused future day.
const TODAY = new Date(2026, 8, 15)

function renderModal(overrides: Partial<React.ComponentProps<typeof DayPickerModal>> = {}) {
  const onSelect = jest.fn()
  const onRequestClose = jest.fn()
  const view = render(
    <DayPickerModal
      visible
      date={new Date(2026, 8, 3)}
      onSelect={onSelect}
      onRequestClose={onRequestClose}
      daysWithData={new Set(["2026-09-03"])}
      dayStats={new Map()}
      onMonthChange={jest.fn()}
      {...overrides}
    />
  )
  return { ...view, onSelect, onRequestClose }
}

beforeAll(() => {
  jest.useFakeTimers()
  jest.setSystemTime(TODAY)
})

afterAll(() => {
  jest.useRealTimers()
})

describe("DayPickerModal", () => {
  it("opens on the day pane of the shown day's month with the grid gutter", () => {
    const view = renderModal()

    expect(view.getByText("September 2026")).toBeTruthy()
    expect(view.getByTestId("day-3").props.accessibilityState).toMatchObject({ selected: true })
    expect(view.queryByTestId("year-pane")).toBeNull()

    const scrim = StyleSheet.flatten(view.getByTestId("dialog-scrim").props.style)
    const card = StyleSheet.flatten(view.getByTestId("dialog-card").props.style)
    expect(scrim.paddingHorizontal).toBe(space.lg)
    expect(card.padding).toBe(space.md)
  })

  it("hands the picker the month's data and its month changes, so the dots and the prefetch survive the dialog", () => {
    const onMonthChange = jest.fn()
    const onPrefetchMonth = jest.fn()
    const view = renderModal({
      dayStats: new Map([
        [
          "2026-09-03",
          { day: "2026-09-03", count: 412, startTime: 0, endTime: 0, distanceMeters: 12_400, tripCount: 3 }
        ]
      ]),
      onMonthChange,
      onPrefetchMonth
    })

    expect(view.getByTestId("day-dot-3")).toBeTruthy()
    expect(view.getByTestId("day-3").props.accessibilityLabel).toMatch(/, 3 trips, .+, 412 points$/)

    fireEvent.press(view.getByTestId("prev-month-btn"))
    expect(onMonthChange).toHaveBeenCalledWith(2026, 7)
    expect(onPrefetchMonth).toHaveBeenCalledWith(2026, 6)
  })

  it("renders nothing while closed", () => {
    const view = renderModal({ visible: false })

    expect(view.queryByText("September 2026")).toBeNull()
    expect(view.queryByTestId("day-3")).toBeNull()
  })

  it("selects the tapped day and closes in one tap", () => {
    const view = renderModal()

    fireEvent.press(view.getByTestId("day-9"))

    expect(view.onSelect).toHaveBeenCalledTimes(1)
    expect(view.onSelect.mock.calls[0][0].getTime()).toBe(new Date(2026, 8, 9).getTime())
    expect(view.onRequestClose).toHaveBeenCalledTimes(1)
  })

  it("comes back on the day pane after a walk into the years and a close", () => {
    const view = renderModal()

    fireEvent.press(view.getByTestId("calendar-pane-btn"))
    expect(view.getByTestId("year-pane")).toBeTruthy()

    view.rerender(
      <DayPickerModal
        visible={false}
        date={new Date(2026, 8, 3)}
        onSelect={view.onSelect}
        onRequestClose={view.onRequestClose}
        daysWithData={new Set()}
        dayStats={new Map()}
        onMonthChange={jest.fn()}
      />
    )
    view.rerender(
      <DayPickerModal
        visible
        date={new Date(2026, 8, 3)}
        onSelect={view.onSelect}
        onRequestClose={view.onRequestClose}
        daysWithData={new Set()}
        dayStats={new Map()}
        onMonthChange={jest.fn()}
      />
    )

    expect(view.queryByTestId("year-pane")).toBeNull()
    expect(view.getByTestId("day-3")).toBeTruthy()
  })

  it("closes from the footer, the scrim and hardware back without picking a day", () => {
    const view = renderModal()

    fireEvent.press(view.getByRole("button", { name: "Close" }))
    fireEvent.press(view.getByTestId("dialog-scrim"))
    view.UNSAFE_getByType(Modal).props.onRequestClose()

    expect(view.onRequestClose).toHaveBeenCalledTimes(3)
    expect(view.onSelect).not.toHaveBeenCalled()
  })

  it("carries no Today button, the header action covers it", () => {
    const view = renderModal()

    expect(view.queryByText("Today")).toBeNull()
  })
})
