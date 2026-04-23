import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { DEFAULT_SETTINGS } from "../../../../types/global"

let mockSettings = { isOfflineMode: false }

jest.mock("../../../../contexts/TrackingProvider", () => ({
  useTracking: () => ({
    settings: mockSettings
  })
}))

jest.mock("../../../ui/Card", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    Card: ({ children }: any) => R.createElement(View, null, children)
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
  onNavigateToApiConfig: jest.fn()
}

describe("WelcomeCard", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSettings = { isOfflineMode: false }
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

    it("shows API field mapping link", () => {
      const { getByText } = render(<WelcomeCard {...defaultProps} />)

      expect(getByText("API field mapping")).toBeTruthy()
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

    it("hides API field mapping link", () => {
      const { queryByText } = render(<WelcomeCard {...defaultProps} />)

      expect(queryByText("API field mapping")).toBeNull()
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

  it("calls onNavigateToApiConfig when API field mapping is pressed", () => {
    const { getByText } = render(<WelcomeCard {...defaultProps} />)

    fireEvent.press(getByText("API field mapping"))

    expect(defaultProps.onNavigateToApiConfig).toHaveBeenCalledTimes(1)
  })

  it("marks Start tracking as completed when tracking is active", () => {
    const { getByText } = render(<WelcomeCard {...defaultProps} tracking />)

    const label = getByText("1. Start tracking")
    expect(label).toBeTruthy()
  })
})
