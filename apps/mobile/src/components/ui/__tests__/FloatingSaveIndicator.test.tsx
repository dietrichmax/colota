import React from "react"
import { render } from "@testing-library/react-native"
import { StyleSheet } from "react-native"
import { lightColors } from "@colota/shared"
import { space } from "../../../constants"
import { FloatingSaveIndicator } from "../FloatingSaveIndicator"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const { View } = require("react-native")
  const stub = (name: string) => (props: Record<string, unknown>) =>
    R.createElement(View, { testID: `icon-${name}`, ...props })
  return { Check: stub("check"), CircleAlert: stub("alert"), Loader: stub("loader") }
})

const fill = (testID: string, api: ReturnType<typeof render>) =>
  StyleSheet.flatten(api.getByTestId(testID).props.style).backgroundColor

describe("FloatingSaveIndicator", () => {
  it("paints the one raised surface in every state, so the verdict is never a fill colour", () => {
    expect(fill("floating-save-indicator-pill", render(<FloatingSaveIndicator saving />))).toBe(
      lightColors.surfaceRaised
    )
    expect(fill("floating-save-indicator-pill", render(<FloatingSaveIndicator saving={false} message="Saved" />))).toBe(
      lightColors.surfaceRaised
    )
    expect(
      fill(
        "floating-save-indicator-pill",
        render(<FloatingSaveIndicator saving={false} message="Could not save" isError />)
      )
    ).toBe(lightColors.surfaceRaised)
  })

  it("carries the state in the glyph and the word: a spinner, then a check or an alert", () => {
    const saving = render(<FloatingSaveIndicator saving />)
    expect(saving.getByTestId("icon-loader").props.color).toBe(lightColors.textSecondary)
    expect(saving.getByText("Saving...")).toBeTruthy()

    const done = render(<FloatingSaveIndicator saving={false} message="Tracking restarted" />)
    expect(done.getByTestId("icon-check").props.color).toBe(lightColors.success)
    expect(done.getByText("Tracking restarted")).toBeTruthy()

    const failed = render(<FloatingSaveIndicator saving={false} message="Could not save" isError />)
    expect(failed.getByTestId("icon-alert").props.color).toBe(lightColors.error)
    expect(failed.queryByTestId("icon-check")).toBeNull()
  })

  it("floats at the 24 dp rhythm above the bottom edge and lets touches through", () => {
    const { getByTestId } = render(<FloatingSaveIndicator saving />)
    const container = StyleSheet.flatten(getByTestId("floating-save-indicator").props.style)
    expect(container.bottom).toBe(space.xl)
    expect(container.pointerEvents).toBe("none")
  })
})
