import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"
import { Notice } from "../Notice"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ mode: "light", colors: require("@colota/shared").lightColors })
}))

const flatten = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))

describe("Notice", () => {
  // The hue lives on the rule and the glyph. Tinting the words as well is the filled
  // banner this rework removes, and coloured body text is the first thing to fail contrast
  // once the palette moves.
  it("keeps the hue on the rule and the icon and the text in ink", () => {
    const { getByTestId, getByText } = render(
      <Notice variant="warning" title="Queue is filling up" message="128 points are waiting" testID="queue-notice" />
    )

    expect(flatten(getByTestId("notice-rule").props.style).backgroundColor).toBe(lightColors.warning)
    expect(getByTestId("icon-AlertTriangle").props.color).toBe(lightColors.warning)
    expect(flatten(getByText("Queue is filling up").props.style).color).toBe(lightColors.text)
    expect(flatten(getByText("128 points are waiting").props.style).color).toBe(lightColors.textSecondary)
  })

  it("reads the title and body as one node", () => {
    const { getByLabelText } = render(
      <Notice variant="error" title="Sync failed" message="The server refused the token" />
    )

    expect(getByLabelText("Sync failed, The server refused the token")).toBeTruthy()
  })

  // Two targets in one row is the ambiguity this shape exists to remove: either the row
  // opens something, or it carries one named action. The prop union rules out both.
  it("makes the whole row the action when it is given one", () => {
    const onPress = jest.fn()
    const { getByRole, queryByRole } = render(<Notice variant="info" title="Set up a server" onPress={onPress} />)

    fireEvent.press(getByRole("button", { name: "Set up a server" }))

    expect(onPress).toHaveBeenCalled()
    expect(queryByRole("button", { name: "Open settings" })).toBeNull()
  })

  it("keeps the row static when it carries a ghost action", () => {
    const onActionPress = jest.fn()
    const { getByRole, queryByRole } = render(
      <Notice variant="info" title="Set up a server" actionLabel="Open settings" onActionPress={onActionPress} />
    )

    fireEvent.press(getByRole("button", { name: "Open settings" }))

    expect(onActionPress).toHaveBeenCalled()
    expect(queryByRole("button", { name: "Set up a server" })).toBeNull()
  })
})
