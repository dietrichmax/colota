import React from "react"
import { render } from "@testing-library/react-native"
import { StyleSheet, Text } from "react-native"
import { lightColors, radius } from "@colota/shared"
import { elevation } from "../../../constants"

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

  it("recedes when disabled instead of wearing an enabled label", () => {
    // The fill itself went to textDisabled while the label stayed textOnPrimary, so Offline maps'
    // disabled download button was white on grey and still read as a filled button you could press.
    const { getByTestId } = render(<Button title="Download area" onPress={jest.fn()} disabled testID="download-btn" />)

    expect(flat(getByTestId("download-btn")).backgroundColor).toBe(lightColors.well)
    expect(StyleSheet.flatten(getByTestId("download-btn").findByType(Text).props.style).color).toBe(
      lightColors.textDisabled
    )
  })

  it("greys a disabled ghost without giving it a fill to recede into", () => {
    // A ghost is transparent by role, so the recessed fill would draw it a box it never had.
    const { getByTestId, rerender } = render(
      <Button title="Reset all" onPress={jest.fn()} variant="ghost" testID="reset-btn" />
    )
    const label = () => getByTestId("reset-btn").findByType(Text).props.style

    expect(StyleSheet.flatten(label()).color).toBe(lightColors.primaryDark)

    rerender(<Button title="Reset all" onPress={jest.fn()} variant="ghost" disabled testID="reset-btn" />)
    expect(StyleSheet.flatten(label()).color).toBe(lightColors.textDisabled)
    expect(flat(getByTestId("reset-btn")).backgroundColor).toBe("transparent")
  })

  it("paints the corner itself, because a caller's style lands on the outer view", () => {
    const { getByTestId } = render(
      <Button title="Start tracking" onPress={jest.fn()} shape="pill" testID="start-btn" />
    )

    expect(flat(getByTestId("start-btn")).borderRadius).toBe(radius.pill)
  })

  it("keeps a plain button on the shape scale rather than the retired alias", () => {
    const { getByTestId } = render(<Button title="Save" onPress={jest.fn()} testID="save-btn" />)

    expect(flat(getByTestId("save-btn")).borderRadius).toBe(radius.sm)
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

  it("lifts the painted node when floating, because Android draws no shadow on an unfilled wrapper", () => {
    const { getByTestId } = render(<Button title="Start tracking" onPress={jest.fn()} floating testID="start-btn" />)

    const style = flat(getByTestId("start-btn"))
    expect(style.backgroundColor).toBe(lightColors.primary)
    expect(style.elevation).toBe(elevation.floating)
  })

  it("sits flat on its ground unless asked to float", () => {
    const { getByTestId } = render(<Button title="Save" onPress={jest.fn()} testID="save-btn" />)

    expect(flat(getByTestId("save-btn")).elevation).toBeUndefined()
  })
})
