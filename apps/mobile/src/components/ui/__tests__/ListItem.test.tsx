import React from "react"
import { render } from "@testing-library/react-native"
import { StyleSheet } from "react-native"
import { space } from "../../../constants"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { ListItem } from "../ListItem"

describe("ListItem", () => {
  it("says whether the panel it opens is showing", () => {
    // Without the expanded state TalkBack announces a plain button and the panel opening
    // below is silent. A hint is not a substitute: it is read late and never on the change.
    const { getByTestId, rerender } = render(
      <ListItem label="Map tile server" onPress={jest.fn()} expanded={false} testID="row" />
    )
    expect(getByTestId("row").props.accessibilityState.expanded).toBe(false)

    rerender(<ListItem label="Map tile server" onPress={jest.fn()} expanded testID="row" />)
    expect(getByTestId("row").props.accessibilityState.expanded).toBe(true)
  })

  it("leaves expanded unset on a row that opens nothing", () => {
    const { getByTestId } = render(<ListItem label="Connection" onPress={jest.fn()} testID="row" />)
    expect(getByTestId("row").props.accessibilityState.expanded).toBeUndefined()
  })

  it("cancels the card's inset and reapplies it, so a press fills the card's width", () => {
    // The two must stay equal and opposite. If Card's padding ever stops being space.lg the
    // row silently shifts, which is the failure this pins: the content sits where the card
    // put it, and only the ripple reaches further.
    const { getByTestId } = render(<ListItem label="Connection" onPress={jest.fn()} testID="row" />)
    const style = StyleSheet.flatten(getByTestId("row").props.style)

    expect(style.marginHorizontal).toBe(-space.lg)
    expect(style.paddingHorizontal).toBe(space.lg)
    expect(style.marginHorizontal + style.paddingHorizontal).toBe(0)
  })
})
