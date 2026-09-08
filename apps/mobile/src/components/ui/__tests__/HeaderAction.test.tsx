import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { StyleSheet } from "react-native"
import { lightColors } from "@colota/shared"
import { size, space } from "../../../constants"
import { HeaderAction } from "../HeaderAction"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const { View } = require("react-native")
  return { Upload: (props: Record<string, unknown>) => R.createElement(View, { testID: "glyph", ...props }) }
})

import { Upload } from "lucide-react-native"

describe("HeaderAction", () => {
  it("is a 24 glyph inside 12 of padding, so the 48 target sits on the grid", () => {
    const { getByTestId } = render(<HeaderAction icon={Upload} label="Export day" onPress={() => {}} testID="act" />)

    expect(StyleSheet.flatten(getByTestId("act").props.style).padding).toBe(space.md)
    expect(getByTestId("glyph").props.size).toBe(size.icon.lg)
  })

  it("is named for a screen reader and presses through", () => {
    const onPress = jest.fn()
    const { getByLabelText } = render(
      <HeaderAction icon={Upload} label="Export day" hint="Opens the format dialog" onPress={onPress} />
    )

    const action = getByLabelText("Export day")
    expect(action.props.accessibilityRole).toBe("button")
    expect(action.props.accessibilityHint).toBe("Opens the format dialog")
    fireEvent.press(action)
    expect(onPress).toHaveBeenCalled()
  })

  it("takes the text colour unless told otherwise, and recedes to textDisabled when disabled", () => {
    const plain = render(<HeaderAction icon={Upload} label="Export" onPress={() => {}} />)
    expect(plain.getByTestId("glyph").props.color).toBe(lightColors.text)

    const danger = render(<HeaderAction icon={Upload} label="Delete" color={lightColors.error} onPress={() => {}} />)
    expect(danger.getByTestId("glyph").props.color).toBe(lightColors.error)

    const off = render(
      <HeaderAction icon={Upload} label="Delete" color={lightColors.error} disabled onPress={() => {}} />
    )
    expect(off.getByTestId("glyph").props.color).toBe(lightColors.textDisabled)
    expect(off.getByLabelText("Delete").props.accessibilityState).toEqual({ disabled: true })
    expect(off.getByLabelText("Delete").props.android_ripple).toBeUndefined()
  })
})
