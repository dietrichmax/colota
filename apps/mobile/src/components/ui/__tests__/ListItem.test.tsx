import React from "react"
import { Pressable, StyleSheet, Text, processColor, type StyleProp, type TextStyle, type ViewStyle } from "react-native"
import { render, fireEvent } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"
import { Bell } from "lucide-react-native"
import { ListItem } from "../ListItem"
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

describe("ListItem", () => {
  it("reads label, sub line and value as one node, because labelling from the label alone loses the sub line", () => {
    const { getByTestId } = render(
      <ListItem testID="row" label="Auto-Export" sub="Every day at 03:00" value="12" onPress={jest.fn()} />
    )

    expect(getByTestId("row").props.accessibilityLabel).toBe("Auto-Export, Every day at 03:00, 12")
  })

  it("keeps the trailing value out of the reading, so it is not announced twice", () => {
    const { getByText } = render(<ListItem label="Interval" value="30 s" />)

    const value = getByText("30 s")
    expect(value.props.importantForAccessibility).toBe("no")
    expect(styleOf(value).fontSize).toBe(text.figureInline.fontSize)
  })

  it("leaves a trailing control reachable, because a row that groups it would hide the switch from TalkBack", () => {
    const onToggle = jest.fn()
    const { getByTestId, getByLabelText } = render(
      <ListItem
        label="Dark mode"
        sub="Follow the system theme"
        trailing={<Pressable testID="dark-mode-toggle" onPress={onToggle} />}
      />
    )

    expect(getByLabelText("Dark mode, Follow the system theme")).toBeTruthy()

    fireEvent.press(getByTestId("dark-mode-toggle"))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it("shows the chevron only when the row goes somewhere", () => {
    const { queryByTestId, rerender } = render(<ListItem label="Interval" value="30 s" />)
    expect(queryByTestId("icon-ChevronRight")).toBeNull()

    rerender(<ListItem label="Connection" onPress={jest.fn()} />)
    expect(queryByTestId("icon-ChevronRight")).toBeTruthy()
  })

  it("presses through a bounded state layer of its own ink, not an opacity fade of the whole row", () => {
    const onPress = jest.fn()
    const { getByTestId } = render(<ListItem testID="row" label="Connection" onPress={onPress} />)

    const row = getByTestId("row")
    expect(row.props.nativeBackgroundAndroid).toEqual(
      expect.objectContaining({ color: processColor(lightColors.text + STATE_LAYER_ALPHA), borderless: false })
    )

    fireEvent.press(row)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("gives the row a full touch target", () => {
    const { getByTestId } = render(<ListItem testID="row" label="Connection" onPress={jest.fn()} />)

    const style = styleOf(getByTestId("row"))
    expect(style.minHeight).toBe(size.row)
    expect(style.paddingVertical).toBe(space.md)
  })

  it("starts the hairline at the text column, so the rule never closes a shape around the group", () => {
    const { UNSAFE_getByProps } = render(
      <ListItem testID="row" icon={Bell} label="Notifications" divider onPress={jest.fn()} />
    )

    expect(UNSAFE_getByProps({ tight: true }).props.inset).toBe(size.iconColumn)
  })

  it("runs the hairline to the row edge when there is no icon column to align to", () => {
    const { UNSAFE_getByProps } = render(<ListItem label="Offline mode" divider trailing={<Text>Off</Text>} />)

    expect(UNSAFE_getByProps({ tight: true }).props.inset).toBe(0)
  })

  // A status dot belongs to the label line, not the icon column: the row's text keeps the
  // screen's own left edge, and the dot never reaches the reading twice.
  it("puts a dot inline before the label and leaves it out of the reading", () => {
    const { getByTestId } = render(<ListItem testID="row" dot={lightColors.success} label="example.com" />)

    const dots = getByTestId("row").findAll(
      (node) =>
        node.props.importantForAccessibility === "no" &&
        StyleSheet.flatten(node.props.style)?.backgroundColor === lightColors.success
    )
    expect(dots.length).toBeGreaterThan(0)
  })

  it("hides the leading icon from the reading, because it repeats what the label already says", () => {
    const { getByTestId } = render(<ListItem icon={Bell} label="Notifications" onPress={jest.fn()} />)

    const icon = getByTestId("icon-Bell")
    expect(icon.props.color).toBe(lightColors.textSecondary)
    expect(icon.props.size).toBe(size.icon.md)
    const column = icon.parent?.parent
    expect(column?.props.importantForAccessibility).toBe("no")
    expect(styleOf(column).width).toBe(size.iconColumn)
  })
})
