import React from "react"
import { render } from "@testing-library/react-native"
import { StyleSheet, Text, View } from "react-native"
import { Timer } from "lucide-react-native"
import { size, space } from "../../../constants"
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

  it("centres its icon in ListItem's icon column, so its label starts where a ListItem's does", () => {
    const { UNSAFE_getAllByType } = render(<StatRow icon={Timer} label="Interval" value="30 s" />)

    const styles = UNSAFE_getAllByType(View).map((v) => StyleSheet.flatten(v.props.style) ?? {})
    const box = styles.find((style) => style.width === size.icon.md)
    expect(box?.alignItems).toBe("center")
    expect(styles.find((style) => style.gap === space.lg)?.flexDirection).toBe("row")
  })

  it("draws no icon column without an icon, so a plain figure list keeps its label at the edge", () => {
    const { UNSAFE_getAllByType } = render(<StatRow label="Points" value="1,204" />)

    expect(UNSAFE_getAllByType(View).some((v) => StyleSheet.flatten(v.props.style)?.width === size.icon.md)).toBe(false)
  })
})
