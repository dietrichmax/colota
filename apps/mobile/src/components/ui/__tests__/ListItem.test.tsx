import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { StyleSheet, Switch } from "react-native"
import { lightColors } from "@colota/shared"
import { size, space } from "../../../constants"

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

  it("speaks the sub after the label, because an Android label replaces the row's text", () => {
    const { getByTestId, rerender } = render(
      <ListItem label="Note" sub="Coffee stop" onPress={jest.fn()} testID="row" />
    )
    expect(getByTestId("row").props.accessibilityLabel).toBe("Note, Coffee stop")
    expect(getByTestId("row").props.accessibilityHint).toBe("Opens Note")

    rerender(<ListItem label="Note" onPress={jest.fn()} testID="row" />)
    expect(getByTestId("row").props.accessibilityLabel).toBe("Note")
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

  it("seats a trailing control outside the body behind a hairline, so the row opens and the control allows", () => {
    const onPress = jest.fn()
    const onValueChange = jest.fn()
    const { getByTestId, getByRole, UNSAFE_getAllByType } = render(
      <ListItem
        label="Driving"
        sub="When charging"
        onPress={onPress}
        testID="row"
        trailing={<Switch testID="use" value onValueChange={onValueChange} />}
      />
    )

    fireEvent.press(getByTestId("row"))
    expect(onPress).toHaveBeenCalledTimes(1)
    fireEvent(getByRole("switch"), "valueChange", false)
    expect(onValueChange).toHaveBeenCalledWith(false)
    expect(onPress).toHaveBeenCalledTimes(1)

    const { View } = require("react-native")
    const rule = UNSAFE_getAllByType(View).find(
      (v: any) => StyleSheet.flatten(v.props.style)?.width === StyleSheet.hairlineWidth
    )
    expect(StyleSheet.flatten(rule?.props.style).height).toBe(size.iconButton)
    expect(StyleSheet.flatten(rule?.props.style).backgroundColor).toBe(lightColors.divider)
  })

  it("tints the leading glyph on request and lets the sub wrap once when asked", () => {
    const Icon = (props: any) => {
      const { Text } = require("react-native")
      return (
        <Text testID="glyph" {...props}>
          i
        </Text>
      )
    }
    const { getByTestId, getByText } = render(
      <ListItem
        label="Driving"
        sub="Active · when charging"
        icon={Icon}
        iconColor="#123456"
        subLines={2}
        onPress={jest.fn()}
        testID="row"
      />
    )

    expect(getByTestId("glyph").props.color).toBe("#123456")
    expect(getByText("Active · when charging").props.numberOfLines).toBe(2)
  })
})
