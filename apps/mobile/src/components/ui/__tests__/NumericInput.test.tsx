import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"

const mockColors = lightColors

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: mockColors, mode: "light" })
}))

const mockFontScale = { value: 1 }
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 400, height: 800, scale: 2, fontScale: mockFontScale.value })
}))

import { NumericInput } from "../NumericInput"

describe("NumericInput", () => {
  const mockOnChange = jest.fn()
  const mockOnBlur = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockFontScale.value = 1
  })

  function renderInput(overrides: Partial<React.ComponentProps<typeof NumericInput>> = {}) {
    return render(
      <NumericInput
        label="Test Label"
        value="10"
        onChange={mockOnChange}
        onBlur={mockOnBlur}
        unit="seconds"
        {...overrides}
      />
    )
  }

  it("renders label, value, and unit", () => {
    const { getByText, getByDisplayValue } = renderInput()

    expect(getByText("Test Label")).toBeTruthy()
    expect(getByDisplayValue("10")).toBeTruthy()
    expect(getByText("seconds")).toBeTruthy()
  })

  it("renders hint when provided", () => {
    const { getByText } = renderInput({ hint: "Enter a number" })

    expect(getByText("Enter a number")).toBeTruthy()
  })

  it("does not render hint when not provided", () => {
    const { queryByText } = renderInput()

    expect(queryByText("Enter a number")).toBeNull()
  })

  it("calls onChange when text changes", () => {
    const { getByDisplayValue } = renderInput()

    fireEvent.changeText(getByDisplayValue("10"), "25")

    expect(mockOnChange).toHaveBeenCalledWith("25")
  })

  it("calls onBlur when input loses focus", () => {
    const { getByDisplayValue } = renderInput()

    fireEvent(getByDisplayValue("10"), "blur")

    expect(mockOnBlur).toHaveBeenCalled()
  })

  it("uses numeric keyboard type", () => {
    const { getByDisplayValue } = renderInput()

    expect(getByDisplayValue("10").props.keyboardType).toBe("numeric")
  })

  it("displays placeholder text", () => {
    const { getByPlaceholderText } = renderInput({ value: "", placeholder: "50" })

    expect(getByPlaceholderText("50")).toBeTruthy()
  })

  it("renders different units correctly", () => {
    const { getByText } = renderInput({ unit: "meters" })

    expect(getByText("meters")).toBeTruthy()
  })

  // The row label is the field's only name once it sits beside the label instead of
  // under it, and the unit is the hint because the digits alone do not say seconds.
  it("names the field from the row label and hints with the unit", () => {
    const { getByDisplayValue } = renderInput()
    const input = getByDisplayValue("10")

    expect(input.props.accessibilityLabel).toBe("Test Label")
    expect(input.props.accessibilityHint).toBe("seconds")
  })

  // 72 dp holds four digits at 1.0x. Past 1.3x the digits outgrow it, so the field
  // has to size to its content or the value clips inside a fixed box.
  it("pins the field to 72 at normal font scale and lets it grow above 1.3x", () => {
    const fixed = renderInput()
    expect(widths(fixed.toJSON())).toContainEqual({ width: 72 })

    mockFontScale.value = 1.5
    const scaled = renderInput()
    expect(widths(scaled.toJSON())).toContainEqual({ minWidth: 72 })
    expect(widths(scaled.toJSON())).not.toContainEqual({ width: 72 })
  })
})

function widths(node: unknown): { width?: number; minWidth?: number }[] {
  const found: { width?: number; minWidth?: number }[] = []
  const walk = (current: any) => {
    if (!current || typeof current !== "object") return
    if (Array.isArray(current)) return current.forEach(walk)
    const style = current.props?.style
    for (const entry of [style].flat(3)) {
      if (entry && typeof entry === "object" && ("width" in entry || "minWidth" in entry)) found.push(entry)
    }
    ;(current.children ?? []).forEach(walk)
  }
  walk(node)
  return found
}
