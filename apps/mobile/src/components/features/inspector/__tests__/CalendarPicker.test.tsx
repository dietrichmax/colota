import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"
import { CalendarPicker } from "../CalendarPicker"

// September 2026, so August is a reachable past month and October a refused future one.
const TODAY = new Date(2026, 8, 15)

function renderPicker(overrides: Partial<React.ComponentProps<typeof CalendarPicker>> = {}) {
  const onMonthChange = jest.fn()
  const onDateChange = jest.fn()
  const view = render(
    <CalendarPicker
      date={new Date(2026, 8, 15)}
      onDateChange={onDateChange}
      locationCount={3}
      colors={lightColors}
      daysWithData={new Set()}
      onMonthChange={onMonthChange}
      {...overrides}
    />
  )
  return { ...view, onMonthChange, onDateChange }
}

function expand(view: ReturnType<typeof renderPicker>) {
  fireEvent.press(view.getByTestId("calendar-toggle-btn"))
}

beforeAll(() => {
  jest.useFakeTimers()
  jest.setSystemTime(TODAY)
})

afterAll(() => {
  jest.useRealTimers()
})

describe("CalendarPicker date panes", () => {
  it("reaches any month without one chevron tap per month", () => {
    const view = renderPicker()
    expand(view)

    expect(view.getByTestId("prev-month-btn")).toBeTruthy()
    expect(view.queryByTestId("year-pane")).toBeNull()

    fireEvent.press(view.getByTestId("calendar-pane-btn"))

    expect(view.getByTestId("year-pane")).toBeTruthy()
    // The month chevrons step the day grid, which is no longer on screen.
    expect(view.queryByTestId("prev-month-btn")).toBeNull()
  })

  it("asks the screen for the picked month so its days load", () => {
    const view = renderPicker()
    expand(view)

    fireEvent.press(view.getByTestId("calendar-pane-btn"))
    fireEvent.press(view.getByTestId("year-2026"))
    fireEvent.press(view.getByTestId("month-1"))

    expect(view.onMonthChange).toHaveBeenCalledWith(2026, 1)
    expect(view.getByTestId("prev-month-btn")).toBeTruthy()
  })

  it("crosses a year boundary, which the chevrons need twelve taps for", () => {
    const view = renderPicker()
    expand(view)

    fireEvent.press(view.getByTestId("calendar-pane-btn"))
    fireEvent.press(view.getByTestId("year-2021"))
    fireEvent.press(view.getByTestId("month-11"))

    expect(view.onMonthChange).toHaveBeenCalledWith(2021, 11)
  })

  it("offers no year the app cannot hold data for", () => {
    const view = renderPicker()
    expand(view)
    fireEvent.press(view.getByTestId("calendar-pane-btn"))

    expect(view.queryByTestId("year-2027")).toBeNull()
    expect(view.getByTestId("year-2000")).toBeTruthy()
  })

  it("refuses months after today, as the forward chevron already does", () => {
    const view = renderPicker()
    expand(view)

    fireEvent.press(view.getByTestId("calendar-pane-btn"))
    fireEvent.press(view.getByTestId("year-2026"))
    fireEvent.press(view.getByTestId("month-9"))

    expect(view.onMonthChange).not.toHaveBeenCalled()
    expect(view.getByTestId("month-9").props.accessibilityState).toMatchObject({ disabled: true })
  })

  it("allows a full past year once the year moves back", () => {
    const view = renderPicker()
    expand(view)

    fireEvent.press(view.getByTestId("calendar-pane-btn"))
    fireEvent.press(view.getByTestId("year-2025"))

    expect(view.getByTestId("month-9").props.accessibilityState).toMatchObject({ disabled: false })
  })

  it("walks back up a level rather than trapping you in a pane", () => {
    const view = renderPicker()
    expand(view)

    fireEvent.press(view.getByTestId("calendar-pane-btn"))
    fireEvent.press(view.getByTestId("year-2025"))
    expect(view.getByTestId("month-pane")).toBeTruthy()

    fireEvent.press(view.getByTestId("calendar-pane-btn"))
    expect(view.getByTestId("year-pane")).toBeTruthy()

    fireEvent.press(view.getByTestId("calendar-pane-btn"))
    expect(view.getByTestId("prev-month-btn")).toBeTruthy()
    expect(view.onMonthChange).not.toHaveBeenCalled()
  })

  it("marks the year and month the day grid is showing", () => {
    const view = renderPicker()
    expand(view)

    fireEvent.press(view.getByTestId("calendar-pane-btn"))
    expect(view.getByTestId("year-2026").props.accessibilityState).toMatchObject({ checked: true })
    expect(view.getByTestId("year-2025").props.accessibilityState).toMatchObject({ checked: false })

    fireEvent.press(view.getByTestId("year-2026"))
    expect(view.getByTestId("month-8").props.accessibilityState).toMatchObject({ checked: true })
    expect(view.getByTestId("month-7").props.accessibilityState).toMatchObject({ checked: false })
  })
})
