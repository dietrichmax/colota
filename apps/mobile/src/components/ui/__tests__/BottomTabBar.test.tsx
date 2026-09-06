import React from "react"
import { render } from "@testing-library/react-native"

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}))

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { lightColors } from "@colota/shared"
import { BottomTabBar, TAB_ROUTES } from "../BottomTabBar"

function renderBar(currentRoute: string | undefined) {
  return render(<BottomTabBar currentRoute={currentRoute} onNavigate={jest.fn()} />)
}

describe("BottomTabBar", () => {
  it("hides itself off the four tab routes, so a pushed screen is not framed as one", () => {
    expect(renderBar("Connection").toJSON()).toBeNull()
    expect(renderBar(undefined).toJSON()).toBeNull()
    expect(renderBar("Dashboard").toJSON()).not.toBeNull()
  })

  it("marks the current tab selected, which is the whole announcement for a screen reader", () => {
    // Without accessibilityRole tab and a selected state TalkBack reads four plain buttons and
    // never says which screen you are on.
    const { getByLabelText } = renderBar("Geofences")

    expect(getByLabelText("Geofences").props.accessibilityRole).toBe("tab")
    expect(getByLabelText("Geofences").props.accessibilityState.selected).toBe(true)
    expect(getByLabelText("Dashboard").props.accessibilityState.selected).toBe(false)
  })

  it("weights the active glyph, because the icon set has no filled variants to switch to", () => {
    const { getByLabelText } = renderBar("Dashboard")

    const active = getByLabelText("Dashboard").findByProps({ strokeWidth: 2.25 })
    expect(active).toBeTruthy()
    expect(getByLabelText("Geofences").findAllByProps({ strokeWidth: 2.25 })).toHaveLength(0)
  })

  it("colours the active tab with the accent and the rest with secondary ink", () => {
    const { getByText } = renderBar("Settings")

    expect(getByText("Settings").props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: lightColors.primary })])
    )
    expect(getByText("History").props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: lightColors.textSecondary })])
    )
  })

  it("lets a label wrap to two lines rather than truncate at a large font scale", () => {
    const { getByText } = renderBar("Dashboard")
    expect(getByText("Dashboard").props.numberOfLines).toBe(2)
  })

  it("exports the routes it covers, so App.tsx does not keep a second list", () => {
    expect(TAB_ROUTES).toEqual(new Set(["Dashboard", "Location History", "Geofences", "Settings"]))
  })
})
