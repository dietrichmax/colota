import React from "react"
import { render } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"

import { Tab } from "../Tab"

const props = { label: "Trips", onPress: jest.fn(), colors: lightColors as never }

describe("Tab", () => {
  it("says it is a tab and which one is selected", () => {
    // It was a bare Pressable: the History tabs and the log's Live and File announced as three
    // words with no role, and nothing said which of them was showing.
    const { getByRole, rerender } = render(<Tab {...props} active />)

    expect(getByRole("tab", { name: "Trips" }).props.accessibilityState.selected).toBe(true)

    rerender(<Tab {...props} active={false} />)
    expect(getByRole("tab", { name: "Trips" }).props.accessibilityState.selected).toBe(false)
  })
})
