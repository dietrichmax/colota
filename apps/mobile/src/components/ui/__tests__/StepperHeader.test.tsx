import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { Text } from "react-native"
import { StepperHeader } from "../StepperHeader"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

function renderHeader(overrides: Partial<React.ComponentProps<typeof StepperHeader>> = {}) {
  const props = {
    title: "Trip 2",
    caption: "Wed, Sep 3 · 12:05 - 12:21",
    onPrevious: jest.fn(),
    onNext: jest.fn(),
    previousLabel: "Previous trip",
    nextLabel: "Next trip",
    testID: "trip",
    ...overrides
  }
  return { ...render(<StepperHeader {...props} />), props }
}

describe("StepperHeader", () => {
  it("steps with each chevron and names what it steps for a screen reader", () => {
    const { getByLabelText, props } = renderHeader()

    fireEvent.press(getByLabelText("Previous trip"))
    fireEvent.press(getByLabelText("Next trip"))

    expect(props.onPrevious).toHaveBeenCalledTimes(1)
    expect(props.onNext).toHaveBeenCalledTimes(1)
  })

  it("disables either end and dims its glyph, so the first trip has no previous and the last no next", () => {
    const { getByLabelText, getByTestId, props } = renderHeader({ previousDisabled: true, nextDisabled: true })

    fireEvent.press(getByLabelText("Previous trip"))
    fireEvent.press(getByLabelText("Next trip"))

    expect(props.onPrevious).not.toHaveBeenCalled()
    expect(props.onNext).not.toHaveBeenCalled()
    expect(getByLabelText("Previous trip").props.accessibilityState).toEqual({ disabled: true })
    expect(getByTestId("icon-ChevronLeft").props.color).toBe(require("@colota/shared").lightColors.textDisabled)
  })

  it("reads the title and caption as one heading when the title opens nothing, with no chevron promising a picker", () => {
    const { getByTestId, queryByTestId } = renderHeader()

    const centre = getByTestId("trip-title")
    expect(centre.props.accessibilityRole).toBe("header")
    expect(centre.props.accessibilityLabel).toBe("Trip 2, Wed, Sep 3 · 12:05 - 12:21")
    expect(queryByTestId("icon-ChevronDown")).toBeNull()
  })

  it("makes the title a button with a down chevron when it opens a picker", () => {
    const onPress = jest.fn()
    const { getByTestId } = renderHeader({ onPress, accessibilityHint: "Opens the calendar" })

    const centre = getByTestId("trip-title")
    expect(centre.props.accessibilityRole).toBe("button")
    expect(centre.props.accessibilityHint).toBe("Opens the calendar")
    expect(getByTestId("icon-ChevronDown")).toBeTruthy()
    fireEvent.press(centre)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("draws a leading mark before the title, so a trip carries its swatch into the header", () => {
    const { getByText } = renderHeader({ leading: <Text>swatch</Text> })

    expect(getByText("swatch")).toBeTruthy()
  })
})
