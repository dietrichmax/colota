import React from "react"
import { render } from "@testing-library/react-native"
import { Modal } from "react-native"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { LoadingOverlay } from "../LoadingOverlay"

describe("LoadingOverlay", () => {
  it("renders nothing until it is asked to", () => {
    const { queryByText, UNSAFE_queryAllByType } = render(<LoadingOverlay visible={false} title="Importing" />)

    expect(queryByText("Importing")).toBeNull()
    expect(UNSAFE_queryAllByType(Modal)).toHaveLength(0)
  })

  it("covers the header too, which an overlay inside the screen cannot", () => {
    // Import and export run for minutes. Drawn as an absolute View it stopped at the screen's own
    // tree, leaving the stack's back arrow live and the job navigable out from under.
    const { getByText, UNSAFE_getByType } = render(
      <LoadingOverlay visible title="Importing" message="1,204 of 8,000" />
    )

    expect(UNSAFE_getByType(Modal).props.transparent).toBe(true)
    expect(getByText("Importing")).toBeTruthy()
    expect(getByText("1,204 of 8,000")).toBeTruthy()
  })
})
