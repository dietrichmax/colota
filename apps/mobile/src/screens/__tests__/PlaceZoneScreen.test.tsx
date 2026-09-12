import React from "react"
import { render, fireEvent } from "@testing-library/react-native"

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: jest.requireActual("@colota/shared").lightColors })
}))

jest.mock("../../contexts/TrackingProvider", () => ({
  useCoords: () => ({ latitude: 52.5, longitude: 13.4 })
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    Button: ({ title, onPress, disabled }: any) =>
      R.createElement(
        Pressable,
        { testID: "use-location-btn", onPress, disabled, accessibilityState: { disabled } },
        R.createElement(Text, null, title)
      )
  }
})

jest.mock("../../components/features/map/ColotaMapView", () => {
  const R = require("react")
  const { View, Pressable } = require("react-native")
  return {
    ColotaMapView: R.forwardRef(({ children, onPress }: any, _ref: any) =>
      R.createElement(
        View,
        null,
        R.createElement(Pressable, {
          testID: "map-press",
          onPress: () => onPress?.({ latitude: 48.1, longitude: 11.6 })
        }),
        children
      )
    )
  }
})

jest.mock("../../components/features/map/GeofenceLayers", () => ({
  GeofenceLayers: () => null
}))

import { PlaceZoneScreen } from "../PlaceZoneScreen"
import { formatShortDistance } from "../../utils/geo"

function renderScreen(params: any = { name: "Home", radius: 100 }) {
  const popTo = jest.fn()
  const view = render(<PlaceZoneScreen navigation={{ popTo } as any} route={{ params } as any} />)
  return { ...view, popTo }
}

describe("PlaceZoneScreen", () => {
  it("cannot confirm until somewhere is picked", () => {
    const { getByTestId, getByText } = renderScreen()

    expect(getByTestId("use-location-btn").props.accessibilityState.disabled).toBe(true)
    expect(getByText("Tap the map to place the zone")).toBeTruthy()
  })

  it("reads the picked point back with the radius it will have", () => {
    const { getByTestId, getByText } = renderScreen()

    fireEvent.press(getByTestId("map-press"))

    expect(getByText(`48.10000, 11.60000 · ${formatShortDistance(100)} radius`)).toBeTruthy()
  })

  it("merges the coordinate into the editor rather than opening a second one", () => {
    const { getByTestId, popTo } = renderScreen()

    fireEvent.press(getByTestId("map-press"))
    fireEvent.press(getByTestId("use-location-btn"))

    expect(popTo).toHaveBeenCalledWith("Geofence Editor", { lat: 48.1, lon: 11.6 }, { merge: true })
  })

  it("opens on the zone being edited, not the user, when it already has a place", () => {
    const { getByText } = renderScreen({ name: "Home", radius: 50, lat: 40.7, lon: -74 })

    expect(getByText(`40.70000, -74.00000 · ${formatShortDistance(50)} radius`)).toBeTruthy()
  })
})
