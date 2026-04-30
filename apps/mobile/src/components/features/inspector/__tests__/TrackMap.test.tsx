import React from "react"
import { render, act } from "@testing-library/react-native"
import { TrackMap } from "../TrackMap"

const mockFitBounds = jest.fn()

jest.mock("../../map/ColotaMapView", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    __esModule: true,
    ColotaMapView: R.forwardRef(function MockColotaMapView(props: any, ref: any) {
      const onMapReady = props.onMapReady
      R.useImperativeHandle(ref, () => ({
        camera: { fitBounds: mockFitBounds },
        mapView: null
      }))
      R.useEffect(() => {
        onMapReady?.()
      }, [onMapReady])
      return R.createElement(View, { testID: "MockColotaMapView" }, props.children)
    })
  }
})

jest.mock("@maplibre/maplibre-react-native", () => {
  const R = require("react")
  const { View } = require("react-native")
  const stub = (name: string) => {
    const Stub = (props: any) => R.createElement(View, { testID: name }, props.children)
    Stub.displayName = name
    return Stub
  }
  return {
    GeoJSONSource: stub("GeoJSONSource"),
    Layer: stub("Layer")
  }
})

jest.mock("../../map/MapCenterButton", () => ({
  MapCenterButton: () => null
}))

jest.mock("../../../../styles/typography", () => ({
  fonts: { regular: {}, bold: {}, semiBold: {} }
}))

jest.mock("../../../../utils/geo", () => ({
  getSpeedUnit: () => ({ factor: 3.6, unit: "km/h" })
}))

jest.mock("../../../../utils/trips", () => ({
  getTripColor: () => "#000"
}))

const colors = {
  primary: "#00f",
  card: "#fff",
  border: "#ccc",
  text: "#000",
  textSecondary: "#666",
  borderRadius: 8,
  pressedOpacity: 0.6
} as any

const loc = (lat: number, lon: number) => ({
  latitude: lat,
  longitude: lon,
  accuracy: 5,
  timestamp: 1000,
  altitude: 100,
  speed: 0,
  bearing: 0,
  battery: 80,
  battery_status: 2
})

describe("TrackMap auto-fit", () => {
  beforeEach(() => {
    mockFitBounds.mockClear()
    jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb: any) => {
      cb(0)
      return 0
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("fits bounds when switching from empty day to non-empty day", () => {
    const locsA = [loc(48.1, 11.5), loc(48.2, 11.6)]
    const locsB = [loc(52.5, 13.4), loc(52.6, 13.5)]

    const { rerender } = render(<TrackMap locations={locsA} colors={colors} fitVersion={1} />)
    expect(mockFitBounds).toHaveBeenCalledTimes(1)

    // Switch to empty day
    act(() => {
      rerender(<TrackMap locations={[]} colors={colors} fitVersion={2} />)
    })
    expect(mockFitBounds).toHaveBeenCalledTimes(1) // no new fit on empty

    // Switch to another non-empty day - the regression target
    act(() => {
      rerender(<TrackMap locations={locsB} colors={colors} fitVersion={3} />)
    })
    expect(mockFitBounds).toHaveBeenCalledTimes(2)
  })
})
