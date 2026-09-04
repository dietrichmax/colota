import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"
import { Tab } from "../Tab"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ mode: "light", colors: require("@colota/shared").lightColors })
}))

const flatten = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))

describe("Tab", () => {
  // TalkBack has to say which of the three is open; the rule and the ink are only visible
  // cues, and colour alone is not a state.
  it("announces the open tab as the selected one", () => {
    const { getByRole } = render(<Tab label="Map" active onPress={jest.fn()} />)

    expect(getByRole("tab", { name: "Map" }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    )
  })

  it("marks the other tabs unselected and dims their labels", () => {
    const { getByRole, getByText } = render(<Tab label="Trips" active={false} onPress={jest.fn()} />)

    expect(getByRole("tab", { name: "Trips" }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false })
    )
    expect(flatten(getByText("Trips").props.style).color).toBe(lightColors.textSecondary)
  })

  // The rule sits under the label, not under the row: a full-width underline reads as a
  // divider closing the tab strip, which is the boxed look this rework removes.
  it("draws the rule only under the active label", () => {
    const active = render(<Tab label="Map" active onPress={jest.fn()} />)
    expect(flatten(active.getByText("Map").props.style).color).toBe(lightColors.text)
    const rule = flatten(active.getByTestId("tab-rule").props.style)
    expect(rule.backgroundColor).toBe(lightColors.primary)
    expect(rule.height).toBe(2)

    const inactive = render(<Tab label="Data" active={false} onPress={jest.fn()} />)
    expect(inactive.queryByTestId("tab-rule")).toBeNull()
  })

  it("fires on press", () => {
    const onPress = jest.fn()
    const { getByRole } = render(<Tab label="Map" active={false} onPress={onPress} />)

    fireEvent.press(getByRole("tab", { name: "Map" }))

    expect(onPress).toHaveBeenCalled()
  })
})
