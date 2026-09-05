import React from "react"
import { Modal } from "react-native"
import { MapPin } from "lucide-react-native"
import { render, fireEvent, act, within } from "@testing-library/react-native"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ mode: "light", colors: require("@colota/shared").lightColors })
}))

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}))

import { DisclosureModal } from "../DisclosureModal"

describe("DisclosureModal", () => {
  let triggerModal = () => Promise.resolve(false)
  const mockRegister = (cb: () => Promise<boolean>) => {
    triggerModal = cb
  }

  const defaultProps = {
    icon: MapPin,
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

  // Play's prominent disclosure has to be answered before the permission prompt, so the
  // ways out that do not record an answer are not offered at all.
  it("gives a blocking disclosure no back handler and no scrim tap", async () => {
    const { UNSAFE_getByType, queryByLabelText } = render(<DisclosureModal {...defaultProps} blocking />)

    await act(async () => {
      triggerModal()
    })

    expect(UNSAFE_getByType(Modal).props.onRequestClose).toBeUndefined()
    expect(queryByLabelText("Close")).toBeNull()
  })

  it("lets back decline a disclosure that is not blocking", async () => {
    const { UNSAFE_getByType } = render(<DisclosureModal {...defaultProps} />)

    let resultPromise: Promise<boolean>
    await act(async () => {
      resultPromise = triggerModal()
    })

    await act(async () => {
      UNSAFE_getByType(Modal).props.onRequestClose()
    })

    expect(await resultPromise!).toBe(false)
  })

  // The location disclosure is three paragraphs long and its buttons still have to be on
  // screen at a 2.0x font scale, which only holds while they sit outside the scroller.
  it("scrolls the paragraphs and keeps the buttons out of the scroller", async () => {
    const { getByTestId } = render(<DisclosureModal {...defaultProps} />)

    await act(async () => {
      triggerModal()
    })

    expect(within(getByTestId("sheet-body")).getByText("Second paragraph.")).toBeTruthy()
    expect(within(getByTestId("sheet-body")).queryByText("Confirm")).toBeNull()
    expect(within(getByTestId("sheet-actions")).getByText("Confirm")).toBeTruthy()
    expect(within(getByTestId("sheet-actions")).getByText("Not Now")).toBeTruthy()
  })
})
