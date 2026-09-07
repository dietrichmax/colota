import React from "react"
import { render } from "@testing-library/react-native"
import { StyleSheet, Text } from "react-native"
import { StatRow } from "../StatRow"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: jest.requireActual("@colota/shared").lightColors })
}))

describe("StatRow", () => {
  it("reads as one thing, so a screen reader does not split the label from its number", () => {
    const { getByLabelText } = render(<StatRow label="Distance" value="4.2 km" />)

    expect(getByLabelText("Distance, 4.2 km")).toBeTruthy()
  })

  it("gives the value tabular figures, so a number that updates does not jitter", () => {
    const { getByText } = render(<StatRow label="Points" value="1,204" />)

    expect(StyleSheet.flatten(getByText("1,204").props.style).fontVariant).toEqual(["tabular-nums"])
  })

  it("keeps the value beside a trailing control rather than behind it", () => {
    const { getByText } = render(
      <StatRow label="Queued" value="7">
        <Text>badge</Text>
      </StatRow>
    )

    expect(getByText("7")).toBeTruthy()
    expect(getByText("badge")).toBeTruthy()
  })
})
