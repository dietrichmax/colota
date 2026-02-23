import React from "react"
import { render, fireEvent, act } from "@testing-library/react-native"
import { Text } from "react-native"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      overlay: "rgba(0,0,0,0.5)",
      cardElevated: "#fff",
      borderRadius: 12,
      primary: "#0d9488",
      text: "#000",
      textSecondary: "#666",
      border: "#e5e7eb",
      textOnPrimary: "#fff"
    }
  })
}))

import { DisclosureModal } from "../DisclosureModal"

describe("DisclosureModal", () => {
  let triggerModal = () => Promise.resolve(false)
  const mockRegister = (cb: () => Promise<boolean>) => {
    triggerModal = cb
  }

  const defaultProps = {
    icon: <Text>Icon</Text>,
    title: "Test Title",
    paragraphs: ["First paragraph.", "Second paragraph."],
    confirmLabel: "Confirm",
    registerCallback: mockRegister
  }

  it("is not visible initially", () => {
    const { queryByText } = render(<DisclosureModal {...defaultProps} />)

    expect(queryByText("Test Title")).toBeNull()
  })

  it("becomes visible when the registered callback is invoked", async () => {
    const { getByText } = render(<DisclosureModal {...defaultProps} />)

    let resultPromise: Promise<boolean>
    await act(async () => {
      resultPromise = triggerModal()
    })

    expect(getByText("Test Title")).toBeTruthy()
    expect(getByText("First paragraph.")).toBeTruthy()
    expect(getByText("Second paragraph.")).toBeTruthy()
    expect(getByText("Confirm")).toBeTruthy()
    expect(getByText("Not Now")).toBeTruthy()

    // Clean up by dismissing
    await act(async () => {
      fireEvent.press(getByText("Not Now"))
    })
    expect(await resultPromise!).toBe(false)
  })

  it("resolves true when confirm is pressed", async () => {
    const { getByText } = render(<DisclosureModal {...defaultProps} />)

    let resultPromise: Promise<boolean>
    await act(async () => {
      resultPromise = triggerModal()
    })

    await act(async () => {
      fireEvent.press(getByText("Confirm"))
    })

    expect(await resultPromise!).toBe(true)
  })

  it("resolves false when Not Now is pressed", async () => {
    const { getByText } = render(<DisclosureModal {...defaultProps} />)

    let resultPromise: Promise<boolean>
    await act(async () => {
      resultPromise = triggerModal()
    })

    await act(async () => {
      fireEvent.press(getByText("Not Now"))
    })

    expect(await resultPromise!).toBe(false)
  })

  it("renders the custom confirm label", async () => {
    const { getByText } = render(<DisclosureModal {...defaultProps} confirmLabel="Agree" />)

    await act(async () => {
      triggerModal()
    })

    expect(getByText("Agree")).toBeTruthy()
  })

  it("renders a single paragraph correctly", async () => {
    const { getByText, queryByText } = render(<DisclosureModal {...defaultProps} paragraphs={["Only paragraph."]} />)

    await act(async () => {
      triggerModal()
    })

    expect(getByText("Only paragraph.")).toBeTruthy()
    expect(queryByText("Second paragraph.")).toBeNull()
  })
})
