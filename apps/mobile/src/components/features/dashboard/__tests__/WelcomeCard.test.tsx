import React from "react"
import { StyleSheet, View as RNView } from "react-native"
import { render, fireEvent, within } from "@testing-library/react-native"
import { DEFAULT_SETTINGS } from "../../../../types/global"
import { size } from "../../../../constants"

let mockSettings = { isOfflineMode: false }

jest.mock("../../../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings
  })
}))

// Button reads the theme itself, unlike WelcomeCard, which takes colors as a prop.
jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors })
}))

jest.mock("../../../ui/Card", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    Card: ({ children, variant, style }: any) =>
      R.createElement(View, { testID: "welcome-card", variant, style }, children)
  }
})

jest.mock("lucide-react-native", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    Check: () => R.createElement(View, null),
    ChevronRight: () => R.createElement(View, null)
  }
})

import { WelcomeCard } from "../WelcomeCard"

const mockColors = {
  primary: "#0d9488",
  primaryDark: "#115E59",
  text: "#000",
  textSecondary: "#6b7280",
  textLight: "#9ca3af",
  success: "#22c55e",
  link: "#0d9488",
  border: "#e5e7eb"
} as any

const defaultProps = {
  settings: DEFAULT_SETTINGS,
  tracking: false,
  colors: mockColors,
  onDismiss: jest.fn(),
  onStartTracking: jest.fn(),
  onNavigateToConnection: jest.fn(),
  onNavigateToTrackingSync: jest.fn(),
  onNavigateToRequestFormat: jest.fn()
}

describe("WelcomeCard", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSettings = { isOfflineMode: false }
  })

  it("sits over map tiles as an elevated surface with no border of its own", () => {
    const { getByTestId } = render(<WelcomeCard {...defaultProps} />)

    const card = getByTestId("welcome-card")
    expect(card.props.variant).toBe("elevated")
    expect(StyleSheet.flatten(card.props.style)?.borderColor).toBeUndefined()
  })

  it("colours its links with the link token, because primaryDark fails 4.5 on the elevated surface in dark mode", () => {
    const { getByText } = render(<WelcomeCard {...defaultProps} />)

    expect(StyleSheet.flatten(getByText("Request format").props.style).color).toBe(mockColors.link)
    expect(StyleSheet.flatten(getByText("Tracking presets").props.style).color).toBe(mockColors.link)
  })

  it("gives every checklist row and text link the 48 touch height, since a bare text line is too short to hit", () => {
    const { getByRole } = render(<WelcomeCard {...defaultProps} />)

    const row = getByRole("button", { name: "2. Configure your server endpoint" })
    expect(StyleSheet.flatten(within(row).UNSAFE_getAllByType(RNView)[0].props.style).minHeight).toBe(size.touch)
    expect(StyleSheet.flatten(getByRole("button", { name: "Request format" }).props.style).minHeight).toBe(size.touch)
    expect(StyleSheet.flatten(getByRole("button", { name: "Tracking presets" }).props.style).minHeight).toBe(size.touch)
  })

  it("renders welcome title and subtitle", () => {
    const { getByText } = render(<WelcomeCard {...defaultProps} />)

    expect(getByText("Welcome to Colota")).toBeTruthy()
    expect(getByText("Get started by completing these steps:")).toBeTruthy()
  })

  it("shows Start tracking checklist item", () => {
    const { getByText } = render(<WelcomeCard {...defaultProps} />)

    expect(getByText("1. Start tracking")).toBeTruthy()
  })

  describe("online mode (default)", () => {
    it("shows server endpoint checklist item", () => {
      const { getByText } = render(<WelcomeCard {...defaultProps} />)

      expect(getByText("2. Configure your server endpoint")).toBeTruthy()
    })

    it("shows the request format link", () => {
      const { getByText } = render(<WelcomeCard {...defaultProps} />)

      expect(getByText("Request format")).toBeTruthy()
    })

    it("shows Tracking presets link", () => {
      const { getByText } = render(<WelcomeCard {...defaultProps} />)

      expect(getByText("Tracking presets")).toBeTruthy()
    })
  })

  describe("offline mode", () => {
    beforeEach(() => {
      mockSettings = { isOfflineMode: true }
    })

    it("hides server endpoint checklist item", () => {
      const { queryByText } = render(<WelcomeCard {...defaultProps} />)

      expect(queryByText("2. Configure your server endpoint")).toBeNull()
    })

    it("hides the request format link", () => {
      const { queryByText } = render(<WelcomeCard {...defaultProps} />)

      expect(queryByText("Request format")).toBeNull()
    })

    it("still shows Tracking presets link", () => {
      const { getByText } = render(<WelcomeCard {...defaultProps} />)

      expect(getByText("Tracking presets")).toBeTruthy()
    })

    it("still shows Start tracking checklist item", () => {
      const { getByText } = render(<WelcomeCard {...defaultProps} />)

      expect(getByText("1. Start tracking")).toBeTruthy()
    })
  })

  it("calls onDismiss when Got it is pressed", () => {
    const { getByText } = render(<WelcomeCard {...defaultProps} />)

    fireEvent.press(getByText("Got it"))

    expect(defaultProps.onDismiss).toHaveBeenCalledTimes(1)
  })

  it("calls onNavigateToTrackingSync when Tracking presets is pressed", () => {
    const { getByText } = render(<WelcomeCard {...defaultProps} />)

    fireEvent.press(getByText("Tracking presets"))

    expect(defaultProps.onNavigateToTrackingSync).toHaveBeenCalledTimes(1)
  })

  it("calls onNavigateToConnection when Configure your server endpoint is pressed", () => {
    const { getByText } = render(<WelcomeCard {...defaultProps} />)

    fireEvent.press(getByText("2. Configure your server endpoint"))

    expect(defaultProps.onNavigateToConnection).toHaveBeenCalledTimes(1)
  })

  it("calls onNavigateToRequestFormat when the request format link is pressed", () => {
    const { getByText } = render(<WelcomeCard {...defaultProps} />)

    fireEvent.press(getByText("Request format"))

    expect(defaultProps.onNavigateToRequestFormat).toHaveBeenCalledTimes(1)
  })

  it("marks Start tracking as completed when tracking is active", () => {
    const { getByText } = render(<WelcomeCard {...defaultProps} tracking />)

    const label = getByText("1. Start tracking")
    expect(label).toBeTruthy()
  })
})
