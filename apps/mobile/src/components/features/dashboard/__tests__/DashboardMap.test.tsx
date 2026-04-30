import React from "react"
import { render } from "@testing-library/react-native"

jest.mock("@maplibre/maplibre-react-native", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    __esModule: true,
    Map: (props: any) => R.createElement(View, { testID: "mapview", ...props }),
    Camera: () => null,
    GeoJSONSource: ({ children }: any) => children,
    Layer: () => null,
    Marker: ({ children }: any) => children
  }
})

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn(),
  useIsFocused: () => true
}))

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      primary: "#0d9488",
      text: "#000",
      textSecondary: "#6b7280",
      textDisabled: "#d1d5db",
      card: "#fff",
      warning: "#f59e0b",
      info: "#3b82f6",
      background: "#fff",
      border: "#e5e7eb",
      borderRadius: 12,
      success: "#22c55e",
      error: "#ef4444",
      link: "#0d9488",
      textLight: "#9ca3af"
    },
    mode: "light"
  })
}))

jest.mock("../../../../services/NativeLocationService", () => ({
  isNetworkAvailable: jest.fn().mockResolvedValue(true),
  getGeofences: jest.fn().mockResolvedValue([]),
  checkCurrentPauseZone: jest.fn().mockResolvedValue(null),
  getMostRecentLocation: jest.fn().mockResolvedValue(null),
  getSetting: jest.fn().mockResolvedValue(null)
}))

let mockCoords: { latitude: number; longitude: number; accuracy: number } | null = {
  latitude: 48.1,
  longitude: 11.5,
  accuracy: 10
}
jest.mock("../../../../contexts/TrackingProvider", () => ({
  useCoords: () => mockCoords
}))

jest.mock("../../../../hooks/useTodayTrack", () => ({
  useTodayTrack: () => ({ locations: [], version: 0 })
}))

jest.mock("../../../../assets/icons/icon.png", () => "mock-icon")

jest.mock("../../map/MapCenterButton", () => {
  const R = require("react")
  const { View } = require("react-native")
  return { MapCenterButton: () => R.createElement(View, { testID: "center-button" }) }
})

import { DashboardMap } from "../DashboardMap"

describe("DashboardMap info cards", () => {
  beforeEach(() => {
    mockCoords = { latitude: 48.1, longitude: 11.5, accuracy: 10 }
  })

  const baseProps = {
    tracking: true,
    activeZoneName: null as string | null,
    pauseReason: null as string | null,
    activeProfileName: null as string | null,
    isBatteryCritical: false,
    locationEnabled: true
  }

  it("shows profile name when activeProfileName is set and no pause zone", () => {
    const { getByText } = render(<DashboardMap {...baseProps} activeProfileName="Charging" />)

    expect(getByText("Charging")).toBeTruthy()
  })

  it("hides profile indicator when no profile is active", () => {
    const { queryByText } = render(<DashboardMap {...baseProps} activeProfileName={null} />)

    expect(queryByText("Charging")).toBeNull()
  })

  it("shows pause zone indicator when inside a pause zone", () => {
    const { getByText } = render(<DashboardMap {...baseProps} activeZoneName="Home" />)

    expect(getByText(/Paused in Home/)).toBeTruthy()
  })

  it("shows pause zone indicator when both pause zone and profile are active", () => {
    const { getByText, queryByText } = render(
      <DashboardMap {...baseProps} activeZoneName="Home" activeProfileName="Charging" />
    )

    expect(getByText(/Paused in Home/)).toBeTruthy()
    expect(queryByText("Charging")).toBeNull()
  })

  it("hides standalone profile indicator when pause zone is active", () => {
    const { queryByText } = render(<DashboardMap {...baseProps} activeZoneName="Office" activeProfileName="Charging" />)

    expect(queryByText("Charging")).toBeNull()
  })

  it("shows pause zone indicator without profile in pause zone", () => {
    const { getByText } = render(<DashboardMap {...baseProps} activeZoneName="Home" activeProfileName={null} />)

    expect(getByText(/Paused in Home/)).toBeTruthy()
  })

  it("shows Tracking Disabled when not tracking", () => {
    const { getByText } = render(<DashboardMap {...baseProps} tracking={false} />)

    expect(getByText("Tracking Disabled")).toBeTruthy()
  })

  it("shows battery critical message when not tracking and battery is critical", () => {
    const { getByText } = render(<DashboardMap {...baseProps} tracking={false} isBatteryCritical={true} />)

    expect(getByText("Tracking Stopped")).toBeTruthy()
    expect(getByText("Battery critically low. Charge your device to resume.")).toBeTruthy()
  })

  it("shows normal disabled message when not tracking and battery is fine", () => {
    const { getByText } = render(<DashboardMap {...baseProps} tracking={false} isBatteryCritical={false} />)

    expect(getByText("Tracking Disabled")).toBeTruthy()
    expect(getByText("Start tracking to see the map.")).toBeTruthy()
  })

  it("shows Location Services Off overlay when tracking but location services are off", () => {
    mockCoords = null
    const { getByText, queryByText } = render(<DashboardMap {...baseProps} locationEnabled={false} />)

    expect(getByText("Location Services Off")).toBeTruthy()
    expect(getByText(/Tap to open Settings/)).toBeTruthy()
    // The Searching GPS spinner overlay should NOT show simultaneously
    expect(queryByText("Searching GPS...")).toBeNull()
  })

  it("shows Searching GPS overlay when tracking and location services are on but no fix yet", () => {
    mockCoords = null
    const { getByText, queryByText } = render(<DashboardMap {...baseProps} locationEnabled={true} />)

    expect(getByText("Searching GPS...")).toBeTruthy()
    expect(queryByText("Location Services Off")).toBeNull()
  })

  it("shows location-off status bar when tracking with cached coords but location services off", () => {
    // Coords are valid (cached from before location was disabled), so the full
    // overlay doesn't fire - the slim status bar at the top of the map does.
    const { getByText, queryByText } = render(
      <DashboardMap {...baseProps} activeProfileName="Charging" locationEnabled={false} />
    )

    expect(getByText("Location off - tap to enable")).toBeTruthy()
    // Profile chip is hidden while location is off (location-off takes priority)
    expect(queryByText("Charging")).toBeNull()
    // Full-screen overlay should NOT show because we have valid coords
    expect(queryByText("Location Services Off")).toBeNull()
  })

  it("hides profile and pause-zone chips when location services are off", () => {
    const { queryByText } = render(
      <DashboardMap {...baseProps} activeZoneName="Home" activeProfileName="Charging" locationEnabled={false} />
    )

    expect(queryByText(/Paused in Home/)).toBeNull()
    expect(queryByText("Charging")).toBeNull()
  })
})
