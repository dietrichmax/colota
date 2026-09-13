import React from "react"
import { render, fireEvent, waitFor, act } from "@testing-library/react-native"
import { Linking, StyleSheet } from "react-native"
import { HIT_SLOP_SM, size, space, MAX_MAP_ZOOM, MAP_STYLE_URL_LIGHT } from "../../../../constants"

const mockSetStop = jest.fn()
const mockCameraProps = jest.fn()

jest.mock("@maplibre/maplibre-react-native", () => {
  const R = require("react")
  const { View } = require("react-native")
  return {
    __esModule: true,
    Map: (props: any) => R.createElement(View, { testID: "mapview", ...props }),
    Camera: R.forwardRef(function MockCamera(props: any, ref: any) {
      R.useImperativeHandle(ref, () => ({ setStop: mockSetStop }))
      mockCameraProps(props)
      return null
    })
  }
})

jest.mock("@react-navigation/native", () => ({
  useIsFocused: () => true
}))

jest.mock("../../../../hooks/useTheme", () => ({
  useTheme: () => ({ colors: require("@colota/shared").lightColors, mode: "light" })
}))

jest.mock("../../../../services/NativeLocationService", () => ({
  getSetting: jest.fn().mockResolvedValue(null)
}))

// The style fetch only feeds the attribution list; the fallback links are what the disc needs here.
;(globalThis as any).fetch = jest.fn(() => new Promise(() => {}))

import { ColotaMapView, attributionRole } from "../ColotaMapView"
import { MapActionButton, mapActionStyles } from "../MapActionButton"
import NativeLocationService from "../../../../services/NativeLocationService"

const padding = { top: 40, right: 64, bottom: 200, left: 16 }
const center: [number, number] = [11.5, 48.1]

function rotateMap(getByTestId: (id: string) => any) {
  fireEvent(getByTestId("mapview"), "regionDidChange", {
    nativeEvent: { bearing: 90, userInteraction: true, bounds: [0, 0, 1, 1] }
  })
}

// The disc's position lands on the wrapper that paints it, above the button a reader names.
function positionOf(node: any, key: "bottom" | "right"): number | undefined {
  for (let n = node; n; n = n.parent) {
    const value = StyleSheet.flatten(n.props.style)?.[key]
    if (value !== undefined) return value
  }
  return undefined
}

function bottomOf(node: any): number | undefined {
  return positionOf(node, "bottom")
}

function rightOf(node: any): number | undefined {
  return positionOf(node, "right")
}

describe("ColotaMapView camera padding", () => {
  beforeEach(() => {
    mockSetStop.mockClear()
    mockCameraProps.mockClear()
  })

  it("frames the first camera inside the padding so the dock never covers the position dot", () => {
    render(<ColotaMapView initialCenter={center} cameraPadding={padding} />)

    expect(mockCameraProps.mock.calls[0][0].maxZoom).toBe(MAX_MAP_ZOOM)
    expect(mockCameraProps.mock.calls[0][0].initialViewState).toEqual({
      center,
      zoom: expect.any(Number),
      padding
    })
  })

  it("reframes without animation when the padding changes, because a growing dock must not slide the map", () => {
    const { rerender } = render(<ColotaMapView initialCenter={center} cameraPadding={padding} />)
    mockSetStop.mockClear()

    const grown = { ...padding, bottom: 260 }
    rerender(<ColotaMapView initialCenter={center} cameraPadding={grown} />)

    expect(mockSetStop).toHaveBeenCalledWith({ padding: grown, duration: 0 })
  })

  it("does not call the camera again for a new object holding the same insets", () => {
    const { rerender } = render(<ColotaMapView initialCenter={center} cameraPadding={padding} />)
    mockSetStop.mockClear()

    rerender(<ColotaMapView initialCenter={center} cameraPadding={{ ...padding }} />)

    expect(mockSetStop).not.toHaveBeenCalled()
  })

  it("leaves the camera untouched when no padding is given, so the other map screens keep their framing", () => {
    render(<ColotaMapView initialCenter={center} />)

    expect(mockCameraProps.mock.calls[0][0].initialViewState).not.toHaveProperty("padding")
    expect(mockSetStop).not.toHaveBeenCalled()
  })
})

describe("ColotaMapView control slots", () => {
  const controlsBottom = 250

  it("puts the attribution disc on the base line and the compass two slots above it", () => {
    const { getByRole, getByTestId } = render(<ColotaMapView initialCenter={center} controlsBottom={controlsBottom} />)
    rotateMap(getByTestId)

    expect(bottomOf(getByRole("button", { name: "Show map attribution" }))).toBe(controlsBottom)
    expect(bottomOf(getByRole("button", { name: "Reset map to north" }))).toBe(
      controlsBottom + 2 * (size.iconColumn + space.lg)
    )
  })

  it("moves both discs in from the right edge by the column end a screen gives, clear of a side navigation bar", () => {
    const { getByRole, getByTestId } = render(
      <ColotaMapView initialCenter={center} controlsBottom={controlsBottom} controlsEnd={64} />
    )
    rotateMap(getByTestId)

    expect(rightOf(getByRole("button", { name: "Show map attribution" }))).toBe(64)
    expect(rightOf(getByRole("button", { name: "Reset map to north" }))).toBe(64)
  })

  it("gives the attribution disc the same touch slop as every other disc in the column", () => {
    const { getByRole } = render(<ColotaMapView initialCenter={center} controlsBottom={controlsBottom} />)

    expect(getByRole("button", { name: "Show map attribution" }).props.hitSlop).toEqual(HIT_SLOP_SM)
  })

  it("keeps the fixed disc positions when no base line is given", () => {
    const bare = render(
      <MapActionButton
        onPress={() => {}}
        style={mapActionStyles.right}
        accessibilityRole="button"
        accessibilityLabel="bare"
      >
        {null}
      </MapActionButton>
    )
    const defaultBottom = bottomOf(bare.getByRole("button", { name: "bare" }))
    bare.unmount()

    const { getByRole, getByTestId } = render(<ColotaMapView initialCenter={center} />)
    rotateMap(getByTestId)

    expect(bottomOf(getByRole("button", { name: "Show map attribution" }))).toBe(defaultBottom)
    expect(rightOf(getByRole("button", { name: "Show map attribution" }))).toBe(space.lg)
    expect(bottomOf(getByRole("button", { name: "Reset map to north" }))).toBe(
      space.xxl + 2 * (size.iconColumn + space.lg)
    )
  })

  it("names the compass for a screen reader and hides it while the map points north", () => {
    const { queryByRole, getByRole, getByTestId } = render(<ColotaMapView initialCenter={center} />)

    expect(queryByRole("button", { name: "Reset map to north" })).toBeNull()
    rotateMap(getByTestId)

    fireEvent.press(getByRole("button", { name: "Reset map to north" }))
    expect(mockSetStop).toHaveBeenCalledWith(expect.objectContaining({ bearing: 0 }))
  })
})

describe("ColotaMapView attribution popup", () => {
  function openPopup() {
    const utils = render(<ColotaMapView initialCenter={center} />)
    fireEvent.press(utils.getByRole("button", { name: "Show map attribution" }))
    return utils
  }

  it("names the map data, lists every source as a link and ends with a Close button like the app's dialogs", () => {
    const { getByText, getAllByRole, getByRole, queryByLabelText } = openPopup()

    expect(getByText("Map credits")).toBeTruthy()
    expect(getAllByRole("link")).toHaveLength(4)
    expect(getByText("© OpenStreetMap contributors")).toBeTruthy()
    expect(getByText("Map data")).toBeTruthy()
    expect(getByText("Tile schema and base styles")).toBeTruthy()
    expect(getByText("Planet tiles, rebuilt weekly")).toBeTruthy()
    expect(getByText("Tile hosting and the Colota styles")).toBeTruthy()
    expect(getByRole("button", { name: "Close" })).toBeTruthy()
    expect(queryByLabelText("Close")).toBeNull()
  })

  it("holds the Close button 24 under the links like AppModal's button row, counting the 8 Button bakes in", () => {
    const { getByRole } = openPopup()

    let node: any = getByRole("button", { name: "Close" }).parent
    while (node && StyleSheet.flatten(node.props.style)?.marginTop === undefined) node = node.parent
    expect(StyleSheet.flatten(node.props.style).marginTop + space.sm).toBe(space.xl)
  })

  it("closes on the Close button so a reader is not left hunting for a corner glyph", () => {
    const { getByRole, queryByText } = openPopup()

    fireEvent.press(getByRole("button", { name: "Close" }))

    expect(queryByText("Map credits")).toBeNull()
  })
})

describe("attributionRole", () => {
  it("names the role of a known source, its subdomains and any path", () => {
    expect(attributionRole("https://www.openstreetmap.org/copyright")).toBe("Map data")
    expect(attributionRole("https://tile.openstreetmap.org/tiles")).toBe("Map data")
    expect(attributionRole("https://openmaptiles.org/")).toBe("Tile schema and base styles")
    expect(attributionRole("https://maps.mxd.codes")).toBe("Tile hosting and the Colota styles")
  })

  it("credits a custom tile server's own sources without claiming a role for them", () => {
    expect(attributionRole("https://tiles.example.com/style.json")).toBeUndefined()
  })

  it("refuses a host that only mentions a known one, since the style JSON supplies the link", () => {
    expect(attributionRole("https://openstreetmap.org.example.com/")).toBeUndefined()
    expect(attributionRole("https://example.com/?ref=openstreetmap.org")).toBeUndefined()
    expect(attributionRole("https://openstreetmap.org@example.com/")).toBeUndefined()
  })
})

describe("ColotaMapView credits from the loaded style", () => {
  const CUSTOM_STYLE = "https://tiles.example.com/styles/light.json"
  const TILEJSON = "https://tiles.example.com/planet.json"
  const getSetting = NativeLocationService.getSetting as jest.Mock
  const fetchMock = globalThis.fetch as jest.Mock

  function serve(lightStyleUrl: string | null, responses: Record<string, unknown>) {
    getSetting.mockImplementation((key: string) => Promise.resolve(key === "mapStyleUrlLight" ? lightStyleUrl : null))
    fetchMock.mockImplementation((url: string) =>
      url in responses
        ? Promise.resolve({ json: () => Promise.resolve(responses[url]) })
        : Promise.reject(new Error("offline"))
    )
  }

  function openCredits() {
    const utils = render(<ColotaMapView initialCenter={center} />)
    fireEvent.press(utils.getByRole("button", { name: "Show map attribution" }))
    return utils
  }

  afterEach(() => {
    getSetting.mockImplementation(() => Promise.resolve(null))
    fetchMock.mockImplementation(() => new Promise(() => {}))
  })

  it("credits a custom server with the names in the TileJSON its source points to, since a style may carry none itself", async () => {
    serve(CUSTOM_STYLE, {
      [CUSTOM_STYLE]: { sources: { carto: { type: "vector", url: TILEJSON } }, layers: [] },
      [TILEJSON]: {
        attribution:
          '&copy; <a href="https://carto.com/about-carto/">CARTO</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }
    })
    const { findByText, getAllByRole, queryByText } = openCredits()

    expect(await findByText("CARTO")).toBeTruthy()
    expect(getAllByRole("link")).toHaveLength(2)
    expect(queryByText("maps.mxd.codes")).toBeNull()
  })

  it("prints the copyright sign OpenFreeMap writes as an entity inside its link", async () => {
    serve(CUSTOM_STYLE, {
      [CUSTOM_STYLE]: {
        sources: {
          planet: {
            type: "vector",
            attribution:
              '<a href="https://www.openmaptiles.org/">&copy; OpenMapTiles</a> <a href="https://tiles.example.com/">Tiles &amp; Styles</a>'
          }
        }
      }
    })
    const { findByText, getByText, queryByText } = openCredits()

    expect(await findByText("Tiles & Styles")).toBeTruthy()
    expect(getByText("© OpenMapTiles")).toBeTruthy()
    expect(queryByText("&copy; OpenMapTiles")).toBeNull()
  })

  it.each([
    [
      "names no credits",
      {
        [CUSTOM_STYLE]: {
          sources: { planet: { type: "vector", tiles: ["https://tiles.example.com/{z}/{x}/{y}.pbf"] } }
        }
      }
    ],
    ["cannot be read", {}]
  ])(
    "credits a custom server whose style %s by its host, never with the default server's sources",
    async (_case, responses: Record<string, unknown>) => {
      serve(CUSTOM_STYLE, responses)
      const { findByText, getAllByRole, queryByText } = openCredits()

      expect(await findByText("tiles.example.com")).toBeTruthy()
      expect(getAllByRole("link")).toHaveLength(1)
      expect(queryByText("© OpenStreetMap contributors")).toBeNull()
    }
  )

  it("links a host credit to the server without the credentials its style URL carries", async () => {
    serve("https://user:secret@tiles.example.com:8443/style.json", {})
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined)
    const { findByText } = openCredits()

    fireEvent.press(await findByText("tiles.example.com"))

    expect(openURL).toHaveBeenCalledWith("https://tiles.example.com:8443")
    openURL.mockRestore()
  })

  it("keeps the default server's own credits when its style cannot be read", async () => {
    serve(null, {})
    const { getAllByRole, getByText } = openCredits()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(MAP_STYLE_URL_LIGHT, expect.anything()))
    await act(() => new Promise<void>((resolve) => setTimeout(() => resolve(), 0)))

    expect(getAllByRole("link")).toHaveLength(4)
    expect(getByText("OpenFreeMap")).toBeTruthy()
  })
})
