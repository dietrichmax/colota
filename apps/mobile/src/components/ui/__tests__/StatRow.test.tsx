import React from "react"
import { render } from "@testing-library/react-native"
import { lightColors, type as typeRoles } from "@colota/shared"
import { StatRow } from "../StatRow"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ mode: "light", colors: require("@colota/shared").lightColors })
}))

const flatten = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))

describe("StatRow", () => {
  it("puts the label in the secondary ink and the value in the figure role", () => {
    const { getByText } = render(<StatRow label="Stored points" value="12,480" />)

    expect(flatten(getByText("Stored points").props.style).color).toBe(lightColors.textSecondary)
    const value = flatten(getByText("12,480").props.style)
    expect(value.color).toBe(lightColors.text)
    expect(value.fontSize).toBe(typeRoles.figureInline.fontSize)
    expect(value.fontVariant).toEqual(["tabular-nums"])
  })

  // A ledger line is one fact, so the pair is announced together rather than as a label
  // the user has to swipe past to reach its number.
  it("reads the label and the value as one node", () => {
    const { getByLabelText } = render(<StatRow label="Stored points" value="12,480" testID="stored" />)

    expect(getByLabelText("Stored points, 12,480")).toBeTruthy()
  })

  // The hairline separates rows inside a group; the last row of a group leaves it off so
  // the rule never closes a shape.
  it("draws a hairline only where the caller asks for one", () => {
    const last = render(<StatRow label="Stored points" value="12,480" />)
    expect(last.queryByTestId("stat-row-divider")).toBeNull()

    const between = render(<StatRow label="Stored points" value="12,480" divider />)
    expect(between.getByTestId("stat-row-divider")).toBeTruthy()
  })
})
