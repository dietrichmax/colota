import React from "react"
import { render } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { ChipGroup } from "../ChipGroup"

const OPTIONS = [
  { value: "a", label: "None", testID: "chip-a" },
  { value: "b", label: "Basic auth", testID: "chip-b" }
] as const

describe("ChipGroup", () => {
  it("fills the selected chip and recesses the rest, so neither carries a stroke", () => {
    const { getByTestId } = render(<ChipGroup options={OPTIONS} selected="b" onSelect={jest.fn()} />)

    const flat = (el: any) => Object.assign({}, ...[el.props.style].flat(Infinity).filter(Boolean))
    expect(flat(getByTestId("chip-b")).backgroundColor).toBe(lightColors.primaryContainer)
    expect(flat(getByTestId("chip-a")).backgroundColor).toBe(lightColors.well)
    expect(flat(getByTestId("chip-a")).borderWidth).toBeUndefined()
  })

  it("recolours a disabled chip instead of fading the whole thing", () => {
    const { getByTestId, getByText } = render(
      <ChipGroup options={OPTIONS} selected="b" onSelect={jest.fn()} disabled={new Set(["a"] as const)} />
    )

    const flat = (el: any) => Object.assign({}, ...[el.props.style].flat(Infinity).filter(Boolean))
    expect(flat(getByTestId("chip-a")).opacity).toBeUndefined()
    expect(flat(getByTestId("chip-a")).backgroundColor).toBe(lightColors.well)
    expect(flat(getByText("None")).color).toBe(lightColors.textDisabled)
  })

  it("marks selection with a check and a state, not colour alone", () => {
    // Colour-only selection fails a colour-blind user and is an Accessibility Scanner finding.
    const { getByTestId } = render(<ChipGroup options={OPTIONS} selected="b" onSelect={jest.fn()} />)

    expect(getByTestId("chip-b").props.accessibilityState.checked).toBe(true)
    expect(getByTestId("chip-a").props.accessibilityState.checked).toBe(false)
  })
})
