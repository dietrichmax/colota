import React from "react"
import { Text } from "react-native"
import { render, fireEvent } from "@testing-library/react-native"
import { lightColors, darkColors, radius } from "@colota/shared"
import { MapOverlay } from "../MapOverlay"
import { elevation, size } from "../../../constants"

let mockMode: "light" | "dark" = "light"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => {
    const shared = require("@colota/shared")
    return { mode: mockMode, colors: mockMode === "dark" ? shared.darkColors : shared.lightColors }
  }
}))

const flatten = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))

describe("MapOverlay", () => {
  beforeEach(() => {
    mockMode = "light"
  })

  it("floats over the tiles on the elevated surface in light", () => {
    const { getByTestId } = render(
      <MapOverlay testID="legend">
        <Text>4 zones</Text>
      </MapOverlay>
    )

    const style = flatten(getByTestId("legend").props.style)
    expect(style.backgroundColor).toBe(lightColors.cardElevated)
    expect(style.elevation).toBe(elevation.floating)
    expect(style.borderRadius).toBe(radius.lg)
  })

  // Dark mode carries the same surface on the tonal step alone. A ring would be the only
  // border left in the app, and a shadow on a dark ground reads as dirt on the tiles.
  it("drops the shadow in dark and never draws a ring", () => {
    mockMode = "dark"
    const { getByTestId } = render(
      <MapOverlay testID="legend">
        <Text>4 zones</Text>
      </MapOverlay>
    )

    const style = flatten(getByTestId("legend").props.style)
    expect(style.backgroundColor).toBe(darkColors.cardElevated)
    expect(style.elevation).toBe(0)
    expect(style.borderWidth).toBeUndefined()
    expect(style.borderColor).toBeUndefined()
  })

  // Voice Access resolves an icon-only control by its label, and the touch target has to
  // stay 48 while the paint stays 44, so hitSlop is not an option: it moves the touch
  // target without moving the accessibility node.
  it("gives the control a 48 target around the 44 disc and a spoken name", () => {
    const onPress = jest.fn()
    const { getByRole, getByTestId } = render(
      <MapOverlay variant="control" onPress={onPress} accessibilityLabel="Center on me" testID="center-btn">
        <Text>+</Text>
      </MapOverlay>
    )

    const target = flatten(getByTestId("center-btn").props.style)
    expect(target.width).toBe(size.touch)
    expect(target.height).toBe(size.touch)

    fireEvent.press(getByRole("button", { name: "Center on me" }))
    expect(onPress).toHaveBeenCalled()
  })

  it("carries the on state of a control that toggles", () => {
    const { getByRole } = render(
      <MapOverlay
        variant="control"
        onPress={jest.fn()}
        accessibilityRole="switch"
        accessibilityState={{ checked: true }}
        accessibilityLabel="Tracking"
      >
        <Text>o</Text>
      </MapOverlay>
    )

    expect(getByRole("switch", { name: "Tracking" }).props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true })
    )
  })
})
