import React from "react"
import { render } from "@testing-library/react-native"
import { lightColors, radius } from "@colota/shared"
import { Toast } from "../Toast"
import { TOAST_DURATION_MS } from "../../../constants"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ mode: "light", colors: require("@colota/shared").lightColors })
}))

const flatten = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))

describe("Toast", () => {
  it("stays on the inverse pair so it reads as a message and not a surface", () => {
    const { getByTestId } = render(<Toast saving={false} success testID="toast" />)

    expect(flatten(getByTestId("toast").props.style).color).toBe(lightColors.inverseOnSurface)
    const surface = flatten(getByTestId("toast-surface").props.style)
    expect(surface.backgroundColor).toBe(lightColors.inverseSurface)
    expect(surface.borderRadius).toBe(radius.sm)
  })

  // The status is the sentence. A tick or a coloured dot beside "Saved" says the same
  // thing a second time, and a screen reader reads the glyph as nothing at all.
  it("says what happened in words and renders no glyph", () => {
    const { getByText, queryByTestId } = render(<Toast saving={false} success />)

    expect(getByText("Saved")).toBeTruthy()
    expect(queryByTestId("icon-Check")).toBeNull()
  })

  // A failure interrupts; a save does not. Politeness is the only cue a screen reader user
  // gets, so it follows the outcome rather than being fixed.
  it("interrupts on a failure and waits its turn on a success", () => {
    const failed = render(<Toast saving={false} success={false} message="Save failed" isError testID="toast" />)
    expect(failed.getByTestId("toast").props.accessibilityLiveRegion).toBe("assertive")

    const saved = render(<Toast saving={false} success testID="saved" />)
    expect(saved.getByTestId("saved").props.accessibilityLiveRegion).toBe("polite")
  })

  // A live region that stays mounted announces itself again when it fades out and on every
  // silent text change, so the toast leaves the tree instead of animating to zero.
  it("unmounts when there is nothing to say", () => {
    const { queryByTestId, rerender } = render(<Toast saving={false} success testID="toast" />)
    expect(queryByTestId("toast")).toBeTruthy()

    rerender(<Toast saving={false} success={false} testID="toast" />)

    expect(queryByTestId("toast")).toBeNull()
  })

  it("gives the reader four seconds, M3's floor for a message nobody asked for", () => {
    expect(TOAST_DURATION_MS).toBe(4000)
  })
})
