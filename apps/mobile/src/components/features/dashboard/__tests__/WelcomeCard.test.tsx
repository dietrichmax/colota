import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { DEFAULT_SETTINGS } from "../../../../types/global"

let mockSettings = { isOfflineMode: false }

jest.mock("../../../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings
  })
}))

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: require("@colota/shared").lightColors
  })
}))

import { WelcomeCard } from "../WelcomeCard"

const defaultProps = {
  settings: DEFAULT_SETTINGS,
  tracking: false,
  onDismiss: jest.fn(),
  onStartTracking: jest.fn(),
  onNavigateToConnection: jest.fn(),
  onNavigateToTrackingSync: jest.fn(),
  onNavigateToApiConfig: jest.fn()
}

const leadingGlyph = (row: any) => {
  const icons = row.findAll(
    (node: any) => typeof node.props.testID === "string" && node.props.testID.startsWith("icon-")
  )
  return icons.length > 0 ? icons[0].props.testID : null
}

describe("WelcomeCard", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSettings = { isOfflineMode: false }
  })

  it("heads the checklist and offers a dismiss action", () => {
    const { getByText, getByTestId } = render(<WelcomeCard {...defaultProps} />)

    expect(getByText("Get started")).toBeTruthy()
    fireEvent.press(getByTestId("welcome-dismiss-btn"))
    expect(defaultProps.onDismiss).toHaveBeenCalledTimes(1)
  })

  // The check state has to survive a monochrome reading, so the glyph changes and not only the hue.
  it("marks a done step with a different glyph", () => {
    const { getByTestId, rerender } = render(<WelcomeCard {...defaultProps} />)

    expect(leadingGlyph(getByTestId("welcome-start-tracking"))).toBe("icon-Circle")

    rerender(<WelcomeCard {...defaultProps} tracking />)

    expect(leadingGlyph(getByTestId("welcome-start-tracking"))).toBe("icon-CircleCheckBig")
  })

  it("starts tracking from the first step while it is still open", () => {
    const { getByTestId } = render(<WelcomeCard {...defaultProps} />)

    fireEvent.press(getByTestId("welcome-start-tracking"))

    expect(defaultProps.onStartTracking).toHaveBeenCalledTimes(1)
  })

  describe("online mode (default)", () => {
    it("asks for the server endpoint and opens Connection", () => {
      const { getByText, getByTestId } = render(<WelcomeCard {...defaultProps} />)

      expect(getByText("Set your server endpoint")).toBeTruthy()
      fireEvent.press(getByTestId("welcome-endpoint"))
      expect(defaultProps.onNavigateToConnection).toHaveBeenCalledTimes(1)
    })

    it("marks the endpoint step done once one is configured", () => {
      const settings = { ...DEFAULT_SETTINGS, endpoint: "https://example.com/api" }
      const { getByTestId } = render(<WelcomeCard {...defaultProps} settings={settings} />)

      expect(leadingGlyph(getByTestId("welcome-endpoint"))).toBe("icon-CircleCheckBig")
    })

    it("opens API field mapping", () => {
      const { getByTestId } = render(<WelcomeCard {...defaultProps} />)

      fireEvent.press(getByTestId("welcome-api-mapping"))

      expect(defaultProps.onNavigateToApiConfig).toHaveBeenCalledTimes(1)
    })
  })

  describe("offline mode", () => {
    beforeEach(() => {
      mockSettings = { isOfflineMode: true }
    })

    it("drops both server steps, because there is no server to reach", () => {
      const { queryByTestId } = render(<WelcomeCard {...defaultProps} />)

      expect(queryByTestId("welcome-endpoint")).toBeNull()
      expect(queryByTestId("welcome-api-mapping")).toBeNull()
    })

    it("still offers tracking and the presets", () => {
      const { getByTestId } = render(<WelcomeCard {...defaultProps} />)

      expect(getByTestId("welcome-start-tracking")).toBeTruthy()
      expect(getByTestId("welcome-presets")).toBeTruthy()
    })
  })

  it("opens the tracking presets", () => {
    const { getByTestId } = render(<WelcomeCard {...defaultProps} />)

    fireEvent.press(getByTestId("welcome-presets"))

    expect(defaultProps.onNavigateToTrackingSync).toHaveBeenCalledTimes(1)
  })
})
