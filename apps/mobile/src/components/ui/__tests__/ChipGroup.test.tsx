import React from "react"
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from "react-native"
import { render, fireEvent } from "@testing-library/react-native"
import { lightColors } from "@colota/shared"
import { ChipGroup } from "../ChipGroup"
import { size } from "../../../constants"
import { fonts } from "../../../styles/typography"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ mode: "light", colors: require("@colota/shared").lightColors })
}))

type Styled = { props: { style?: StyleProp<ViewStyle & TextStyle> } }

const styleOf = (element?: Styled | null): ViewStyle & TextStyle => StyleSheet.flatten(element?.props.style) ?? {}

const OPTIONS = [
  { value: "metric", label: "Metric" },
  { value: "imperial", label: "Imperial" }
] as const

describe("ChipGroup", () => {
  // Selection never rides on colour alone: well and primaryContainer sit at the same
  // tonal step over the ground, so the check and the weight carry the state.
  it("marks the selected chip with a check and a weight step, not colour alone", () => {
    const { getByRole, getByText, queryByTestId } = render(
      <ChipGroup label="Units" options={OPTIONS} selected="metric" onSelect={jest.fn()} />
    )

    expect(queryByTestId("icon-Check")).toBeTruthy()
    expect(styleOf(getByText("Metric")).fontFamily).toBe(fonts.semiBold.fontFamily)
    expect(styleOf(getByText("Imperial")).fontFamily).not.toBe(fonts.semiBold.fontFamily)
    expect(styleOf(getByRole("radio", { name: "Metric" }).children[0] as Styled).backgroundColor).toBe(
      lightColors.primaryContainer
    )
    expect(styleOf(getByRole("radio", { name: "Imperial" }).children[0] as Styled).backgroundColor).toBe(
      lightColors.well
    )
  })

  // TalkBack reads checked from setCheckable/setChecked under the radio role; a chip
  // that only sets selected announces nothing about its state.
  it("puts the radio role and checked state on every chip under a radiogroup", () => {
    const { getByRole, UNSAFE_getByProps } = render(
      <ChipGroup label="Units" options={OPTIONS} selected="metric" onSelect={jest.fn()} />
    )

    expect(UNSAFE_getByProps({ accessibilityRole: "radiogroup" }).props.accessibilityLabel).toBe("Units")
    expect(getByRole("radio", { name: "Metric" }).props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true })
    )
    expect(getByRole("radio", { name: "Imperial" }).props.accessibilityState).toEqual(
      expect.objectContaining({ checked: false })
    )
  })

  // hitSlop widens touch dispatch only: the accessibility node keeps the 36 dp chip
  // bounds and the Accessibility Scanner reports a target under the minimum.
  it("paints the 36 chip inside a real 48 target rather than adding hitSlop", () => {
    const { getByRole } = render(<ChipGroup label="Units" options={OPTIONS} selected="metric" onSelect={jest.fn()} />)

    const target = getByRole("radio", { name: "Metric" })
    expect(styleOf(target).minHeight).toBe(size.touch)
    expect(target.props.hitSlop).toBeUndefined()
    expect(styleOf(target.children[0] as Styled).minHeight).toBe(size.chip)
  })

  it("names the group from a visible label line", () => {
    const { getByText } = render(<ChipGroup label="Units" options={OPTIONS} selected="metric" onSelect={jest.fn()} />)

    expect(getByText("Units")).toBeTruthy()
  })

  it("takes a name without a visible line when a heading already names the group", () => {
    const { queryByText, UNSAFE_getByProps } = render(
      <ChipGroup accessibilityLabel="Units" options={OPTIONS} selected="metric" onSelect={jest.fn()} />
    )

    expect(queryByText("Units")).toBeNull()
    expect(UNSAFE_getByProps({ accessibilityRole: "radiogroup" }).props.accessibilityLabel).toBe("Units")
  })

  it("reports the pressed value in single-select mode", () => {
    const onSelect = jest.fn()
    const { getByRole } = render(<ChipGroup label="Units" options={OPTIONS} selected="metric" onSelect={onSelect} />)

    fireEvent.press(getByRole("radio", { name: "Imperial" }))

    expect(onSelect).toHaveBeenCalledWith("imperial")
  })

  it("does not fire for a disabled chip and says so in its state", () => {
    const onSelect = jest.fn()
    const { getByRole } = render(
      <ChipGroup
        label="Units"
        options={OPTIONS}
        selected="metric"
        onSelect={onSelect}
        disabled={new Set(["imperial"] as const)}
      />
    )

    const chip = getByRole("radio", { name: "Imperial" })
    fireEvent.press(chip)

    expect(onSelect).not.toHaveBeenCalled()
    expect(chip.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }))
  })

  // The activity log filters by several levels at once, which single-select cannot
  // express: each chip is its own checkbox and toggling one leaves the rest alone.
  it("toggles one value at a time in multiple mode and marks each chip a checkbox", () => {
    const onToggle = jest.fn()
    const { getByRole } = render(
      <ChipGroup
        label="Levels"
        options={OPTIONS}
        multiple
        selected={new Set(["metric"] as const)}
        onToggle={onToggle}
      />
    )

    expect(getByRole("checkbox", { name: "Metric" }).props.accessibilityState).toEqual(
      expect.objectContaining({ checked: true })
    )
    fireEvent.press(getByRole("checkbox", { name: "Imperial" }))

    expect(onToggle).toHaveBeenCalledWith("imperial")
  })
})
