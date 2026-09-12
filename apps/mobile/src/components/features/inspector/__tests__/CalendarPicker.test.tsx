import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { StyleSheet } from "react-native"
import { lightColors, radius } from "@colota/shared"
import { size, space } from "../../../../constants"
import type { DailyStat } from "../../../../types/global"

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

jest.mock("../../../../utils/geo", () => ({
  formatDistance: (m: number) => `${(m / 1000).toFixed(1)} km`,
  spokenDistance: (m: number) => `${(m / 1000).toFixed(1)} kilometres`
}))

import { CalendarPicker, dayCellLabel } from "../CalendarPicker"

// September 2026, so August is a reachable past month and October a refused future one.
const TODAY = new Date(2026, 8, 15)

function stat(day: string, overrides: Partial<DailyStat> = {}): DailyStat {
  return { day, count: 412, startTime: 0, endTime: 0, distanceMeters: 12_400, tripCount: 3, ...overrides }
}

function renderPicker(overrides: Partial<React.ComponentProps<typeof CalendarPicker>> = {}) {
  const onMonthChange = jest.fn()
  const onSelectDay = jest.fn()
  const view = render(
    <CalendarPicker
      date={new Date(2026, 8, 15)}
      onSelectDay={onSelectDay}
      colors={lightColors}
      daysWithData={new Set()}
      dayStats={new Map()}
      onMonthChange={onMonthChange}
      {...overrides}
    />
  )
  return { ...view, onMonthChange, onSelectDay }
}

function discOf(view: ReturnType<typeof renderPicker>, day: number) {
  return StyleSheet.flatten(view.getByTestId(`day-disc-${day}`).props.style)
}

function numeralOf(view: ReturnType<typeof renderPicker>, day: number) {
  return StyleSheet.flatten(view.getByText(String(day)).props.style)
}

beforeAll(() => {
  jest.useFakeTimers()
  jest.setSystemTime(TODAY)
})

afterAll(() => {
  jest.useRealTimers()
})

describe("CalendarPicker day grid", () => {
  it("opens on the day pane of the month the shown day belongs to", () => {
    const view = renderPicker({ date: new Date(2026, 7, 3) })

    expect(view.getByText("August 2026")).toBeTruthy()
    expect(view.getByTestId("prev-month-btn")).toBeTruthy()
    expect(view.getByTestId("day-31")).toBeTruthy()
    expect(view.queryByTestId("year-pane")).toBeNull()
  })

  it("hands back the tapped day so the screen can jump to it", () => {
    const view = renderPicker()

    fireEvent.press(view.getByTestId("day-3"))

    expect(view.onSelectDay).toHaveBeenCalledTimes(1)
    expect(view.onSelectDay.mock.calls[0][0].getTime()).toBe(new Date(2026, 8, 3).getTime())
  })

  it("marks today with a ring and the shown day with a fill, never with a border that comes and goes", () => {
    const view = renderPicker({ date: new Date(2026, 8, 3) })

    const today = discOf(view, 15)
    expect(today.borderWidth).toBe(1)
    expect(today.borderColor).toBe(lightColors.primary)
    expect(today.backgroundColor).toBeUndefined()
    expect(numeralOf(view, 15).color).toBe(lightColors.text)

    const selected = discOf(view, 3)
    expect(selected.borderWidth).toBe(1)
    expect(selected.borderColor).toBe("transparent")
    expect(selected.backgroundColor).toBe(lightColors.primary)
    expect(numeralOf(view, 3).color).toBe(lightColors.textOnPrimary)

    const plain = discOf(view, 7)
    expect(plain.borderWidth).toBe(1)
    expect(plain.borderColor).toBe("transparent")
    expect(plain.width).toBe(size.iconColumn)
    expect(plain.borderRadius).toBe(radius.pill)
  })

  it("shows a dot under a day that holds data and nothing under one that does not", () => {
    const view = renderPicker({ daysWithData: new Set(["2026-09-03"]) })

    const dot = StyleSheet.flatten(view.getByTestId("day-dot-3").props.style)
    expect(dot.width).toBe(space.xs)
    expect(dot.height).toBe(space.xs)
    expect(dot.borderRadius).toBe(radius.pill)
    expect(dot.backgroundColor).toBe(lightColors.primary)

    expect(view.queryByTestId("day-dot-7")).toBeNull()
  })

  it("refuses days after today", () => {
    const view = renderPicker()

    fireEvent.press(view.getByTestId("day-16"))

    expect(view.onSelectDay).not.toHaveBeenCalled()
    expect(view.getByTestId("day-16").props.accessibilityState).toMatchObject({ disabled: true })
    expect(numeralOf(view, 16).color).toBe(lightColors.textDisabled)
  })

  it("speaks the day's trips, distance and points, because the dot cannot", () => {
    const view = renderPicker({
      daysWithData: new Set(["2026-09-02", "2026-09-05"]),
      dayStats: new Map([
        ["2026-09-02", stat("2026-09-02")],
        ["2026-09-05", stat("2026-09-05", { count: 1, tripCount: 0, distanceMeters: 0 })]
      ])
    })

    expect(view.getByTestId("day-2").props.accessibilityLabel).toBe(
      "Wednesday 2 September, 3 trips, 12.4 kilometres, 412 points"
    )
    expect(view.getByTestId("day-5").props.accessibilityLabel).toBe("Saturday 5 September, no trips, 1 point")
    expect(view.getByTestId("day-7").props.accessibilityLabel).toBe("Monday 7 September, no data")
    expect(view.getByTestId("day-15").props.accessibilityLabel).toBe("Tuesday 15 September, no data, today")
  })

  it("keeps one trip singular", () => {
    expect(dayCellLabel(new Date(2026, 8, 1), stat("2026-09-01", { tripCount: 1, count: 1 }), false)).toBe(
      "Tuesday 1 September, 1 trip, 12.4 kilometres, 1 point"
    )
  })
})

describe("CalendarPicker date panes", () => {
  it("reaches any month without one chevron tap per month", () => {
    const view = renderPicker()

    expect(view.getByTestId("prev-month-btn")).toBeTruthy()
    expect(view.queryByTestId("year-pane")).toBeNull()

    fireEvent.press(view.getByTestId("calendar-pane-btn"))

    expect(view.getByTestId("year-pane")).toBeTruthy()
    // The month chevrons step the day grid, which is no longer on screen.
    expect(view.queryByTestId("prev-month-btn")).toBeNull()
  })

  it("asks the screen for the picked month so its days load", () => {
    const view = renderPicker()

    fireEvent.press(view.getByTestId("calendar-pane-btn"))
    fireEvent.press(view.getByTestId("year-2026"))
    fireEvent.press(view.getByTestId("month-1"))

    expect(view.onMonthChange).toHaveBeenCalledWith(2026, 1)
    expect(view.getByTestId("prev-month-btn")).toBeTruthy()
  })

  it("steps a month with the chevrons and warms the one beyond it", () => {
    const onPrefetchMonth = jest.fn()
    const view = renderPicker({ onPrefetchMonth })

    fireEvent.press(view.getByTestId("prev-month-btn"))

    expect(view.onMonthChange).toHaveBeenCalledWith(2026, 7)
    expect(onPrefetchMonth).toHaveBeenCalledWith(2026, 6)
    expect(view.getByText("August 2026")).toBeTruthy()
  })

  it("will not step into a month that has not happened", () => {
    const view = renderPicker()

    fireEvent.press(view.getByTestId("next-month-btn"))

    expect(view.onMonthChange).not.toHaveBeenCalled()
    expect(view.getByTestId("next-month-btn").props.accessibilityState).toMatchObject({ disabled: true })
  })

  it("crosses a year boundary, which the chevrons need twelve taps for", () => {
    const view = renderPicker()

    fireEvent.press(view.getByTestId("calendar-pane-btn"))
    fireEvent.press(view.getByTestId("year-2021"))
    fireEvent.press(view.getByTestId("month-11"))

    expect(view.onMonthChange).toHaveBeenCalledWith(2021, 11)
  })

  it("offers no year the app cannot hold data for", () => {
    const view = renderPicker()
    fireEvent.press(view.getByTestId("calendar-pane-btn"))

    expect(view.queryByTestId("year-2027")).toBeNull()
    expect(view.getByTestId("year-2000")).toBeTruthy()
  })

  it("refuses months after today, as the forward chevron already does", () => {
    const view = renderPicker()

    fireEvent.press(view.getByTestId("calendar-pane-btn"))
    fireEvent.press(view.getByTestId("year-2026"))
    fireEvent.press(view.getByTestId("month-9"))

    expect(view.onMonthChange).not.toHaveBeenCalled()
    expect(view.getByTestId("month-9").props.accessibilityState).toMatchObject({ disabled: true })
  })

  it("allows a full past year once the year moves back", () => {
    const view = renderPicker()

    fireEvent.press(view.getByTestId("calendar-pane-btn"))
    fireEvent.press(view.getByTestId("year-2025"))

    expect(view.getByTestId("month-9").props.accessibilityState).toMatchObject({ disabled: false })
  })

  it("walks back up a level rather than trapping you in a pane", () => {
    const view = renderPicker()

    fireEvent.press(view.getByTestId("calendar-pane-btn"))
    fireEvent.press(view.getByTestId("year-2025"))
    expect(view.getByTestId("month-pane")).toBeTruthy()

    fireEvent.press(view.getByTestId("calendar-pane-btn"))
    expect(view.getByTestId("year-pane")).toBeTruthy()

    fireEvent.press(view.getByTestId("calendar-pane-btn"))
    expect(view.getByTestId("prev-month-btn")).toBeTruthy()
    expect(view.onMonthChange).not.toHaveBeenCalled()
  })

  it("rings the current year the way the day grid rings today, never as primary text", () => {
    const view = renderPicker({ date: new Date(2025, 8, 3) })

    fireEvent.press(view.getByTestId("calendar-pane-btn"))

    const current = StyleSheet.flatten(view.getByTestId("year-2026").props.style)
    expect(current.borderWidth).toBe(1)
    expect(current.borderColor).toBe(lightColors.primary)
    expect(current.backgroundColor).toBeUndefined()
    expect(StyleSheet.flatten(view.getByText("2026").props.style).color).toBe(lightColors.text)

    const viewed = StyleSheet.flatten(view.getByTestId("year-2025").props.style)
    expect(viewed.borderColor).toBe("transparent")
    expect(viewed.backgroundColor).toBe(lightColors.primaryContainer)
  })

  it("marks the year and month the day grid is showing", () => {
    const view = renderPicker()

    fireEvent.press(view.getByTestId("calendar-pane-btn"))
    expect(view.getByTestId("year-2026").props.accessibilityState).toMatchObject({ checked: true })
    expect(view.getByTestId("year-2025").props.accessibilityState).toMatchObject({ checked: false })

    fireEvent.press(view.getByTestId("year-2026"))
    expect(view.getByTestId("month-8").props.accessibilityState).toMatchObject({ checked: true })
    expect(view.getByTestId("month-7").props.accessibilityState).toMatchObject({ checked: false })
  })
})
