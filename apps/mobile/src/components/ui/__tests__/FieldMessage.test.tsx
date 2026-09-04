import React from "react"
import { render } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"
import { FieldMessage } from "../FieldMessage"

const mockColors = lightColors

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: mockColors })
}))

describe("FieldMessage", () => {
  it("renders its children", () => {
    const { getByText } = render(<FieldMessage>Hello</FieldMessage>)
    expect(getByText("Hello")).toBeTruthy()
  })

  it("uses textSecondary color for default info variant", () => {
    const { getByText } = render(<FieldMessage>Info text</FieldMessage>)
    const node = getByText("Info text")
    expect(node.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: mockColors.textSecondary })])
    )
  })

  it("uses warning color for warning variant", () => {
    const { getByText } = render(<FieldMessage variant="warning">Warn</FieldMessage>)
    const node = getByText("Warn")
    expect(node.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: mockColors.warning })]))
  })

  it("uses error color for error variant", () => {
    const { getByText } = render(<FieldMessage variant="error">Bad</FieldMessage>)
    const node = getByText("Bad")
    expect(node.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: mockColors.error })]))
  })

  // An invalid field is announced without moving focus, so the user hears why the save
  // was refused while still typing in the field that caused it.
  it("announces the error variant as an alert on a polite live region", () => {
    const { getByText } = render(<FieldMessage variant="error">Bad</FieldMessage>)
    const node = getByText("Bad")
    expect(node.props.accessibilityRole).toBe("alert")
    expect(node.props["aria-live"] ?? node.props.accessibilityLiveRegion).toBe("polite")
  })

  it("leaves the info variant off the live region so hints do not interrupt", () => {
    const { getByText } = render(<FieldMessage>Info text</FieldMessage>)
    const node = getByText("Info text")
    expect(node.props.accessibilityRole).toBeUndefined()
    expect(node.props["aria-live"] ?? node.props.accessibilityLiveRegion).toBe("none")
  })
})
