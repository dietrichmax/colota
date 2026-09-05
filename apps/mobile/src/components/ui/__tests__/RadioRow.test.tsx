import React from "react"
import { render, fireEvent } from "@testing-library/react-native"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { RadioRow } from "../RadioRow"

describe("RadioRow", () => {
  it("makes the whole row the radio, not the dot", () => {
    // RadioDot is hidden from accessibility, so the state has to live on the row or a
    // screen reader has no way to know what is selected.
    const { getByTestId } = render(
      <RadioRow testID="r" label="Charging" sub="Phone is plugged in" selected onPress={jest.fn()} />
    )

    const row = getByTestId("r")
    expect(row.props.accessibilityState.checked).toBe(true)
    expect(row.props.accessibilityLabel).toBe("Charging, Phone is plugged in")
  })

  it("selects on a press anywhere in the row", () => {
    const onPress = jest.fn()
    const { getByTestId } = render(<RadioRow testID="r" label="Car mode" selected={false} onPress={onPress} />)

    fireEvent.press(getByTestId("r"))
    expect(onPress).toHaveBeenCalled()
  })

  it("names itself by the label alone when there is no sub line", () => {
    const { getByTestId } = render(<RadioRow testID="r" label="Stationary" selected={false} onPress={jest.fn()} />)

    expect(getByTestId("r").props.accessibilityLabel).toBe("Stationary")
  })
})
