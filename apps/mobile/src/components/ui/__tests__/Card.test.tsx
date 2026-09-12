import React from "react"
import { render } from "@testing-library/react-native"
import { View, Text, StyleSheet } from "react-native"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { lightColors } from "@colota/shared"
import { space } from "../../../constants"
import { Card } from "../Card"

function surfaceOf(tree: ReturnType<typeof render>) {
  // The interactive variant wraps the surface in a Pressable, so take the inner View both ways.
  const views = tree.UNSAFE_getAllByType(View)
  return StyleSheet.flatten(views[views.length - 1].props.style)
}

describe("Card", () => {
  it("still clips, because a row inside ripples to the card's own bounds", () => {
    const tree = render(
      <Card>
        <Text>Body</Text>
      </Card>
    )

    expect(surfaceOf(tree).overflow).toBe("hidden")
  })

  it("keeps its content mounted when pressable, which is where the clipping bit", () => {
    const { getByText } = render(
      <Card variant="interactive" onPress={jest.fn()}>
        <Text>Trip 1</Text>
      </Card>
    )

    expect(getByText("Trip 1")).toBeTruthy()
  })

  it("takes the caller's style on the surface, which is why a margin there spills the ripple", () => {
    // The trip row spaced itself with marginBottom, which grew the Pressable 8 past the card and
    // the ripple with it. The margin belongs to the list, and this pins where the style lands.
    const tree = render(
      <Card variant="interactive" onPress={jest.fn()} style={{ backgroundColor: lightColors.primaryContainer }}>
        <Text>Trip 1</Text>
      </Card>
    )

    const rippleBox = tree.UNSAFE_getAllByType(View)[0]
    expect(StyleSheet.flatten(rippleBox.props.style).backgroundColor).toBeUndefined()
    expect(surfaceOf(tree).backgroundColor).toBe(lightColors.primaryContainer)
  })

  it("pays its own padding unless rows are told to carry it", () => {
    const padded = render(
      <Card>
        <Text>a</Text>
      </Card>
    )
    expect(surfaceOf(padded).padding).toBe(space.lg)

    const rows = render(
      <Card rows>
        <Text>a</Text>
      </Card>
    )
    expect(surfaceOf(rows).paddingVertical).toBe(0)
  })

  it("paints a fill and no border, so an outline is left to mean state", () => {
    const tree = render(
      <Card>
        <Text>a</Text>
      </Card>
    )
    const style = surfaceOf(tree)

    expect(style.backgroundColor).toBe(lightColors.card)
    expect(style.borderWidth).toBeUndefined()
  })
})
