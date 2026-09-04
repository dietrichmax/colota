import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { EmptyState } from "../EmptyState"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ mode: "light", colors: require("@colota/shared").lightColors })
}))

const flatten = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))

describe("EmptyState", () => {
  // An empty list is a state of the screen, not a poster: it stays on the same text column
  // as the rows it replaces, so nothing jumps when the first row arrives.
  it("stays on the text column instead of centring itself", () => {
    const { getByTestId } = render(<EmptyState title="No trips yet" message="Start tracking" testID="empty" />)

    expect(flatten(getByTestId("empty").props.style).alignItems).toBe("flex-start")
  })

  it("offers its action only when there is something to do", () => {
    const onActionPress = jest.fn()
    const withAction = render(
      <EmptyState title="No zones yet" actionLabel="Add a zone" onActionPress={onActionPress} />
    )
    fireEvent.press(withAction.getByRole("button", { name: "Add a zone" }))
    expect(onActionPress).toHaveBeenCalled()

    const without = render(<EmptyState title="No zones yet" />)
    expect(without.queryByRole("button")).toBeNull()
  })
})
