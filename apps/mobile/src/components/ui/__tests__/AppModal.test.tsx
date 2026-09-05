import React from "react"
import { Modal } from "react-native"
import { render, fireEvent, act, within } from "@testing-library/react-native"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ mode: "light", colors: require("@colota/shared").lightColors })
}))

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}))

import { AppModal } from "../AppModal"
import { showAlert, showChoice, showConfirm } from "../../../services/modalService"

const show = (fn: () => void) => act(() => fn())

describe("AppModal", () => {
  // The sheet is the app's only dialog, so what a caller reads back has to match what the
  // user did, including the ways out that are not buttons.
  it("resolves the confirm to true from the first button", async () => {
    const { getByTestId } = render(<AppModal />)
    let answer: Promise<boolean>
    show(() => {
      answer = showConfirm({ title: "Delete", message: "Gone for good", confirmText: "Delete" })
    })

    await act(async () => {
      fireEvent.press(getByTestId("modal-btn-0"))
    })

    expect(await answer!).toBe(true)
  })

  // Confirming first and dismissive last is the sheet's own order; the caller keeps the
  // indices it passed, so a reorder here can never move what a button does.
  it("stacks the confirming action above the dismissive one", () => {
    const { getByTestId } = render(<AppModal />)
    show(() => {
      showChoice({
        title: "Clear the log?",
        message: "The file is deleted.",
        buttons: [
          { text: "Cancel", style: "secondary" },
          { text: "Clear", style: "destructive" }
        ]
      })
    })

    const stack = within(getByTestId("sheet-actions"))
    expect(stack.getAllByRole("button").map((node) => node.props.accessibilityLabel)).toEqual(["Clear", "Cancel"])
  })

  // showConfirm cannot fall back to "OK" any more: tsc requires confirmText, so the button
  // always says what pressing it does.
  it("labels the confirming button with the caller's own word", () => {
    const { getByTestId } = render(<AppModal />)
    show(() => {
      showConfirm({ title: "Delete trip", message: "Gone for good", confirmText: "Delete", destructive: true })
    })

    expect(getByTestId("modal-btn-0").props.accessibilityLabel).toBe("Delete")
  })

  it("never disables a button in the stack", () => {
    const { getByTestId } = render(<AppModal />)
    show(() => showAlert("Export failed", "The folder is gone", "error"))

    expect(getByTestId("modal-btn-0").props.accessibilityState.disabled).toBe(false)
  })

  // Back, the scrim and the dismiss slot are the same answer: the caller's dismissive
  // button. A confirm that is backed out of therefore reads as a cancel, not a delete.
  it("answers back and the scrim with the dismissive button", async () => {
    const { UNSAFE_getByType, getByRole } = render(<AppModal />)
    let answer: Promise<boolean>
    show(() => {
      answer = showConfirm({ title: "Delete", message: "Gone for good", confirmText: "Delete" })
    })

    await act(async () => {
      UNSAFE_getByType(Modal).props.onRequestClose()
    })

    expect(await answer!).toBe(false)
    expect(getByRole("button", { name: "Close" })).toBeTruthy()
  })

  it("dismisses on a scrim tap", async () => {
    const { getByRole } = render(<AppModal />)
    let answer: Promise<boolean>
    show(() => {
      answer = showConfirm({ title: "Delete", message: "Gone for good", confirmText: "Delete" })
    })

    await act(async () => {
      fireEvent.press(getByRole("button", { name: "Close" }))
    })

    expect(await answer!).toBe(false)
  })

  // A blocking request is one the app cannot proceed without, so it gets no scrim tap and
  // back does not reach it at all.
  it("leaves back and the scrim out of a blocking request", () => {
    const { UNSAFE_getByType, queryByLabelText } = render(<AppModal />)
    show(() => {
      showChoice({
        title: "Restart Colota",
        message: "The restore is finished.",
        blocking: true,
        buttons: [{ text: "Restart app", style: "primary" }]
      })
    })

    expect(UNSAFE_getByType(Modal).props.onRequestClose).toBeUndefined()
    expect(queryByLabelText("Close")).toBeNull()
  })

  // Three stacked buttons is a menu pretending to be a dialog, so the choices become rows
  // and only the way out stays a button.
  it("renders more than two choices as rows above one dismiss button", async () => {
    const { getByTestId } = render(<AppModal />)
    let choice: Promise<number>
    show(() => {
      choice = showChoice({
        title: "Import locations?",
        message: "4 new points",
        buttons: [
          { text: "Cancel", style: "secondary" },
          { text: "Import", style: "primary" },
          { text: "Import + Queue for Sync", style: "destructive" }
        ]
      })
    })

    const body = within(getByTestId("sheet-body"))
    expect(body.getByTestId("modal-btn-1")).toBeTruthy()
    expect(body.getByTestId("modal-btn-2")).toBeTruthy()
    const stack = within(getByTestId("sheet-actions"))
    expect(stack.getAllByRole("button").map((node) => node.props.accessibilityLabel)).toEqual(["Cancel"])

    await act(async () => {
      fireEvent.press(body.getByTestId("modal-btn-2"))
    })
    expect(await choice!).toBe(2)
  })
})
