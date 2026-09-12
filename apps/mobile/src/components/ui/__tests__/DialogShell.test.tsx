import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { Modal, StyleSheet, Text } from "react-native"
import { lightColors } from "@colota/shared"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { DialogShell } from "../DialogShell"
import { space } from "../../../constants"

describe("DialogShell", () => {
  it("renders nothing while it is closed", () => {
    const { queryByText } = render(
      <DialogShell visible={false} onRequestClose={jest.fn()} title="Note">
        <Text>Body</Text>
      </DialogShell>
    )

    expect(queryByText("Note")).toBeNull()
    expect(queryByText("Body")).toBeNull()
  })

  it("shows the title as a heading, the content and the footer row", () => {
    const { getByRole, getByText } = render(
      <DialogShell visible onRequestClose={jest.fn()} title="Note" footer={<Text>Close</Text>}>
        <Text>Body</Text>
      </DialogShell>
    )

    expect(getByRole("header", { name: "Note" })).toBeTruthy()
    expect(getByText("Body")).toBeTruthy()
    expect(getByText("Close")).toBeTruthy()
  })

  it("keeps the alert geometry by default: a 32 gutter and a 24 inset", () => {
    // The same card AppModal and the attribution dialog draw, so a dialog on the shell lines up with them.
    const { getByTestId } = render(
      <DialogShell visible onRequestClose={jest.fn()}>
        <Text>Body</Text>
      </DialogShell>
    )

    const scrim = StyleSheet.flatten(getByTestId("dialog-scrim").props.style)
    const card = StyleSheet.flatten(getByTestId("dialog-card").props.style)
    expect(scrim.paddingHorizontal).toBe(space.xxl)
    expect(scrim.backgroundColor).toBe(lightColors.overlay)
    expect(card.padding).toBe(space.xl)
    expect(card.backgroundColor).toBe(lightColors.surfaceRaised)
  })

  it("gives the calendar grid the width of Material's own picker with the picker gutter", () => {
    // 360 minus twice 16 minus twice 12 leaves 304 for the day grid, seven of the picker's 43 dp cells.
    const { getByTestId } = render(
      <DialogShell visible onRequestClose={jest.fn()} gutter="picker">
        <Text>Body</Text>
      </DialogShell>
    )

    const scrim = StyleSheet.flatten(getByTestId("dialog-scrim").props.style)
    const card = StyleSheet.flatten(getByTestId("dialog-card").props.style)
    expect(scrim.paddingHorizontal).toBe(space.lg)
    expect(card.padding).toBe(space.md)
    expect(360 - 2 * (scrim.paddingHorizontal + card.padding)).toBe(304)
  })

  it("closes on a tap outside the card and on hardware back", () => {
    const onRequestClose = jest.fn()
    const { getByTestId, UNSAFE_getByType } = render(
      <DialogShell visible onRequestClose={onRequestClose}>
        <Text>Body</Text>
      </DialogShell>
    )

    fireEvent.press(getByTestId("dialog-scrim"))
    expect(onRequestClose).toHaveBeenCalledTimes(1)

    UNSAFE_getByType(Modal).props.onRequestClose()
    expect(onRequestClose).toHaveBeenCalledTimes(2)
  })

  it("stays open when the tap lands inside the card", () => {
    // A tap on the card's own padding must not dismiss a half-written note.
    const onRequestClose = jest.fn()
    const { getByTestId } = render(
      <DialogShell visible onRequestClose={onRequestClose}>
        <Text>Body</Text>
      </DialogShell>
    )

    fireEvent.press(getByTestId("dialog-card"))
    expect(onRequestClose).not.toHaveBeenCalled()
  })

  it("ignores the scrim and hardware back when it is not dismissible, because an alert has to be answered", () => {
    const onRequestClose = jest.fn()
    const { getByTestId, UNSAFE_getByType } = render(
      <DialogShell visible dismissible={false} onRequestClose={onRequestClose}>
        <Text>Body</Text>
      </DialogShell>
    )

    fireEvent.press(getByTestId("dialog-scrim"))
    UNSAFE_getByType(Modal).props.onRequestClose()
    expect(onRequestClose).not.toHaveBeenCalled()
  })
})
