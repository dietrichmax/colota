import React from "react"
import { render } from "@testing-library/react-native"
import { StyleSheet, Text, View } from "react-native"
import { CircleDot } from "lucide-react-native"
import { size, space } from "../../../constants"
import { StateLine } from "../StateLine"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

describe("StateLine", () => {
  it("renders the label and its caption as two lines, so the dock keeps one height in every state", () => {
    const { getByText } = render(
      <StateLine icon={CircleDot} iconColor="#000" label="Tracking" caption="±4 m · 20:58" />
    )

    expect(getByText("Tracking")).toBeTruthy()
    expect(getByText("±4 m · 20:58")).toBeTruthy()
  })

  it("reads as one thing to a screen reader, the state and its detail together", () => {
    const { getByLabelText } = render(
      <StateLine icon={CircleDot} iconColor="#000" label="Ready" caption="No fixes yet" testID="state-line" />
    )

    expect(getByLabelText("Ready, No fixes yet").props.accessibilityRole).toBe("text")
  })

  it("accepts a ready-made element as the glyph, which is how the Searching state spins", () => {
    const { getByText } = render(
      <StateLine icon={<Text>spinner</Text>} iconColor="#000" label="Searching for GPS" caption="No fix yet" />
    )

    expect(getByText("spinner")).toBeTruthy()
  })

  it("keeps a long caption on one line, so a verbose reason cannot grow the row", () => {
    const caption = "Home WiFi · resumes when you leave the zone and the phone starts moving again"
    const { getByText } = render(
      <StateLine icon={CircleDot} iconColor="#000" label="Paused in Home" caption={caption} />
    )

    expect(getByText(caption).props.numberOfLines).toBe(1)
    expect(getByText("Paused in Home").props.numberOfLines).toBe(1)
  })

  it("gives the caption tabular figures, so an updating accuracy or time does not jitter", () => {
    const { getByText } = render(
      <StateLine icon={CircleDot} iconColor="#000" label="Tracking" caption="±4 m · 20:58" />
    )

    expect(StyleSheet.flatten(getByText("±4 m · 20:58").props.style).fontVariant).toEqual(["tabular-nums"])
  })

  it("centres the glyph in ListItem's icon column, so the dock's text lines up with its inset seams", () => {
    const { getByLabelText, UNSAFE_getAllByType } = render(
      <StateLine icon={CircleDot} iconColor="#000" label="Tracking" caption="±4 m · 20:58" />
    )

    const box = UNSAFE_getAllByType(View).find((v) => StyleSheet.flatten(v.props.style)?.width === size.icon.md)
    expect(StyleSheet.flatten(box?.props.style).alignItems).toBe("center")
    expect(StyleSheet.flatten(getByLabelText("Tracking, ±4 m · 20:58").props.style).gap).toBe(space.lg)
  })

  it("centres a ready-made glyph in the same column, so the spinner does not sit off the others", () => {
    const { UNSAFE_getAllByType } = render(
      <StateLine icon={<Text>spinner</Text>} iconColor="#000" label="Searching for GPS" caption="No fix yet" />
    )

    const box = UNSAFE_getAllByType(View).find((v) => StyleSheet.flatten(v.props.style)?.width === size.icon.md)
    expect(StyleSheet.flatten(box?.props.style).alignItems).toBe("center")
  })
})
