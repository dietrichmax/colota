import React from "react"
import { render } from "@testing-library/react-native"

jest.mock("@maplibre/maplibre-react-native", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    __esModule: true,
    default: { setAccessToken: jest.fn() },
    MapView: (props: any) => R.createElement(View, { testID: "mapview", ...props }),
    Camera: () => null,
    ShapeSource: ({ children }: any) => children,
    FillLayer: () => null,
    LineLayer: () => null,
    SymbolLayer: () => null,
    CircleLayer: () => null,
    MarkerView: ({ children }: any) => children
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

const mockCoords = { latitude: 48.1, longitude: 11.5, accuracy: 10 }
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
  const baseProps = {
    tracking: true,
    activeZoneName: null as string | null,
    pauseReason: null as string | null,
    activeProfileName: null as string | null,
    isBatteryCritical: false
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
})
