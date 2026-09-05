import React from "react"
import { render } from "@testing-library/react-native"
import { StyleSheet } from "react-native"
import { lightColors } from "@colota/shared"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { Button } from "../Button"

const flat = (el: any) => StyleSheet.flatten(el.props.style)

describe("Button variants", () => {
  it("fills a secondary rather than outlining it", () => {
    // The two + Add controls were dashed boxes, which is the one border style the app had
    // nowhere else. A fill keeps them reading as controls without inventing a stroke.
    const { getByTestId } = render(
      <Button title="+ Add Header" onPress={jest.fn()} variant="secondary" testID="add-btn" />
    )

    const style = flat(getByTestId("add-btn"))
    expect(style.backgroundColor).toBe(lightColors.primaryContainer)
    expect(style.borderWidth).toBe(0)
  })

  it("keeps the touch target at the Android minimum", () => {
    const { getByTestId } = render(<Button title="Save profile" onPress={jest.fn()} testID="save-btn" />)

    expect(flat(getByTestId("save-btn")).minHeight).toBe(48)
  })
})
