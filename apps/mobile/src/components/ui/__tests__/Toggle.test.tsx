import React from "react"
import { Platform } from "react-native"
import { render, fireEvent } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"
import { SWITCH_TRACK_ALPHA } from "../../../constants"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { Toggle } from "../Toggle"

// Switch sends different props per platform; these are the ones Android receives.
beforeEach(() => {
  jest.replaceProperty(Platform, "OS", "android")
})

afterEach(() => {
  jest.restoreAllMocks()
})

function renderToggle(props: { value: boolean; disabled?: boolean; onValueChange?: (value: boolean) => void }) {
  return render(
    <Toggle testID="t" onValueChange={jest.fn()} accessibilityLabel="Offline mode" {...props} />
  ).getByTestId("t")
}

describe("Toggle", () => {
  it("paints on as a primary thumb on the container, the same for every switch", () => {
    const el = renderToggle({ value: true })

    expect(el.props.trackTintColor).toBe(lightColors.primaryContainer)
    expect(el.props.thumbTintColor).toBe(lightColors.primary)
  })

  it("paints off from the app theme, not the system's night mode", () => {
    const el = renderToggle({ value: false })

    expect(el.props.trackTintColor).toBe(lightColors.border + SWITCH_TRACK_ALPHA)
    expect(el.props.thumbTintColor).toBe(lightColors.textSecondary)
  })

  it("hands native both tracks, because a tap swaps the track before JS re-renders", () => {
    const el = renderToggle({ value: false })

    expect(el.props.trackColorForTrue).toBe(lightColors.primaryContainer)
    expect(el.props.trackColorForFalse).toBe(lightColors.border + SWITCH_TRACK_ALPHA)
  })

  it("keeps its position's track when disabled, so a disabled switch still reads as on or off", () => {
    const on = renderToggle({ value: true, disabled: true })
    const off = renderToggle({ value: false, disabled: true })

    expect(on.props.enabled).toBe(false)
    expect(on.props.thumbTintColor).toBe(lightColors.textDisabled)
    expect(on.props.trackTintColor).toBe(lightColors.primaryContainer)
    expect(off.props.thumbTintColor).toBe(lightColors.textDisabled)
    expect(off.props.trackTintColor).toBe(lightColors.border + SWITCH_TRACK_ALPHA)
  })

  it("reports the change so a caller can persist it", () => {
    const onValueChange = jest.fn()
    const el = renderToggle({ value: false, onValueChange })

    fireEvent(el, "valueChange", true)
    expect(onValueChange).toHaveBeenCalledWith(true)
  })

  it("carries the label so Voice Access can resolve the row by its visible words", () => {
    expect(renderToggle({ value: false }).props.accessibilityLabel).toBe("Offline mode")
  })
})
