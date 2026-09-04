import React from "react"
import { StyleSheet, processColor, type StyleProp, type TextStyle, type ViewStyle } from "react-native"
import { render, fireEvent } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"
import { RadioRow } from "../RadioRow"
import { size, STATE_LAYER_ALPHA } from "../../../constants"
import { fonts } from "../../../styles/typography"

// The app ships Android only, but the jest preset resolves Platform to iOS,
// where Pressable drops android_ripple before it reaches the host view.
jest.mock("react-native/Libraries/Utilities/Platform", () => ({
  __esModule: true,
  default: { OS: "android", select: (spec: Record<string, unknown>) => spec.android ?? spec.default }
}))

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ mode: "light", colors: require("@colota/shared").lightColors })
}))

type Styled = { props: { style?: StyleProp<ViewStyle & TextStyle> } }

const styleOf = (element?: Styled | null): ViewStyle & TextStyle => StyleSheet.flatten(element?.props.style) ?? {}

describe("RadioRow", () => {
  // The dot is 20 dp of decoration. Pressing anywhere in the row has to select the
  // option, so the row itself is the radio and the dot is hidden from the tree.
  it("makes the whole row the radio and leaves the dot as decoration", () => {
    const onPress = jest.fn()
    const { getByTestId } = render(<RadioRow testID="preset-balanced" label="Balanced" selected onPress={onPress} />)

    const row = getByTestId("preset-balanced")
    expect(row.props.accessibilityRole).toBe("radio")
    expect(styleOf(row).minHeight).toBe(size.row)

    fireEvent.press(row)
    expect(onPress).toHaveBeenCalled()
  })

  it("reports its checked state so TalkBack announces selected or not selected", () => {
    const { getByTestId, rerender } = render(<RadioRow testID="row" label="Balanced" selected onPress={jest.fn()} />)
    expect(getByTestId("row").props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true, disabled: false })
    )

    rerender(<RadioRow testID="row" label="Balanced" selected={false} onPress={jest.fn()} />)
    expect(getByTestId("row").props.accessibilityState).toEqual(expect.objectContaining({ checked: false }))
  })

  // Selection carries a weight step beside the filled dot, so the state survives a
  // greyscale screenshot and a user who cannot tell the ring colours apart.
  it("steps the label weight up when selected", () => {
    const { getByText, rerender } = render(<RadioRow label="Balanced" selected onPress={jest.fn()} />)
    expect(styleOf(getByText("Balanced")).fontFamily).toBe(fonts.semiBold.fontFamily)

    rerender(<RadioRow label="Balanced" selected={false} onPress={jest.fn()} />)
    expect(styleOf(getByText("Balanced")).fontFamily).not.toBe(fonts.semiBold.fontFamily)
  })

  // TalkBack reads one name per node: the caption and the description belong to the
  // row's own label or they are announced as separate unlabelled fragments.
  it("composes the caption and description into the row's accessible name", () => {
    const { getByRole } = render(
      <RadioRow label="GeoJSON" caption="Geographic Data" description="Best for backups" selected onPress={jest.fn()} />
    )

    expect(getByRole("radio", { name: "GeoJSON, Geographic Data, Best for backups" })).toBeTruthy()
  })

  it("does not fire while disabled and says so in its state", () => {
    const onPress = jest.fn()
    const { getByTestId } = render(
      <RadioRow testID="row" label="Balanced" selected={false} disabled onPress={onPress} />
    )

    fireEvent.press(getByTestId("row"))

    expect(onPress).not.toHaveBeenCalled()
    expect(getByTestId("row").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }))
  })

  it("presses through the state layer rather than fading the row", () => {
    const { getByTestId } = render(<RadioRow testID="row" label="Balanced" selected onPress={jest.fn()} />)

    expect(getByTestId("row").props.nativeBackgroundAndroid).toEqual(
      expect.objectContaining({ color: processColor(lightColors.text + STATE_LAYER_ALPHA), borderless: false })
    )
  })
})
