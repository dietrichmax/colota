import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { StyleSheet } from "react-native"
import { lightColors } from "@colota/shared"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { TextField } from "../TextField"

const flat = (el: any) => StyleSheet.flatten(el.props.style)

describe("TextField", () => {
  it("keeps the text a constant distance from the edge as the border grows", () => {
    // Focus takes the border from 1 to 2. Without the matching padding drop the caret and
    // every character shift a pixel sideways the moment you tap in.
    const { getByTestId } = render(<TextField label="Server address" testID="server-input" />)

    const rest = flat(getByTestId("server-input-box"))
    expect(rest.borderWidth + rest.paddingHorizontal).toBe(15)

    fireEvent(getByTestId("server-input"), "focus")
    const focused = flat(getByTestId("server-input-box"))
    expect(focused.borderWidth).toBe(2)
    expect(focused.borderWidth + focused.paddingHorizontal).toBe(15)
  })

  it("paints the focus ring in primary and the error ring in error", () => {
    const { getByTestId, rerender } = render(<TextField label="Server address" testID="server-input" />)
    expect(flat(getByTestId("server-input-box")).borderColor).toBe(lightColors.border)

    fireEvent(getByTestId("server-input"), "focus")
    expect(flat(getByTestId("server-input-box")).borderColor).toBe(lightColors.primary)

    rerender(<TextField label="Server address" testID="server-input" error="Public hosts need https" />)
    expect(flat(getByTestId("server-input-box")).borderColor).toBe(lightColors.error)
  })

  it("reads the error out with the field name, because the ring alone is colour", () => {
    const { getByTestId, getByText } = render(
      <TextField label="Password" testID="pw-input" error="At least 8 characters" />
    )

    expect(getByTestId("pw-input").props.accessibilityLabel).toBe("Password, At least 8 characters")
    expect(getByText("At least 8 characters")).toBeTruthy()
  })

  it("stops taking input and drops its ink when disabled", () => {
    const { getByTestId } = render(<TextField label="Server address" testID="server-input" disabled />)

    const input = getByTestId("server-input")
    expect(input.props.editable).toBe(false)
    expect(flat(input).color).toBe(lightColors.textDisabled)
    expect(flat(getByTestId("server-input-box")).borderColor).toBe(lightColors.border)
  })

  it("passes keyboard and autofill props through to the input", () => {
    // The union type lets a field skip the visible label only when a row already names it.
    const { getByTestId } = render(
      <TextField accessibilityLabel="Port" testID="port-input" keyboardType="numeric" autoComplete="off" />
    )

    const input = getByTestId("port-input")
    expect(input.props.keyboardType).toBe("numeric")
    expect(input.props.autoComplete).toBe("off")
    expect(input.props.accessibilityLabel).toBe("Port")
  })

  it("reveals a secure field only while the eye is held", () => {
    // Hold, not toggle: the password cannot be left on screen by a stray tap.
    const { getByTestId } = render(<TextField label="Password" testID="pw-input" secure />)

    expect(getByTestId("pw-input").props.secureTextEntry).toBe(true)
    fireEvent(getByTestId("pw-input-reveal"), "pressIn")
    expect(getByTestId("pw-input").props.secureTextEntry).toBe(false)
    fireEvent(getByTestId("pw-input-reveal"), "pressOut")
    expect(getByTestId("pw-input").props.secureTextEntry).toBe(true)
  })

  it("lifts the label to primary on focus, so the field you are in is named", () => {
    const { getByTestId, getByText } = render(<TextField label="Server address" testID="server-input" />)
    expect(flat(getByText("Server address")).color).toBe(lightColors.textSecondary)

    fireEvent(getByTestId("server-input"), "focus")
    expect(flat(getByText("Server address")).color).toBe(lightColors.primary)
  })

  it("sets an endpoint in monospace so a typo in a URL is findable", () => {
    const { getByTestId } = render(<TextField label="Server address" testID="server-input" mono />)
    expect(flat(getByTestId("server-input")).fontFamily).toBe("monospace")
  })

  it("keeps the recessed fill, so a field on a card still reads as a field", () => {
    const { getByTestId } = render(<TextField label="Server address" testID="server-input" />)
    expect(flat(getByTestId("server-input-box")).backgroundColor).toBe(lightColors.background)
  })
})
