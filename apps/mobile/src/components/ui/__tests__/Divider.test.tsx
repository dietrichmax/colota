import React from "react"
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native"
import { render } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"
import { Divider } from "../Divider"
import { size, space } from "../../../constants"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

type StyledElement = { props: { style?: StyleProp<ViewStyle> } }

const styleOf = (element?: StyledElement | null): ViewStyle => StyleSheet.flatten(element?.props.style) ?? {}

describe("Divider", () => {
  it("is a hairline in the line colour, so it separates without drawing a box", () => {
    const { getByTestId } = render(<Divider testID="rule" />)

    const style = styleOf(getByTestId("rule"))
    expect(style.height).toBe(StyleSheet.hairlineWidth)
    expect(style.backgroundColor).toBe(lightColors.border)
  })

  it("keeps its 16 margin by default, because the screens that space rows with it have not migrated", () => {
    const { getByTestId } = render(<Divider testID="rule" />)

    expect(styleOf(getByTestId("rule")).marginVertical).toBe(space.lg)
  })

  it("drops the margin when tight, so a hairline can sit flush between two rows", () => {
    const { getByTestId } = render(<Divider testID="rule" tight />)

    expect(styleOf(getByTestId("rule")).marginVertical).toBe(0)
  })

  it("starts at the inset it is given, so the rule begins at the text column and never at the panel edge", () => {
    const { getByTestId } = render(<Divider testID="rule" inset={size.iconColumn} />)

    expect(styleOf(getByTestId("rule")).marginStart).toBe(size.iconColumn)
  })

  it("runs full width when no inset is given", () => {
    const { getByTestId } = render(<Divider testID="rule" />)

    expect(styleOf(getByTestId("rule")).marginStart).toBe(0)
  })
})
