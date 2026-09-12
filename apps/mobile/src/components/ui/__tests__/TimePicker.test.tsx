import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { TimePicker } from "../TimePicker"

describe("TimePicker", () => {
  const onChange = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  function renderPicker(value = "14:05") {
    return render(<TimePicker label="Time (24h)" value={value} onChange={onChange} />)
  }

  it("draws the label itself, so a caller does not hand-roll one beside it", () => {
    const { getByText } = renderPicker()

    expect(getByText("Time (24h)")).toBeTruthy()
  })

  it("names both fields with the label, because Hours alone does not say which time", () => {
    const { getByLabelText } = renderPicker()

    expect(getByLabelText("Time (24h), hours")).toBeTruthy()
    expect(getByLabelText("Time (24h), minutes")).toBeTruthy()
  })

  it("pads a single digit on blur, so the value always round-trips as HH:mm", () => {
    const { getByTestId } = renderPicker()

    fireEvent.changeText(getByTestId("timepicker-hour-value"), "7")
    fireEvent(getByTestId("timepicker-hour-value"), "blur")

    expect(onChange).toHaveBeenCalledWith("07:05")
  })

  it("clamps an hour past 23 rather than storing an unparseable time", () => {
    const { getByTestId } = renderPicker()

    fireEvent.changeText(getByTestId("timepicker-hour-value"), "99")
    fireEvent(getByTestId("timepicker-hour-value"), "blur")

    expect(onChange).toHaveBeenCalledWith("23:05")
  })

  it("clamps a minute past 59 the same way", () => {
    const { getByTestId } = renderPicker()

    fireEvent.changeText(getByTestId("timepicker-minute-value"), "70")
    fireEvent(getByTestId("timepicker-minute-value"), "blur")

    expect(onChange).toHaveBeenCalledWith("14:59")
  })
})
