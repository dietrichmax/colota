import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { Toggle } from "../Toggle"

describe("Toggle", () => {
  it("puts the thumb on the container, not on its own colour at half alpha", () => {
    const { getByTestId } = render(
      <Toggle testID="t" value={true} onValueChange={jest.fn()} accessibilityLabel="Offline mode" />
    )

    // RN resolves trackColor and thumbColor into these before they reach the platform. The track
    // was the accent at 50 percent, which left the thumb 2.4:1 against its own bar; the container
    // takes that to 4.1 in light and 6.6 in dark.
    const el = getByTestId("t")
    expect(el.props.onTintColor).toBe(lightColors.primaryContainer)
    expect(el.props.thumbTintColor).toBe(lightColors.primary)
  })

  it("leaves the off state to Android, so the thumb is not the colour of its own track", () => {
    // Tinting both with colors.border made them identical at 1.00:1, so an off switch was a
    // uniform pill with no visible thumb. Undefined clears the colour filter and restores the
    // platform drawable, which also fixes how a disabled switch renders.
    const { getByTestId } = render(
      <Toggle testID="t" value={false} onValueChange={jest.fn()} accessibilityLabel="Offline mode" />
    )

    const el = getByTestId("t")
    expect(el.props.thumbTintColor).toBeUndefined()
    expect(el.props.tintColor).toBeUndefined()
  })

  it("gives every switch the same hue, because being on is not a warning", () => {
    // The geofence pause toggle used to paint warning. It was the only one, it was not applied
    // to the three sibling toggles that also stop GPS, and orange reads as a fault rather than
    // as the setting working.
    const { getByTestId } = render(
      <Toggle testID="t" value={true} onValueChange={jest.fn()} accessibilityLabel="Pause" />
    )

    const el = getByTestId("t")
    expect(el.props.onTintColor).toBe(lightColors.primaryContainer)
    expect(el.props.thumbTintColor).toBe(lightColors.primary)
  })

  it("reports the change so a caller can persist it", () => {
    const onValueChange = jest.fn()
    const { getByTestId } = render(
      <Toggle testID="t" value={false} onValueChange={onValueChange} accessibilityLabel="Offline mode" />
    )

    fireEvent(getByTestId("t"), "valueChange", true)
    expect(onValueChange).toHaveBeenCalledWith(true)
  })

  it("carries the label so Voice Access can resolve the row by its visible words", () => {
    const { getByTestId } = render(
      <Toggle testID="t" value={false} onValueChange={jest.fn()} accessibilityLabel="Offline mode" />
    )

    expect(getByTestId("t").props.accessibilityLabel).toBe("Offline mode")
  })
})
