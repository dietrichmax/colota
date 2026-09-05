import React from "react"
import { Text, StyleSheet, processColor, type StyleProp, type ViewStyle } from "react-native"
import { render, fireEvent } from "@testing-library/react-native"
import { darkColors, lightColors, radius } from "@colota/shared"
import { Card } from "../Card"
import { elevation, STATE_LAYER_ALPHA } from "../../../constants"

// The app ships Android only, but the jest preset resolves Platform to iOS,
// where Pressable drops android_ripple before it reaches the host view.
jest.mock("react-native/Libraries/Utilities/Platform", () => ({
  __esModule: true,
  default: { OS: "android", select: (spec: Record<string, unknown>) => spec.android ?? spec.default }
}))

let mockMode: "light" | "dark" = "light"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    mode: mockMode,
    colors: mockMode === "dark" ? require("@colota/shared").darkColors : require("@colota/shared").lightColors
  })
}))

type StyledElement = { props: { style?: StyleProp<ViewStyle> } }

const surfaceOf = (element?: StyledElement | null): ViewStyle => StyleSheet.flatten(element?.props.style) ?? {}

describe("Card", () => {
  beforeEach(() => {
    mockMode = "light"
  })

  it("draws the sheet without a stroke or a radius, because it meets the map flush", () => {
    const { getByTestId } = render(
      <Card testID="card" variant="sheet">
        <Text>Body</Text>
      </Card>
    )

    const surface = surfaceOf(getByTestId("card"))
    expect(surface.borderWidth).toBeUndefined()
    expect(surface.borderRadius).toBe(0)
    expect(surface.backgroundColor).toBe(lightColors.card)
  })

  it("floats on the elevated surface with a shadow in light", () => {
    const { getByTestId } = render(
      <Card testID="card" variant="floating">
        <Text>Body</Text>
      </Card>
    )

    const surface = surfaceOf(getByTestId("card"))
    expect(surface.borderWidth).toBeUndefined()
    expect(surface.borderRadius).toBe(radius.lg)
    expect(surface.backgroundColor).toBe(lightColors.cardElevated)
    expect(surface.elevation).toBe(elevation.floating)
  })

  it("drops the floating shadow in dark, where the tonal step alone says the surface is above", () => {
    mockMode = "dark"
    const { getByTestId } = render(
      <Card testID="card" variant="floating">
        <Text>Body</Text>
      </Card>
    )

    const surface = surfaceOf(getByTestId("card"))
    expect(surface.backgroundColor).toBe(darkColors.cardElevated)
    expect(surface.elevation).toBe(0)
  })

  it("keeps the default variant bordered, because dropping the stroke here strips it from every unmigrated screen", () => {
    const { getByTestId } = render(
      <Card testID="card">
        <Text>Body</Text>
      </Card>
    )

    const surface = surfaceOf(getByTestId("card"))
    expect(surface.borderWidth).toBe(1)
    expect(surface.borderColor).toBe(lightColors.border)
  })

  it("takes an onPress on any variant, so the interactive alias keeps its pressable without keeping its box", () => {
    const onPress = jest.fn()
    const { getByTestId } = render(
      <Card testID="card" variant="interactive" onPress={onPress} accessibilityLabel="Trip 1">
        <Text>Body</Text>
      </Card>
    )

    fireEvent.press(getByTestId("card"))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("has no tone: the danger alias paints the plain sheet, because a coloured box is a Notice", () => {
    const { getByTestId } = render(
      <Card testID="card" variant="danger">
        <Text>Body</Text>
      </Card>
    )

    const surface = surfaceOf(getByTestId("card"))
    expect(surface.backgroundColor).toBe(lightColors.card)
    expect(surface.borderWidth).toBeUndefined()
    expect(surface.borderColor).toBeUndefined()
  })

  it("presses through a state layer of its own ink rather than fading the whole surface", () => {
    const onPress = jest.fn()
    const { getByTestId } = render(
      <Card testID="card" variant="sheet" onPress={onPress} accessibilityRole="button" accessibilityLabel="Open trip">
        <Text>Body</Text>
      </Card>
    )

    const pressable = getByTestId("card")
    expect(pressable.props.nativeBackgroundAndroid).toEqual(
      expect.objectContaining({ color: processColor(lightColors.text + STATE_LAYER_ALPHA), borderless: false })
    )

    fireEvent.press(pressable)
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
