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
  useFocusEffect: jest.fn()
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
  getMostRecentLocation: jest.fn().mockResolvedValue(null)
}))

jest.mock("../../../../assets/icons/icon.png", () => "mock-icon")

jest.mock("../../map/MapCenterButton", () => {
  const R = require("react")
  const { View } = require("react-native")
  return { MapCenterButton: () => R.createElement(View, { testID: "center-button" }) }
})

import { DashboardMap } from "../DashboardMap"

describe("DashboardMap info cards", () => {
  const validCoords = { latitude: 48.1, longitude: 11.5, accuracy: 10 }

  const baseProps = {
    coords: validCoords,
    tracking: true,
    activeZoneName: null as string | null,
    activeProfileName: null as string | null
  }

  it("shows profile card when activeProfileName is set and no pause zone", () => {
    const { getByText } = render(<DashboardMap {...baseProps} activeProfileName="Charging" />)

    expect(getByText("Profile: Charging")).toBeTruthy()
    expect(getByText("Tracking settings adjusted")).toBeTruthy()
  })

  it("hides profile card when no profile is active", () => {
    const { queryByText } = render(<DashboardMap {...baseProps} activeProfileName={null} />)

    expect(queryByText(/^Profile:/)).toBeNull()
  })

  it("shows pause zone card when inside a pause zone", () => {
    const { getByText } = render(<DashboardMap {...baseProps} activeZoneName="Home" />)

    expect(getByText("Paused in Home")).toBeTruthy()
    expect(getByText("Location not being recorded")).toBeTruthy()
  })

  it("shows combined card when both pause zone and profile are active", () => {
    const { getByText, queryByText } = render(
      <DashboardMap {...baseProps} activeZoneName="Home" activeProfileName="Charging" />
    )

    expect(getByText("Paused in Home")).toBeTruthy()
    expect(getByText('Profile "Charging" resumes on exit')).toBeTruthy()
    expect(queryByText("Tracking settings adjusted")).toBeNull()
  })

  it("hides standalone profile card when pause zone is active", () => {
    const { queryByText } = render(<DashboardMap {...baseProps} activeZoneName="Office" activeProfileName="Charging" />)

    expect(queryByText("Profile: Charging")).toBeNull()
    expect(queryByText('Profile "Charging" resumes on exit')).toBeTruthy()
  })

  it("shows default pause message when no profile active in pause zone", () => {
    const { getByText } = render(<DashboardMap {...baseProps} activeZoneName="Home" activeProfileName={null} />)

    expect(getByText("Location not being recorded")).toBeTruthy()
  })

  it("shows Tracking Disabled when not tracking", () => {
    const { getByText } = render(<DashboardMap {...baseProps} tracking={false} coords={null} />)

    expect(getByText("Tracking Disabled")).toBeTruthy()
  })
})
