import React from "react"
import { render } from "@testing-library/react-native"
import { StyleSheet, Text } from "react-native"
import { lightColors } from "@colota/shared"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { Button } from "../Button"

const flat = (el: any) => StyleSheet.flatten(el.props.style)

describe("Button variants", () => {
  it("fills a secondary rather than outlining it", () => {
    // The two + Add controls were dashed boxes, which is the one border style the app had
    // nowhere else. A fill keeps them reading as controls without inventing a stroke.
    const { getByTestId } = render(
      <Button title="+ Add Header" onPress={jest.fn()} variant="secondary" testID="add-btn" />
    )

    const style = flat(getByTestId("add-btn"))
    expect(style.backgroundColor).toBe(lightColors.primaryContainer)
    expect(style.borderWidth).toBeUndefined()
  })

  it("greys a disabled ghost, which has no fill to grey instead", () => {
    // Every other variant says disabled by swapping its fill for textDisabled. A ghost has no
    // fill, so it read as pressable while refusing the press.
    const { getByTestId, rerender } = render(
      <Button title="Reset all" onPress={jest.fn()} variant="ghost" testID="reset-btn" />
    )
    const label = () => getByTestId("reset-btn").findByType(Text).props.style

    expect(StyleSheet.flatten(label()).color).toBe(lightColors.primaryDark)

    rerender(<Button title="Reset all" onPress={jest.fn()} variant="ghost" disabled testID="reset-btn" />)
    expect(StyleSheet.flatten(label()).color).toBe(lightColors.textDisabled)
  })

  it("keeps the touch target at the Android minimum", () => {
    const { getByTestId } = render(<Button title="Save profile" onPress={jest.fn()} testID="save-btn" />)

    expect(flat(getByTestId("save-btn")).minHeight).toBe(48)
  })

  it("says whether the panel it opens is showing", () => {
    // The Trip Detail export button opens a format row; its TripList twin already announces
    // this, so a screen reader got two different experiences for the same control.
    const { getByTestId, rerender } = render(
      <Button title="Export trip" onPress={jest.fn()} expanded={false} testID="export-btn" />
    )
    expect(getByTestId("export-btn").props.accessibilityState.expanded).toBe(false)

    rerender(<Button title="Export trip" onPress={jest.fn()} expanded testID="export-btn" />)
    expect(getByTestId("export-btn").props.accessibilityState.expanded).toBe(true)
  })
})
