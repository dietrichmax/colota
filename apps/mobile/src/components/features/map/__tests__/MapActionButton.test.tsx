import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { Text } from "react-native"
import { elevation, HIT_SLOP_SM, size, space, STATE_LAYER_ALPHA } from "../../../../constants"
import { lightColors, radius } from "@colota/shared"

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { MapActionButton } from "../MapActionButton"

const flat = (el: { props: { style?: unknown } }) =>
  Object.assign({}, ...[el.props.style].flat(Infinity).filter(Boolean))

type Node = {
  type: unknown
  parent: Node | null
  props: { style?: unknown; android_ripple?: unknown; hitSlop?: unknown }
}
const disc = (el: Node) => {
  let node = el.parent
  while (node && node.type !== "View") node = node.parent
  return node as Node
}
const rippleOf = (el: Node) => {
  let node = el.parent
  while (node && node.props.android_ripple === undefined) node = node.parent
  return node?.props.android_ripple
}

describe("MapActionButton", () => {
  it("floats over the tiles by default, so the map screens keep their disc where it was", () => {
    const { getByRole } = render(
      <MapActionButton onPress={jest.fn()} accessibilityRole="button" accessibilityLabel="Do it">
        <Text>x</Text>
      </MapActionButton>
    )

    const style = flat(disc(getByRole("button")))
    expect(style.position).toBe("absolute")
    expect(style.bottom).toBe(space.xxl)
  })

  it("sits in flow when not anchored, so a flex row can place it beside the pill", () => {
    const { getByRole } = render(
      <MapActionButton onPress={jest.fn()} anchored={false} accessibilityRole="button" accessibilityLabel="Do it">
        <Text>x</Text>
      </MapActionButton>
    )

    const style = flat(disc(getByRole("button")))
    expect(style.position).toBeUndefined()
    expect(style.bottom).toBeUndefined()
    expect(style.width).toBe(size.iconColumn)
    expect(style.height).toBe(size.iconColumn)
    expect(style.borderRadius).toBe(radius.md)
    expect(style.elevation).toBe(elevation.floating)
  })

  it("paints the elevated surface, so the disc matches the dock it floats beside in dark mode", () => {
    const { getByRole } = render(
      <MapActionButton onPress={jest.fn()} accessibilityRole="button" accessibilityLabel="Do it">
        <Text>x</Text>
      </MapActionButton>
    )

    const style = flat(disc(getByRole("button")))
    expect(style.backgroundColor).toBe(lightColors.surfaceRaised)
    expect(style.overflow).toBe("hidden")
  })

  it("ripples inside a clipping parent, so the press feedback takes the corner instead of painting a square", () => {
    const { getByRole } = render(
      <MapActionButton onPress={jest.fn()} accessibilityRole="button" accessibilityLabel="Do it">
        <Text>x</Text>
      </MapActionButton>
    )

    const button = getByRole("button")
    expect(rippleOf(button)).toEqual({ color: lightColors.text + STATE_LAYER_ALPHA })
    expect(flat(button).backgroundColor).toBeUndefined()
    expect(flat(button).width).toBe(size.iconColumn)
    expect(flat(button).height).toBe(size.iconColumn)

    const parent = flat(disc(button))
    expect(parent.overflow).toBe("hidden")
    expect(parent.borderRadius).toBe(radius.md)
  })

  it("lets the caller's bottom offset win over the anchor, which is how a disc takes its slot in a column", () => {
    const bottom = space.lg + size.iconColumn
    const { getByRole } = render(
      <MapActionButton onPress={jest.fn()} style={{ bottom }} accessibilityRole="button" accessibilityLabel="Do it">
        <Text>x</Text>
      </MapActionButton>
    )

    expect(flat(disc(getByRole("button"))).bottom).toBe(bottom)
  })

  it("widens its 40 disc to the 48 touch target by default, so a caller cannot forget to", () => {
    const { getByRole } = render(
      <MapActionButton onPress={jest.fn()} accessibilityRole="button" accessibilityLabel="Do it">
        <Text>x</Text>
      </MapActionButton>
    )

    expect(getByRole("button").props.hitSlop).toEqual(HIT_SLOP_SM)
    expect(disc(getByRole("button")).props.hitSlop).toEqual(HIT_SLOP_SM)
  })

  it("passes a caller's wider slop through to the wrapper, so the slop the caller sets is the one that lands", () => {
    const { getByRole } = render(
      <MapActionButton onPress={jest.fn()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Do it">
        <Text>x</Text>
      </MapActionButton>
    )

    expect(disc(getByRole("button")).props.hitSlop).toBe(12)
    expect(getByRole("button").props.hitSlop).toBe(12)
  })

  it("forwards the press and the accessibility state to the disc", () => {
    const onPress = jest.fn()
    const { getByRole } = render(
      <MapActionButton
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Do it"
        accessibilityState={{ selected: true }}
      >
        <Text>x</Text>
      </MapActionButton>
    )

    const el = getByRole("button")
    fireEvent.press(el)
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(el.props.accessibilityState).toEqual({ selected: true })
  })
})
