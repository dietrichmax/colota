import React from "react"
import { render, act } from "@testing-library/react-native"

let mockShow: () => Promise<boolean> = () => Promise.resolve(false)

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

jest.mock("../../../services/LocationServicePermission", () => ({
  registerDisclosureCallback: (cb: () => Promise<boolean>) => {
    mockShow = cb
  }
}))

import { LocationDisclosureModal } from "../LocationDisclosureModal"

describe("LocationDisclosureModal", () => {
  // Google Play reviewed this disclosure; the order and the wording on screen are what it approved.
  it("shows the reviewed title, the three paragraphs in order and Agree", async () => {
    const { getByText, toJSON } = render(<LocationDisclosureModal />)

    await act(async () => {
      mockShow()
    })

    expect(getByText("Location data collection")).toBeTruthy()
    expect(getByText("Agree")).toBeTruthy()
    const text = JSON.stringify(toJSON())
    const first = text.indexOf("Colota collects location data to enable GPS tracking")
    const second = text.indexOf("This data is sent only to the server you set up.")
    const third = text.indexOf("While tracking runs, a persistent notification shows its status.")
    expect(first).toBeGreaterThan(-1)
    expect(second).toBeGreaterThan(first)
    expect(third).toBeGreaterThan(second)
  })
})
