import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { lightColors, fontFamily } from "@colota/shared"
import { BottomTabBar } from "../BottomTabBar"
import { size } from "../../../constants"

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ mode: "light", colors: require("@colota/shared").lightColors })
}))

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 16, left: 0, right: 0 })
}))

const flatten = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))

describe("BottomTabBar", () => {
  it("hides itself away from the four tab routes", () => {
    const { queryByTestId } = render(<BottomTabBar currentRoute="Settings Detail" onNavigate={jest.fn()} />)

    expect(queryByTestId("tab-dashboard")).toBeNull()
  })

  // The bar is the app's primary navigation, so each item has to announce itself as a tab
  // and say whether it is the open one. A pressable with a label alone announces neither.
  it("gives every item the tab role and only the open one the selected state", () => {
    const { getByRole } = render(<BottomTabBar currentRoute="Dashboard" onNavigate={jest.fn()} />)

    expect(getByRole("tab", { name: "Dashboard" }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    )
    expect(getByRole("tab", { name: "Settings" }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false })
    )
  })

  // Lucide has no filled variants, so weight is what carries the active item: a heavier
  // stroke on the glyph and a semiBold label, not colour on its own.
  it("thickens the active glyph and its label", () => {
    const { getByTestId, getByText } = render(<BottomTabBar currentRoute="Geofences" onNavigate={jest.fn()} />)

    expect(getByTestId("icon-MapPinHouse").props.strokeWidth).toBe(2.25)
    expect(getByTestId("icon-House").props.strokeWidth).toBeUndefined()

    const active = flatten(getByText("Geofences").props.style)
    expect(active.color).toBe(lightColors.primary)
    expect(active.fontFamily).toBe(`${fontFamily}-SemiBold`)
    expect(flatten(getByText("Dashboard").props.style).color).toBe(lightColors.textSecondary)
  })

  // The label grows with the font scale instead of being clipped to one line, so the bar
  // has to be free to grow with it: a fixed height is what breaks at 2.0x.
  it("lets the labels wrap and grows from the row height plus the gesture inset", () => {
    const { getByText, getByTestId } = render(<BottomTabBar currentRoute="Dashboard" onNavigate={jest.fn()} />)

    expect(getByText("History").props.numberOfLines).toBe(2)
    expect(flatten(getByTestId("bottom-tab-bar").props.style).minHeight).toBe(size.row + 16)
  })

  it("navigates to the route behind the item", () => {
    const onNavigate = jest.fn()
    const { getByRole } = render(<BottomTabBar currentRoute="Dashboard" onNavigate={onNavigate} />)

    fireEvent.press(getByRole("tab", { name: "History" }))

    expect(onNavigate).toHaveBeenCalledWith("Location History")
  })
})
