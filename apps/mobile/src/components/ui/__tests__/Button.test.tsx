import React from "react"
import { StyleSheet, processColor, type StyleProp, type TextStyle, type ViewStyle } from "react-native"
import { render, fireEvent } from "@testing-library/react-native"
import { lightColors, radius } from "@colota/shared"
import { Button } from "../Button"
import { size, STATE_LAYER_ALPHA } from "../../../constants"

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

describe("Button", () => {
  // Every variant is a fill and an ink from the palette, never a literal: a hardcoded
  // white on the danger button is unreadable the moment the dark palette inverts it.
  it.each([
    ["primary", lightColors.primary, lightColors.textOnPrimary],
    ["secondary", lightColors.primaryContainer, lightColors.onPrimaryContainer],
    ["ghost", "transparent", lightColors.primaryDark],
    ["danger", lightColors.error, lightColors.textOnPrimary],
    ["dangerGhost", "transparent", lightColors.error]
  ] as const)("paints %s from the palette", (variant, fill, ink) => {
    const { getByTestId, getByText } = render(<Button testID="btn" title="Go" variant={variant} onPress={jest.fn()} />)

    expect(styleOf(getByTestId("btn")).backgroundColor).toBe(fill)
    expect(styleOf(getByText("Go")).color).toBe(ink)
  })

  // A disabled control reads as a surface, not as a faded version of its live self,
  // so it cannot be mistaken for a button waiting to be pressed.
  it("falls back to the well and disabled ink when disabled", () => {
    const { getByTestId, getByText } = render(<Button testID="btn" title="Go" disabled onPress={jest.fn()} />)

    expect(styleOf(getByTestId("btn")).backgroundColor).toBe(lightColors.well)
    expect(styleOf(getByText("Go")).color).toBe(lightColors.textDisabled)
    expect(getByTestId("btn").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }))
  })

  it("keeps a ghost transparent when disabled and only drops its ink", () => {
    const { getByTestId, getByText } = render(
      <Button testID="btn" title="Go" variant="ghost" disabled onPress={jest.fn()} />
    )

    expect(styleOf(getByTestId("btn")).backgroundColor).toBe("transparent")
    expect(styleOf(getByText("Go")).color).toBe(lightColors.textDisabled)
  })

  it("stops responding while loading and keeps the label beside the spinner", () => {
    const onPress = jest.fn()
    const { getByTestId, getByText } = render(<Button testID="btn" title="Saving" loading onPress={onPress} />)

    fireEvent.press(getByTestId("btn"))

    expect(onPress).not.toHaveBeenCalled()
    expect(getByText("Saving")).toBeTruthy()
    expect(getByTestId("btn").props.accessibilityState).toEqual(expect.objectContaining({ busy: true }))
  })

  // Android draws the shadow from the node that carries the elevation. Splitting the
  // two put a radius-28 shadow under a radius-8 fill on the dashboard control.
  it("puts the pill radius and the elevation on the node that paints the fill", () => {
    const { getByTestId } = render(<Button testID="btn" title="Start" shape="pill" elevation={4} onPress={jest.fn()} />)

    const fill = styleOf(getByTestId("btn"))
    expect(fill.backgroundColor).toBe(lightColors.primary)
    expect(fill.borderRadius).toBe(radius.pill)
    expect(fill.elevation).toBe(4)
  })

  it("uses the small radius and no elevation by default", () => {
    const { getByTestId } = render(<Button testID="btn" title="Go" onPress={jest.fn()} />)

    expect(styleOf(getByTestId("btn")).borderRadius).toBe(radius.sm)
    expect(styleOf(getByTestId("btn")).elevation).toBeUndefined()
  })

  // Stacked callers relied on a baked margin to space themselves. Spacing belongs to
  // the caller, so a button dropped into a row does not push its neighbours apart.
  it("bakes no margin and holds the touch target", () => {
    const { getByTestId } = render(<Button testID="btn" title="Go" onPress={jest.fn()} />)

    const style = styleOf(getByTestId("btn"))
    expect(style.marginVertical).toBeUndefined()
    expect(style.marginTop).toBeUndefined()
    expect(style.minHeight).toBe(size.touch)
  })

  it("ripples in its own content colour at the state-layer opacity", () => {
    const { getByTestId } = render(<Button testID="btn" title="Go" onPress={jest.fn()} />)

    expect(getByTestId("btn").props.nativeBackgroundAndroid).toEqual(
      expect.objectContaining({ color: processColor(lightColors.textOnPrimary + STATE_LAYER_ALPHA), borderless: false })
    )
  })

  it("carries the button role and names itself from its title", () => {
    const { getByRole } = render(<Button testID="btn" title="Export log" onPress={jest.fn()} />)

    expect(getByRole("button", { name: "Export log" })).toBeTruthy()
  })
})
