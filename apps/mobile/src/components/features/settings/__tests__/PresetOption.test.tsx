import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { TRACKING_PRESETS } from "../../../../types/global"

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
      primaryDark: "#115E59",
      text: "#000",
      textSecondary: "#6b7280",
      textLight: "#9ca3af",
      success: "#22c55e",
      warning: "#f59e0b",
      border: "#e5e7eb"
    }
  })
}))

jest.mock("../../../ui/RadioDot", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    RadioDot: ({ selected }: any) => R.createElement(View, { testID: selected ? "radio-selected" : "radio-unselected" })
  }
})

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    Zap: () => R.createElement(View, null),
    Check: () => R.createElement(View, null)
  }
})

import { PresetOption } from "../PresetOption"

describe("PresetOption", () => {
  const mockOnSelect = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("renders preset label and description", () => {
    const { getByText } = render(
      <PresetOption preset="balanced" isSelected={false} isOfflineMode={false} onSelect={mockOnSelect} />
    )

    expect(getByText(TRACKING_PRESETS.balanced.label)).toBeTruthy()
    expect(getByText(TRACKING_PRESETS.balanced.description)).toBeTruthy()
  })

  it("shows offline description when isOfflineMode is true", () => {
    const { getByText } = render(
      <PresetOption preset="balanced" isSelected={false} isOfflineMode={true} onSelect={mockOnSelect} />
    )

    expect(getByText(TRACKING_PRESETS.balanced.description.split(" • ")[0])).toBeTruthy()
  })

  it("calls onSelect with preset when pressed", () => {
    const { getByRole } = render(
      <PresetOption preset="instant" isSelected={false} isOfflineMode={false} onSelect={mockOnSelect} />
    )

    fireEvent.press(getByRole("radio"))

    expect(mockOnSelect).toHaveBeenCalledWith("instant")
  })

  it("shows selected radio dot when isSelected", () => {
    const { getByTestId } = render(
      <PresetOption preset="balanced" isSelected isOfflineMode={false} onSelect={mockOnSelect} />
    )

    expect(getByTestId("radio-selected")).toBeTruthy()
  })

  it("shows unselected radio dot when not selected", () => {
    const { getByTestId } = render(
      <PresetOption preset="balanced" isSelected={false} isOfflineMode={false} onSelect={mockOnSelect} />
    )

    expect(getByTestId("radio-unselected")).toBeTruthy()
  })

  it("shows Recommended badge for balanced preset", () => {
    const { getByText } = render(
      <PresetOption preset="balanced" isSelected={false} isOfflineMode={false} onSelect={mockOnSelect} />
    )

    expect(getByText("Recommended")).toBeTruthy()
  })

  it("shows High Battery Usage badge for instant preset", () => {
    const { getByText } = render(
      <PresetOption preset="instant" isSelected={false} isOfflineMode={false} onSelect={mockOnSelect} />
    )

    expect(getByText("High Battery Usage")).toBeTruthy()
  })
})
