import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { SyncIntervalPicker } from "../SyncIntervalPicker"

describe("SyncIntervalPicker", () => {
  const onSelect = jest.fn()
  const onChange = jest.fn()
  const onClamp = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  function renderPicker(value = 300, min?: number) {
    return render(
      <SyncIntervalPicker
        label="Sync interval"
        hint="How often to upload data to server"
        value={value}
        min={min}
        onSelect={onSelect}
        onChange={onChange}
        onClamp={onClamp}
      />
    )
  }

  it("offers every preset plus Custom", () => {
    const { getByTestId } = renderPicker()

    expect(getByTestId("sync-interval-0")).toBeTruthy()
    expect(getByTestId("sync-interval-60")).toBeTruthy()
    expect(getByTestId("sync-interval-300")).toBeTruthy()
    expect(getByTestId("sync-interval-900")).toBeTruthy()
    expect(getByTestId("sync-interval-custom")).toBeTruthy()
  })

  it("reports a preset press without touching the custom field", () => {
    const { getByTestId, queryByDisplayValue } = renderPicker()

    fireEvent.press(getByTestId("sync-interval-60"))

    expect(onSelect).toHaveBeenCalledWith(60)
    expect(queryByDisplayValue("300")).toBeNull()
  })

  it("opens Custom on the interval you already had and reports nothing", () => {
    const { getByTestId, getByDisplayValue } = renderPicker(300)

    fireEvent.press(getByTestId("sync-interval-custom"))

    // Both callers used to seed a hardcoded 1800 here and save it, discarding the interval.
    expect(onSelect).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(onClamp).not.toHaveBeenCalled()
    expect(getByDisplayValue("300")).toBeTruthy()
  })

  it("leaves Custom for a preset even though the value it opened on was itself a preset", () => {
    const { getByTestId, queryByDisplayValue } = renderPicker(300)

    fireEvent.press(getByTestId("sync-interval-custom"))
    expect(queryByDisplayValue("300")).toBeTruthy()

    fireEvent.press(getByTestId("sync-interval-60"))

    expect(queryByDisplayValue("300")).toBeNull()
    expect(onSelect).toHaveBeenCalledWith(60)
  })

  it("stays in Custom when the value is off every preset", () => {
    const { getByDisplayValue } = renderPicker(120)

    expect(getByDisplayValue("120")).toBeTruthy()
  })

  it("reports a typed value only once it is valid", () => {
    const { getByDisplayValue } = renderPicker(120)

    fireEvent.changeText(getByDisplayValue("120"), "")
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.changeText(getByDisplayValue(""), "45")
    expect(onChange).toHaveBeenCalledWith(45)
  })

  it("clamps to the floor its caller sets, which differs between settings and a profile", () => {
    const { getByDisplayValue } = renderPicker(120, 0)

    fireEvent.changeText(getByDisplayValue("120"), "-5")
    fireEvent(getByDisplayValue("-5"), "blur")

    expect(onClamp).toHaveBeenCalledWith(0)
  })
})
