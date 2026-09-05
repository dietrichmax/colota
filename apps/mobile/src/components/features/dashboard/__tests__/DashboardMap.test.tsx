import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"

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

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 })
}))

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn(),
  useIsFocused: () => true
}))

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: require("@colota/shared").lightColors,
    mode: "light"
  })
}))

const mockOpenLocationSettings = jest.fn().mockResolvedValue(true)
const mockSaveSetting = jest.fn().mockResolvedValue(undefined)
jest.mock("../../../../services/NativeLocationService", () => ({
  isNetworkAvailable: jest.fn().mockResolvedValue(true),
  getGeofences: jest.fn().mockResolvedValue([]),
  checkCurrentPauseZone: jest.fn().mockResolvedValue(null),
  getMostRecentLocation: jest.fn().mockResolvedValue(null),
  getSetting: jest.fn().mockResolvedValue("true"),
  saveSetting: (...args: unknown[]) => mockSaveSetting(...args),
  openLocationSettings: (...args: unknown[]) => mockOpenLocationSettings(...args)
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

import { DashboardMap } from "../DashboardMap"

describe("DashboardMap", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCoords = { latitude: 48.1, longitude: 11.5, accuracy: 10 }
  })

  const baseProps = {
    tracking: true,
    activeZoneName: null as string | null,
    pauseReason: null as string | null,
    activeProfileName: null as string | null,
    isBatteryCritical: false,
    locationEnabled: true,
    interval: 5
  }

  describe("state chip", () => {
    // The chip is the only place the running state is said on the map, so each state has to
    // reach it; the alpha status strips it replaced could stack, this one cannot.
    it("names the interval while tracking with no profile", () => {
      const { getByText } = render(<DashboardMap {...baseProps} />)

      expect(getByText("Tracking · every 5 s")).toBeTruthy()
    })

    it("names the active profile beside the interval", () => {
      const { getByText } = render(<DashboardMap {...baseProps} activeProfileName="Charging" />)

      expect(getByText("Tracking · Charging · every 5 s")).toBeTruthy()
    })

    it("is absent when tracking is off, because the Start pill already says so", () => {
      const { queryByTestId } = render(<DashboardMap {...baseProps} tracking={false} />)

      expect(queryByTestId("map-state-chip")).toBeNull()
    })

    it("says the zone and the reason while paused", () => {
      const { getByText } = render(<DashboardMap {...baseProps} activeZoneName="Home" pauseReason="wifi" />)

      expect(getByText("Paused · Home · WiFi")).toBeTruthy()
    })

    it("names the zone alone when the pause has no reason", () => {
      const { getByText } = render(<DashboardMap {...baseProps} activeZoneName="Home" />)

      expect(getByText("Paused · Home")).toBeTruthy()
    })

    it("waits for a fix rather than claiming a rate it is not recording at", () => {
      mockCoords = null
      const { getByText, queryByText } = render(<DashboardMap {...baseProps} />)

      expect(getByText("Waiting for GPS")).toBeTruthy()
      expect(queryByText("Tracking · every 5 s")).toBeNull()
    })

    it("reports location services off ahead of every other state and opens the settings", () => {
      const { getByText, getByRole } = render(
        <DashboardMap {...baseProps} activeZoneName="Home" activeProfileName="Charging" locationEnabled={false} />
      )

      expect(getByText("Location services off")).toBeTruthy()
      fireEvent.press(getByRole("button", { name: "Location services off" }))
      expect(mockOpenLocationSettings).toHaveBeenCalled()
    })
  })

  describe("empty map", () => {
    it("explains a stopped tracker with no fix to draw", () => {
      mockCoords = null
      const { getByText } = render(<DashboardMap {...baseProps} tracking={false} />)

      expect(getByText("Tracking is off")).toBeTruthy()
    })

    it("blames the battery when that is what stopped it", () => {
      mockCoords = null
      const { getByText } = render(<DashboardMap {...baseProps} tracking={false} isBatteryCritical />)

      expect(getByText("Tracking stopped")).toBeTruthy()
    })

    it("keeps the last fix on screen after a stop instead of falling back to the empty state", () => {
      const { queryByTestId } = render(<DashboardMap {...baseProps} tracking={false} />)

      expect(queryByTestId("map-empty")).toBeNull()
    })
  })

  describe("controls", () => {
    it("carries the switch role and the checked state on the track toggle", async () => {
      const { getByTestId } = render(<DashboardMap {...baseProps} />)

      const toggle = await waitFor(() => getByTestId("track-toggle-btn"))
      expect(toggle.props.accessibilityRole).toBe("switch")
      expect(toggle.props.accessibilityState).toEqual({ checked: true })
      expect(toggle.props.accessibilityLabel).toBe("Hide my track")
    })

    it("persists the track toggle", async () => {
      const { getByTestId } = render(<DashboardMap {...baseProps} />)

      fireEvent.press(await waitFor(() => getByTestId("track-toggle-btn")))

      expect(mockSaveSetting).toHaveBeenCalledWith("showTrack", "false")
    })

    it("renders the controls outside the map so their elevation is not clipped", () => {
      const { getByTestId } = render(<DashboardMap {...baseProps} />)

      expect(getByTestId("map-controls")).toBeTruthy()
    })
  })
})
