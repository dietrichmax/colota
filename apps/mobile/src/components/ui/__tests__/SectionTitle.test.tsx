import React from "react"
import { StyleSheet, processColor, type StyleProp, type TextStyle, type ViewStyle } from "react-native"
import { render, fireEvent } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"
import { SectionTitle } from "../SectionTitle"
import { size, space, STATE_LAYER_ALPHA } from "../../../constants"
import { text } from "../../../styles/typography"

// The app ships Android only, but the jest preset resolves Platform to iOS,
// where Pressable drops android_ripple before it reaches the host view.
jest.mock("react-native/Libraries/Utilities/Platform", () => ({
  __esModule: true,
  default: { OS: "android", select: (spec: Record<string, unknown>) => spec.android ?? spec.default }
}))

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

type StyledElement = { props: { style?: StyleProp<ViewStyle & TextStyle> } }

const styleOf = (element?: StyledElement | null): ViewStyle & TextStyle =>
  StyleSheet.flatten(element?.props.style) ?? {}

describe("SectionTitle", () => {
  it("is a header, so TalkBack can jump from group to group instead of reading every row", () => {
    const { getByText } = render(<SectionTitle>Export range</SectionTitle>)

    expect(getByText("Export range").props.accessibilityRole).toBe("header")
  })

  it("does not shout: the heading role carries the emphasis, not a caps transform", () => {
    const { getByText } = render(<SectionTitle>Export range</SectionTitle>)

    const style = styleOf(getByText("Export range"))
    expect(style.textTransform).toBeUndefined()
    expect(style.fontSize).toBe(text.heading.fontSize)
    expect(style.color).toBe(lightColors.text)
  })

  it("opens a gap above itself, because whitespace is what groups the rows below", () => {
    const { getByTestId } = render(<SectionTitle testID="title">Export range</SectionTitle>)

    expect(styleOf(getByTestId("title")).marginTop).toBe(space.xxl)
    expect(styleOf(getByTestId("title")).marginBottom).toBe(space.sm)
  })

  it("drops the top margin when it is first, so a screen does not open on empty space", () => {
    const { getByTestId } = render(
      <SectionTitle testID="title" first>
        Export range
      </SectionTitle>
    )

    expect(styleOf(getByTestId("title")).marginTop).toBe(0)
  })

  it("fires its action and announces it by its visible words", () => {
    const onPress = jest.fn()
    const { getByTestId } = render(
      <SectionTitle action={{ label: "Clear", onPress, testID: "clear-btn" }}>Entries</SectionTitle>
    )

    const action = getByTestId("clear-btn")
    expect(action.props.accessibilityLabel).toBe("Clear")
    expect(action.props.accessibilityRole).toBe("button")

    fireEvent.press(action)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("gives the action a full touch target and its own state layer, not the heading's", () => {
    const { getByTestId } = render(
      <SectionTitle action={{ label: "Clear", onPress: jest.fn(), testID: "clear-btn" }}>Entries</SectionTitle>
    )

    const action = getByTestId("clear-btn")
    expect(styleOf(action).minHeight).toBe(size.touch)
    expect(action.props.nativeBackgroundAndroid).toEqual(
      expect.objectContaining({ color: processColor(lightColors.primaryDark + STATE_LAYER_ALPHA) })
    )
  })

  // The Dashboard's fix time sits beside the heading and is not an action: it must not be
  // announced or targetable as a button.
  it("puts a caption at the end of the heading row without making it pressable", () => {
    const { getByText, queryByRole } = render(<SectionTitle caption="12:55">Now</SectionTitle>)

    expect(getByText("12:55")).toBeTruthy()
    expect(queryByRole("button")).toBeNull()
  })

  it("lets the action win the end of the row when both are given", () => {
    const { queryByText, getByText } = render(
      <SectionTitle caption="12:55" action={{ label: "Clear", onPress: jest.fn() }}>
        Now
      </SectionTitle>
    )

    expect(getByText("Clear")).toBeTruthy()
    expect(queryByText("12:55")).toBeNull()
  })

  it("renders no action slot when none is given", () => {
    const { queryByRole } = render(<SectionTitle>Entries</SectionTitle>)

    expect(queryByRole("button")).toBeNull()
  })
})
