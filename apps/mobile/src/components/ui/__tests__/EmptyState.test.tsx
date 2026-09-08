import React from "react"
import { fireEvent, render } from "@testing-library/react-native"
import { EmptyState } from "../EmptyState"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: jest.requireActual("@colota/shared").lightColors })
}))

describe("EmptyState", () => {
  it("offers the next step as a button under the hint, so an empty day is not a dead end", () => {
    const onPress = jest.fn()
    const { getByRole } = render(
      <EmptyState
        title="Nothing recorded"
        hint="Wednesday, September 3"
        action={{ label: "Last day with data", onPress }}
      />
    )

    const button = getByRole("button", { name: "Last day with data" })
    fireEvent.press(button)

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it("renders no button when the state has no next step, so the title and hint stand alone", () => {
    const { queryByRole, getByText } = render(<EmptyState title="No locations yet" hint="Tracking is on." />)

    expect(getByText("No locations yet")).toBeTruthy()
    expect(getByText("Tracking is on.")).toBeTruthy()
    expect(queryByRole("button")).toBeNull()
  })
})
