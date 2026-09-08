import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { StyleSheet } from "react-native"
import { lightColors } from "@colota/shared"

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

import { DashboardBanner } from "../DashboardBanner"

const flat = (el: any) => StyleSheet.flatten(el.props.style)

const renderBanner = (condition: React.ComponentProps<typeof DashboardBanner>["condition"], onAction = jest.fn()) =>
  render(<DashboardBanner condition={condition} onAction={onAction} top={36} left={16} right={64} />)

describe("DashboardBanner", () => {
  it.each([
    ["permission", "Location permission missing", "Grant", "icon-CircleAlert", lightColors.error],
    ["background", "Background location not allowed", "Grant", "icon-CircleAlert", lightColors.error],
    ["locationOff", "Location services are off", "Settings", "icon-TriangleAlert", lightColors.warning]
  ] as const)(
    "%s names the problem, offers its one fix and tints only the glyph",
    (condition, text, action, glyph, hue) => {
      const { getByText, getByRole, getByTestId } = renderBanner(condition)

      expect(getByText(text)).toBeTruthy()
      expect(getByRole("button", { name: action })).toBeTruthy()
      expect(getByTestId(glyph).props.color).toBe(hue)
    }
  )

  it("battery has no action because charging is the only fix", () => {
    const { getByText, queryByRole, getByTestId } = renderBanner("battery")

    expect(getByText("Battery critically low. Charge to track.")).toBeTruthy()
    expect(queryByRole("button")).toBeNull()
    expect(getByTestId("icon-BatteryWarning").props.color).toBe(lightColors.error)
  })

  it("carries the alert role without swallowing its button into one accessible node", () => {
    const { getByTestId, getByRole } = renderBanner("permission")

    const banner = getByTestId("dashboard-banner")
    expect(banner.props.accessibilityRole).toBe("alert")
    expect(banner.props.accessible).toBeUndefined()
    expect(getByRole("button", { name: "Grant" })).toBeTruthy()
  })

  it("is a live region, so TalkBack announces a warning that appears while the user is elsewhere on the screen", () => {
    const { getByTestId } = renderBanner("locationOff")

    expect(getByTestId("dashboard-banner").props.accessibilityLiveRegion).toBe("polite")
  })

  it("reports its height to the screen, which lifts the camera padding by it", () => {
    const onLayout = jest.fn()
    const { getByTestId } = render(
      <DashboardBanner condition="permission" onAction={jest.fn()} top={36} left={16} right={16} onLayout={onLayout} />
    )

    fireEvent(getByTestId("dashboard-banner"), "layout", { nativeEvent: { layout: { height: 56 } } })

    expect(onLayout).toHaveBeenCalledWith(expect.objectContaining({ nativeEvent: { layout: { height: 56 } } }))
  })

  it("keeps the hue on the glyph, because white on the dark-mode semantic hues fails 4.5:1", () => {
    const { getByTestId } = renderBanner("locationOff")

    const style = flat(getByTestId("dashboard-banner"))
    expect(style.backgroundColor).toBe(lightColors.card)
    expect(style.backgroundColor).not.toBe(lightColors.warning)
  })

  it("labels its button in the primary hue, because the ghost default fails 4.5 on the elevated fill in dark mode", () => {
    const { getByText } = renderBanner("permission")

    expect(flat(getByText("Grant")).color).toBe(lightColors.primary)
  })

  it("sits where the screen puts it, below the status inset and inside the side insets", () => {
    const { getByTestId } = renderBanner("permission")

    const style = flat(getByTestId("dashboard-banner"))
    expect(style.top).toBe(36)
    expect(style.left).toBe(16)
    expect(style.right).toBe(64)
  })

  it("runs the action the screen handed it", () => {
    const onAction = jest.fn()
    const { getByRole } = renderBanner("locationOff", onAction)

    fireEvent.press(getByRole("button", { name: "Settings" }))

    expect(onAction).toHaveBeenCalledTimes(1)
  })
})
