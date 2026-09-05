/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { render, fireEvent, waitFor } from "@testing-library/react-native"

// --- Mocks ---

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: require("@colota/shared").lightColors,
    mode: "light"
  })
}))

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 })
}))

const mockCoords = jest.fn().mockReturnValue(null)

jest.mock("../../contexts/TrackingProvider", () => ({
  useCoords: () => mockCoords()
}))

const mockGetMostRecentLocation = jest.fn().mockResolvedValue(null)

jest.mock("../../services/NativeLocationService", () => ({
  __esModule: true,
  default: {
    getMostRecentLocation: (...args: any[]) => mockGetMostRecentLocation(...args)
  }
}))

jest.mock("../../components/features/map/ColotaMapView", () => {
  const R = require("react")
  const { View, Pressable } = require("react-native")
  return {
    ColotaMapView: ({ children, onPress, initialCenter, initialZoom }: any) =>
      R.createElement(
        View,
        { testID: "colota-map", initialCenter, initialZoom },
        R.createElement(Pressable, {
          testID: "map-surface",
          onPress: () => onPress({ latitude: 48.4, longitude: 11.7 })
        }),
        children
      )
  }
})

jest.mock("../../components/features/map/GeofenceLayers", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    GeofenceLayers: () => R.createElement(View, { testID: "geofence-layers" })
  }
})

const mockBuildGeofencesGeoJSON = jest.fn().mockReturnValue({ fills: null, labels: null })

jest.mock("../../components/features/map/mapUtils", () => ({
  buildGeofencesGeoJSON: (...args: any[]) => mockBuildGeofencesGeoJSON(...args)
}))

jest.mock("../../components", () => {
  const R = require("react")
  const { View, Text, Pressable } = require("react-native")
  return {
    Container: ({ children }: any) => R.createElement(View, null, children),
    MapOverlay: ({ children, testID }: any) => R.createElement(View, { testID }, children),
    Button: ({ title, onPress, testID }: any) =>
      R.createElement(Pressable, { testID, onPress }, R.createElement(Text, null, title))
  }
})

jest.mock("../../utils/logger", () => ({
  logger: { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() }
}))

import { GeofencePlacementScreen } from "../GeofencePlacementScreen"

const mockNavigate = jest.fn()
const mockNavigation = { navigate: mockNavigate }

function renderScreen(params: Record<string, unknown> = { radius: 50 }) {
  return render(<GeofencePlacementScreen navigation={mockNavigation as any} route={{ params } as any} />)
}

// --- Tests ---

describe("GeofencePlacementScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCoords.mockReturnValue(null)
    mockGetMostRecentLocation.mockResolvedValue(null)
    mockBuildGeofencesGeoJSON.mockReturnValue({ fills: null, labels: null })
  })

  it("asks for a tap before anything is placed and offers nothing to confirm", async () => {
    const { getByText, queryByTestId } = renderScreen()

    await waitFor(() => {
      expect(getByText("Tap the map to place the zone centre")).toBeTruthy()
    })

    expect(queryByTestId("confirm-placement-btn")).toBeNull()
  })

  it("opens on the zone's own centre when it already has one", async () => {
    const { getByTestId } = renderScreen({ radius: 50, lat: 48.1, lon: 11.5 })

    await waitFor(() => {
      expect(getByTestId("colota-map")).toBeTruthy()
    })

    expect(getByTestId("colota-map").props.initialCenter).toEqual([11.5, 48.1])
  })

  it("falls back to the last known location when the zone has no centre yet", async () => {
    mockGetMostRecentLocation.mockResolvedValue({ latitude: 48.2, longitude: 11.6, accuracy: 5 })

    const { getByTestId } = renderScreen()

    await waitFor(() => {
      expect(getByTestId("colota-map")).toBeTruthy()
    })

    expect(getByTestId("colota-map").props.initialCenter).toEqual([11.6, 48.2])
  })

  // The circle is the whole point of the step: it shows the radius the user typed, at the tap.
  it("draws the zone at the tapped point with the draft's radius", async () => {
    const { getByTestId } = renderScreen({ radius: 120, name: "Allotment" })

    await waitFor(() => {
      expect(getByTestId("map-surface")).toBeTruthy()
    })

    fireEvent.press(getByTestId("map-surface"))

    await waitFor(() => {
      expect(getByTestId("geofence-layers")).toBeTruthy()
    })

    expect(mockBuildGeofencesGeoJSON).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "Allotment", lat: 48.4, lon: 11.7, radius: 120 })],
      expect.anything()
    )
  })

  // merge, or a zone being edited loses the id it is saving back to.
  it("hands the point back to the editor without replacing its other params", async () => {
    const { getByTestId } = renderScreen()

    await waitFor(() => {
      expect(getByTestId("map-surface")).toBeTruthy()
    })

    fireEvent.press(getByTestId("map-surface"))

    await waitFor(() => {
      expect(getByTestId("confirm-placement-btn")).toBeTruthy()
    })

    fireEvent.press(getByTestId("confirm-placement-btn"))

    expect(mockNavigate).toHaveBeenCalledWith("Geofence Editor", { lat: 48.4, lon: 11.7 }, { merge: true })
  })

  it("says the point can be moved once one is placed", async () => {
    const { getByTestId, getByText } = renderScreen()

    await waitFor(() => {
      expect(getByTestId("map-surface")).toBeTruthy()
    })

    fireEvent.press(getByTestId("map-surface"))

    await waitFor(() => {
      expect(getByText("Tap again to move the centre")).toBeTruthy()
    })
  })
})
