import React from "react"
import { render, fireEvent, act } from "@testing-library/react-native"
import { SAVE_SUCCESS_DISPLAY_MS } from "../../../../constants"
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

  it("prices every row, with Custom printing the interval it holds in the same units as the others", () => {
    const { getByText } = renderPicker(90)

    expect(getByText("Each fix is its own request · radio never idles")).toBeTruthy()
    expect(getByText("One request every 15 min · the server hears you up to 15 min late")).toBeTruthy()
    expect(getByText("Syncs every 90 s")).toBeTruthy()
  })

  it("draws no heading when the caller titles the group itself", () => {
    const { queryByText } = render(
      <SyncIntervalPicker value={300} onSelect={onSelect} onChange={onChange} onClamp={onClamp} />
    )

    expect(queryByText("Sync interval")).toBeNull()
  })

  it("rejects a decimal with an error instead of storing a rounded value", () => {
    const { getByDisplayValue, getByText } = renderPicker(120)

    fireEvent.changeText(getByDisplayValue("120"), "1.5")

    expect(onChange).not.toHaveBeenCalled()
    expect(getByText("A whole number")).toBeTruthy()
  })

  it("says what a blur clamped to, for as long as a save notice shows", () => {
    jest.useFakeTimers()
    const { getByDisplayValue, getByText, queryByText } = renderPicker(120)

    fireEvent.changeText(getByDisplayValue("120"), "")
    fireEvent(getByDisplayValue(""), "blur")

    expect(onClamp).toHaveBeenCalledWith(1)
    expect(getByText("Set to 1 s")).toBeTruthy()
    act(() => {
      jest.advanceTimersByTime(SAVE_SUCCESS_DISPLAY_MS)
    })
    expect(queryByText("Set to 1 s")).toBeNull()
    jest.useRealTimers()
  })
})
