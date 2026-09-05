import React from "react"
import { render } from "@testing-library/react-native"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { ListItem } from "../ListItem"

describe("ListItem", () => {
  it("says whether the panel it opens is showing", () => {
    // Without the expanded state TalkBack announces a plain button and the panel opening
    // below is silent. A hint is not a substitute: it is read late and never on the change.
    const { getByTestId, rerender } = render(
      <ListItem label="Map tile server" onPress={jest.fn()} expanded={false} testID="row" />
    )
    expect(getByTestId("row").props.accessibilityState.expanded).toBe(false)

    rerender(<ListItem label="Map tile server" onPress={jest.fn()} expanded testID="row" />)
    expect(getByTestId("row").props.accessibilityState.expanded).toBe(true)
  })

  it("leaves expanded unset on a row that opens nothing", () => {
    const { getByTestId } = render(<ListItem label="Connection" onPress={jest.fn()} testID="row" />)
    expect(getByTestId("row").props.accessibilityState.expanded).toBeUndefined()
  })
})
