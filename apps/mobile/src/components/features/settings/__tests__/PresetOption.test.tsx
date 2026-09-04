import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { TRACKING_PRESETS } from "../../../../types/global"

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: require("@colota/shared").lightColors
  })
}))

jest.mock("../../../ui/RadioDot", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    RadioDot: ({ selected }: any) => R.createElement(View, { testID: selected ? "radio-selected" : "radio-unselected" })
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

  // The note used to be a tinted badge; it stays a readable line so the recommendation
  // does not depend on colour a user may not see.
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

    expect(getByText("High battery use")).toBeTruthy()
  })
})
