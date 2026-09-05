import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { Toggle } from "../Toggle"

describe("Toggle", () => {
  it("paints the on state from the primary hue, which is what the twelve call sites each built by hand", () => {
    const { getByTestId } = render(
      <Toggle testID="t" value={true} onValueChange={jest.fn()} accessibilityLabel="Offline mode" />
    )

    // RN resolves trackColor and thumbColor into these before they reach the platform.
    const el = getByTestId("t")
    expect(el.props.onTintColor).toBe(lightColors.primary + "80")
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

  it("takes the warning hue only when asked", () => {
    // The geofence pause toggle is the one caller that does; every other keeps primary.
    const { getByTestId } = render(
      <Toggle testID="t" value={true} onValueChange={jest.fn()} accessibilityLabel="Pause" tone="warning" />
    )

    const el = getByTestId("t")
    expect(el.props.onTintColor).toBe(lightColors.warning + "80")
    expect(el.props.thumbTintColor).toBe(lightColors.warning)
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
