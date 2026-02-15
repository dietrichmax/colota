import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { NumericInput } from "../NumericInput"

const mockColors = {
  text: "#000",
  textLight: "#9ca3af",
  textSecondary: "#6b7280",
  border: "#e5e7eb",
  backgroundElevated: "#f9fafb",
  placeholder: "#9ca3af"
} as any

describe("NumericInput", () => {
  const mockOnChange = jest.fn()
  const mockOnBlur = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  function renderInput(overrides: Partial<React.ComponentProps<typeof NumericInput>> = {}) {
    return render(
      <NumericInput
        label="Test Label"
        value="10"
        onChange={mockOnChange}
        onBlur={mockOnBlur}
        unit="seconds"
        colors={mockColors}
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

    const input = getByDisplayValue("10")
    expect(input.props.keyboardType).toBe("numeric")
  })

  it("displays placeholder text", () => {
    const { getByPlaceholderText } = renderInput({
      value: "",
      placeholder: "50"
    })

    expect(getByPlaceholderText("50")).toBeTruthy()
  })

  it("renders different units correctly", () => {
    const { getByText } = renderInput({ unit: "meters" })

    expect(getByText("meters")).toBeTruthy()
  })
})
