import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import { GeofenceLayers } from "../GeofenceLayers"

jest.mock("@maplibre/maplibre-react-native", () => {
  const R = require("react")
  const { View, Pressable } = require("react-native")
  return {
    GeoJSONSource: ({ children, id, onPress, hitbox }: any) =>
      R.createElement(
        View,
        { testID: id, hitbox },
        onPress &&
          R.createElement(Pressable, {
            testID: `${id}-press`,
            onPress: () =>
              onPress({
                nativeEvent: {
                  features: [
                    {
                      type: "Feature",
                      properties: { id: 1, radius: 500 },
                      geometry: { type: "Point", coordinates: [0, 0] }
                    },
                    {
                      type: "Feature",
                      properties: { id: 2, radius: 50 },
                      geometry: { type: "Point", coordinates: [0, 0] }
                    }
                  ]
                }
              })
          }),
        children
      ),
    Layer: ({ id }: any) => R.createElement(View, { testID: id })
  }
})

const feature = (id: number) => ({
  type: "Feature" as const,
  properties: {
    id,
    name: `Z${id}`,
    fillColor: "#000",
    fillOpacity: 0.3,
    strokeColor: "#000",
    pauseTracking: true,
    radius: id
  },
  geometry: { type: "Point" as const, coordinates: [0, 0] }
})
const fills = { type: "FeatureCollection" as const, features: [feature(1), feature(2)] }
const labels = { type: "FeatureCollection" as const, features: [] }

describe("GeofenceLayers", () => {
  it("stays a drawing without a handler, so the Dashboard and Place Zone maps take no taps", () => {
    const { getByTestId, queryByTestId } = render(<GeofenceLayers fills={fills} labels={labels} haloColor="#fff" />)

    expect(getByTestId("geofence-fills").props.hitbox).toBeUndefined()
    expect(queryByTestId("geofence-fills-press")).toBeNull()
  })

  it("hands the smallest circle under the finger to the screen with a 48 dp target when asked to", () => {
    const onPressZone = jest.fn()
    const { getByTestId } = render(
      <GeofenceLayers fills={fills} labels={labels} haloColor="#fff" onPressZone={onPressZone} />
    )

    expect(getByTestId("geofence-fills").props.hitbox).toEqual({ top: 24, right: 24, bottom: 24, left: 24 })
    fireEvent.press(getByTestId("geofence-fills-press"))
    expect(onPressZone).toHaveBeenCalledWith(2)
  })
})
