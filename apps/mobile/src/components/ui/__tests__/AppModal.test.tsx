import React from "react"
import { render, act } from "@testing-library/react-native"
import { StyleSheet } from "react-native"
import { lightColors } from "@colota/shared"

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}))

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { AppModal } from "../AppModal"
import { showConfirm } from "../../../services/modalService"

describe("AppModal", () => {
  it("announces every choice as a button", async () => {
    // The buttons were bare Pressables, so TalkBack read the words and said nothing about them
    // being pressable. AppModal is every alert and confirm in the app, destructive ones included.
    const { getByRole } = render(<AppModal />)

    await act(async () => {
      showConfirm({ title: "Delete all data", message: "This cannot be undone.", confirmText: "Delete" })
    })

    expect(getByRole("button", { name: "Delete" })).toBeTruthy()
    expect(getByRole("button", { name: "Cancel" })).toBeTruthy()
  })

  it("paints a destructive confirm in the error colour", async () => {
    // showConfirm renders the confirming button last, on the right, and marks it destructive, so
    // the colour is what separates it from the dismissal beside it.
    const { getByRole } = render(<AppModal />)

    await act(async () => {
      showConfirm({ title: "Delete zone", message: "This cannot be undone.", confirmText: "Delete", destructive: true })
    })

    const style = StyleSheet.flatten(getByRole("button", { name: "Delete" }).props.style)
    expect(style.backgroundColor).toBe(lightColors.error)
  })
})
