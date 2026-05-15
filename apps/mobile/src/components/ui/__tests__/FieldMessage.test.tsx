import React from "react"
import { render } from "@testing-library/react-native"
import { FieldMessage } from "../FieldMessage"

const mockColors = {
  textSecondary: "#6b7280",
  warning: "#f59e0b",
  error: "#ef4444"
} as any

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

  it("falls back to error color when theme has no warning color", () => {
    jest.resetModules()
    jest.doMock("../../../hooks/useTheme", () => ({
      useTheme: () => ({ colors: { ...mockColors, warning: undefined } })
    }))
    const Fresh = require("../FieldMessage").FieldMessage
    const { getByText } = render(<Fresh variant="warning">Warn</Fresh>)
    const node = getByText("Warn")
    expect(node.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: mockColors.error })]))
  })
})
