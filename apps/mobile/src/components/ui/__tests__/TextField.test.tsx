import React from "react"
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from "react-native"
import { render, fireEvent } from "@testing-library/react-native"
import { lightColors, radius } from "@colota/shared"
import { TextField } from "../TextField"
import { size } from "../../../constants"
import { text } from "../../../styles/typography"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ mode: "light", colors: require("@colota/shared").lightColors })
}))

type Styled = { props: { style?: StyleProp<ViewStyle & TextStyle> } }

const styleOf = (element?: Styled | null): ViewStyle & TextStyle => StyleSheet.flatten(element?.props.style) ?? {}

// The stroke sits on the field row that wraps the input, and react-test-renderer puts
// composite nodes in between, so walk up to the first node that actually draws a border.
const fieldOf = (input: { parent: unknown }): Styled => {
  let node = (input as { parent: any }).parent
  while (node && styleOf(node).borderWidth === undefined) node = node.parent
  return node as Styled
}

const rowOf = (input: { parent: unknown }): Styled => {
  let node = (input as { parent: any }).parent
  while (node && styleOf(node).minHeight === undefined) node = node.parent
  return node as Styled
}

describe("TextField", () => {
  // The stroke is the whole state model of a field: outline at rest, primary while it
  // has the caret, error when the value was refused. Nothing else changes width.
  it("draws a hairline outline at rest", () => {
    const { getByTestId } = render(
      <TextField testID="endpoint" label="Server endpoint" value="" onChangeText={jest.fn()} />
    )

    const field = styleOf(fieldOf(getByTestId("endpoint")))
    expect(field.borderColor).toBe(lightColors.outline)
    expect(field.borderWidth).toBe(1)
    expect(field.borderRadius).toBe(radius.sm)
    expect(styleOf(rowOf(getByTestId("endpoint"))).minHeight).toBe(size.touch)
  })

  it("thickens to the primary stroke while focused and drops back on blur", () => {
    const { getByTestId } = render(
      <TextField testID="endpoint" label="Server endpoint" value="" onChangeText={jest.fn()} />
    )

    fireEvent(getByTestId("endpoint"), "focus")
    expect(styleOf(fieldOf(getByTestId("endpoint")))).toEqual(
      expect.objectContaining({ borderColor: lightColors.primary, borderWidth: 2 })
    )

    fireEvent(getByTestId("endpoint"), "blur")
    expect(styleOf(fieldOf(getByTestId("endpoint")))).toEqual(
      expect.objectContaining({ borderColor: lightColors.outline, borderWidth: 1 })
    )
  })

  // An invalid value has to be visible without colour vision and audible without sight,
  // so the stroke is joined by a glyph and a message on a live region.
  it("carries the error stroke, the alert glyph and the message together", () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <TextField
        testID="endpoint"
        label="Server endpoint"
        value="nope"
        error="Must start with https"
        onChangeText={jest.fn()}
      />
    )

    expect(styleOf(fieldOf(getByTestId("endpoint")))).toEqual(
      expect.objectContaining({ borderColor: lightColors.error, borderWidth: 2 })
    )
    expect(queryByTestId("icon-CircleAlert")).toBeTruthy()
    expect(getByText("Must start with https").props.accessibilityRole).toBe("alert")
  })

  it("renders a hint instead of a message when the value is valid", () => {
    const { getByText, queryByTestId } = render(
      <TextField
        testID="endpoint"
        label="Server endpoint"
        value="ok"
        hint="Where points are sent"
        onChangeText={jest.fn()}
      />
    )

    expect(getByText("Where points are sent")).toBeTruthy()
    expect(queryByTestId("icon-CircleAlert")).toBeNull()
  })

  // A URL or a header value read in the proportional face hides the difference between
  // l, 1 and I, which is the whole reason the endpoint fields exist.
  it("sets the monospace role for the mono variant", () => {
    const { getByTestId } = render(
      <TextField testID="endpoint" label="Endpoint" mono value="" onChangeText={jest.fn()} />
    )

    expect(styleOf(getByTestId("endpoint")).fontFamily).toBe(text.mono.fontFamily)
  })

  it("shortens the field for a filter bar in the compact variant", () => {
    const { getByTestId } = render(
      <TextField testID="search" accessibilityLabel="Search" compact value="" onChangeText={jest.fn()} />
    )

    expect(styleOf(rowOf(getByTestId("search"))).minHeight).toBeLessThan(size.touch)
  })

  // Voice Access resolves an icon-only control by its visible words, and there are none
  // in a trailing eye or clear button, so it takes its own label.
  it("gives the trailing action its own labelled 48 target", () => {
    const onPress = jest.fn()
    const Eye = () => null
    const { getByRole } = render(
      <TextField
        testID="password"
        label="Password"
        value="hunter2"
        onChangeText={jest.fn()}
        trailing={{ icon: Eye, onPress, accessibilityLabel: "Show password", testID: "reveal" }}
      />
    )

    const action = getByRole("button", { name: "Show password" })
    expect(styleOf(action)).toEqual(expect.objectContaining({ width: size.touch, height: size.touch }))

    fireEvent.press(action)
    expect(onPress).toHaveBeenCalled()
  })

  // Autofill only reaches a field when the props reach the TextInput, and the Basic auth
  // fields are the reason the props spread instead of being re-declared one by one.
  it("spreads TextInput props through to the input", () => {
    const { getByTestId } = render(
      <TextField
        testID="username"
        label="Username"
        value=""
        onChangeText={jest.fn()}
        autoComplete="username"
        importantForAutofill="yes"
        keyboardType="email-address"
      />
    )

    const input = getByTestId("username")
    expect(input.props.autoComplete).toBe("username")
    expect(input.props.importantForAutofill).toBe("yes")
    expect(input.props.keyboardType).toBe("email-address")
  })

  it("names the input from its label", () => {
    const { getByLabelText } = render(
      <TextField testID="endpoint" label="Server endpoint" value="" onChangeText={jest.fn()} />
    )

    expect(getByLabelText("Server endpoint")).toBeTruthy()
  })
})
