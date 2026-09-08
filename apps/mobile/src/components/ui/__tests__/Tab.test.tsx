import React from "react"
import { render } from "@testing-library/react-native"
import { StyleSheet } from "react-native"
import { lightColors, radius } from "@colota/shared"
import { size, space } from "../../../constants"
import { fonts } from "../../../styles/typography"

import { Tab } from "../Tab"

const props = { label: "Trips", onPress: jest.fn(), colors: lightColors as never }

type Node = { type: unknown; parent: Node | null; props: { style?: unknown } }

function wrapperStyle(label: Node) {
  let node = label.parent
  while (node && node.type !== "View") node = node.parent
  return StyleSheet.flatten(node!.props.style as never)
}

describe("Tab", () => {
  it("says it is a tab and which one is selected", () => {
    const { getByRole, rerender } = render(<Tab {...props} active />)

    expect(getByRole("tab", { name: "Trips" }).props.accessibilityState.selected).toBe(true)

    rerender(<Tab {...props} active={false} />)
    expect(getByRole("tab", { name: "Trips" }).props.accessibilityState.selected).toBe(false)
  })

  it("is at least a 48 dp target with the label centred in it", () => {
    // A tab is a screen's sole switcher, so a short label must not shrink its target below the touch floor.
    const { getByRole } = render(<Tab {...props} active={false} />)
    const style = StyleSheet.flatten(getByRole("tab").props.style)

    expect(style.minHeight).toBe(size.touch)
    expect(style.justifyContent).toBe("center")
    expect(style.flex).toBe(1)
  })

  it("underlines the label, not the whole tab, so the indicator reads as the word's width", () => {
    const { getByRole, getByText, rerender } = render(<Tab {...props} active />)

    const tab = StyleSheet.flatten(getByRole("tab").props.style)
    expect(tab.borderBottomWidth).toBeUndefined()
    expect(tab.borderTopLeftRadius).toBeUndefined()

    const wrapper = wrapperStyle(getByText("Trips"))
    expect(wrapper.borderBottomWidth).toBe(2)
    expect(wrapper.borderBottomColor).toBe(lightColors.primary)
    expect(wrapper.borderTopLeftRadius).toBe(radius.xs)
    expect(wrapper.borderTopRightRadius).toBe(radius.xs)
    expect(wrapper.paddingHorizontal).toBe(space.xs)

    rerender(<Tab {...props} active={false} />)
    // The rule stays drawn and only its colour changes, so the label does not jump when the tab is chosen.
    const resting = wrapperStyle(getByText("Trips"))
    expect(resting.borderBottomWidth).toBe(2)
    expect(resting.borderBottomColor).toBe("transparent")
  })

  it("marks the shown tab with weight and the text colour, not the accent", () => {
    // Primary as text is under the contrast floor on the ground; the rule and the weight already carry the state.
    const { getByText, rerender } = render(<Tab {...props} active />)

    const active = StyleSheet.flatten(getByText("Trips").props.style)
    expect(active.color).toBe(lightColors.text)
    expect(active.fontFamily).toBe(fonts.bold.fontFamily)

    rerender(<Tab {...props} active={false} />)
    const inactive = StyleSheet.flatten(getByText("Trips").props.style)
    expect(inactive.color).toBe(lightColors.textSecondary)
    expect(inactive.fontFamily).toBe(fonts.regular.fontFamily)
  })
})
