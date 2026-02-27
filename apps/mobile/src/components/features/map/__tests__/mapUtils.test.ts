import {
  lerpColor,
  getSpeedColor,
  createCirclePolygon,
  buildTrackSegmentsGeoJSON,
  buildTrackPointsGeoJSON,
  buildGeofencesGeoJSON,
  computeTrackBounds,
  darkifyStyle
} from "../mapUtils"
import { haversine as haversineDistance } from "../../../../utils/geo"

// Only the color keys used by mapUtils functions
const colors = {
  success: "#2E7D32",
  warning: "#C2410C",
  error: "#D32F2F",
  info: "#1976D2"
} as any

// ============================================================================
// lerpColor
// ============================================================================

describe("lerpColor", () => {
  it("returns the first color at t=0", () => {
    expect(lerpColor("#FF0000", "#0000FF", 0)).toBe("rgb(255,0,0)")
  })

  it("returns the second color at t=1", () => {
    expect(lerpColor("#FF0000", "#0000FF", 1)).toBe("rgb(0,0,255)")
  })

  it("returns the midpoint at t=0.5", () => {
    expect(lerpColor("#000000", "#FFFFFF", 0.5)).toBe("rgb(128,128,128)")
  })

  it("interpolates red to green", () => {
    const result = lerpColor("#FF0000", "#00FF00", 0.25)
    // r: 255 + (0-255)*0.25 = 191, g: 0 + (255-0)*0.25 = 64
    expect(result).toBe("rgb(191,64,0)")
  })
})

// ============================================================================
// getSpeedColor
// ============================================================================

describe("getSpeedColor", () => {
  it("returns success (green) for speed <= 2 m/s", () => {
    expect(getSpeedColor(0, colors)).toBe(colors.success)
    expect(getSpeedColor(1, colors)).toBe(colors.success)
    expect(getSpeedColor(2, colors)).toBe(colors.success)
  })

  it("returns error (red) for speed >= 8 m/s", () => {
    expect(getSpeedColor(8, colors)).toBe(colors.error)
    expect(getSpeedColor(15, colors)).toBe(colors.error)
  })

  it("returns interpolated color for speed between 2 and 5", () => {
    const color = getSpeedColor(3.5, colors)
    expect(color).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
    expect(color).not.toBe(colors.success)
    expect(color).not.toBe(colors.warning)
  })

  it("returns interpolated color for speed between 5 and 8", () => {
    const color = getSpeedColor(6.5, colors)
    expect(color).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
    expect(color).not.toBe(colors.warning)
    expect(color).not.toBe(colors.error)
  })
})

// ============================================================================
// createCirclePolygon
// ============================================================================

describe("createCirclePolygon", () => {
  it("returns a valid GeoJSON Polygon", () => {
    const polygon = createCirclePolygon([13.405, 52.52], 1000)
    expect(polygon.type).toBe("Polygon")
    expect(polygon.coordinates).toHaveLength(1)
    // 64 points + closing point = 65
    expect(polygon.coordinates[0]).toHaveLength(65)
  })

  it("first and last coordinates are the same (closed ring)", () => {
    const polygon = createCirclePolygon([13.405, 52.52], 500)
    const ring = polygon.coordinates[0]
    expect(ring[0][0]).toBeCloseTo(ring[ring.length - 1][0], 8)
    expect(ring[0][1]).toBeCloseTo(ring[ring.length - 1][1], 8)
  })

  it("all points are approximately the given radius from center", () => {
    const center = [13.405, 52.52]
    const radiusMeters = 1000
    const polygon = createCirclePolygon([center[0], center[1]], radiusMeters, 16)

    // Haversine check for each point
    for (let i = 0; i < 16; i++) {
      const [lon, lat] = polygon.coordinates[0][i]
      const dist = haversineDistance(center[1], center[0], lat, lon)
      expect(dist).toBeGreaterThan(radiusMeters * 0.99)
      expect(dist).toBeLessThan(radiusMeters * 1.01)
    }
  })

  it("respects custom numPoints", () => {
    const polygon = createCirclePolygon([0, 0], 500, 8)
    // 8 + 1 closing point = 9
    expect(polygon.coordinates[0]).toHaveLength(9)
  })
})

// ============================================================================
// buildTrackSegmentsGeoJSON
// ============================================================================

describe("buildTrackSegmentsGeoJSON", () => {
  it("returns empty FeatureCollection for empty input", () => {
    const result = buildTrackSegmentsGeoJSON([], colors)
    expect(result.type).toBe("FeatureCollection")
    expect(result.features).toHaveLength(0)
  })

  it("returns empty FeatureCollection for single point", () => {
    const result = buildTrackSegmentsGeoJSON([{ latitude: 52.52, longitude: 13.405 }], colors)
    expect(result.features).toHaveLength(0)
  })

  it("creates one LineString per segment", () => {
    const locs = [
      { latitude: 52.52, longitude: 13.405, speed: 1 },
      { latitude: 52.53, longitude: 13.406, speed: 3 },
      { latitude: 52.54, longitude: 13.407, speed: 7 }
    ]
    const result = buildTrackSegmentsGeoJSON(locs, colors)
    expect(result.features).toHaveLength(2)
    expect(result.features[0].geometry.type).toBe("LineString")
    expect(result.features[1].geometry.type).toBe("LineString")
  })

  it("each segment has a color property", () => {
    const locs = [
      { latitude: 52.52, longitude: 13.405, speed: 0 },
      { latitude: 52.53, longitude: 13.406, speed: 0 }
    ]
    const result = buildTrackSegmentsGeoJSON(locs, colors)
    expect(result.features[0].properties?.color).toBeDefined()
  })

  it("segment coordinates are [lon, lat] pairs", () => {
    const locs = [
      { latitude: 52.52, longitude: 13.405 },
      { latitude: 52.53, longitude: 13.406 }
    ]
    const result = buildTrackSegmentsGeoJSON(locs, colors)
    const geom = result.features[0].geometry
    // @ts-ignore - accessing coordinates on LineString
    expect(geom.coordinates[0]).toEqual([13.405, 52.52])
    // @ts-ignore
    expect(geom.coordinates[1]).toEqual([13.406, 52.53])
  })

  it("skips segments at skipIndices (trip boundaries)", () => {
    const locs = [
      { latitude: 52.52, longitude: 13.405, speed: 1 },
      { latitude: 52.53, longitude: 13.406, speed: 1 },
      { latitude: 52.54, longitude: 13.407, speed: 1 },
      { latitude: 52.55, longitude: 13.408, speed: 1 }
    ]
    // Skip index 2 → no segment from point 1 to point 2
    const result = buildTrackSegmentsGeoJSON(locs, colors, new Set([2]))
    expect(result.features).toHaveLength(2) // segments 0→1 and 2→3, not 1→2
  })

  it("uses locationColors when provided", () => {
    const locs = [
      { latitude: 52.52, longitude: 13.405, speed: 0 },
      { latitude: 52.53, longitude: 13.406, speed: 0 }
    ]
    const result = buildTrackSegmentsGeoJSON(locs, colors, undefined, ["#FF0000", "#00FF00"])
    expect(result.features[0].properties?.color).toBe("#00FF00")
  })
})

// ============================================================================
// buildTrackPointsGeoJSON
// ============================================================================

describe("buildTrackPointsGeoJSON", () => {
  it("returns empty FeatureCollection for empty input", () => {
    const result = buildTrackPointsGeoJSON([], colors)
    expect(result.type).toBe("FeatureCollection")
    expect(result.features).toHaveLength(0)
  })

  it("creates one Point per location", () => {
    const locs = [
      { latitude: 52.52, longitude: 13.405, speed: 3, timestamp: 1000, accuracy: 5, altitude: 34 },
      { latitude: 52.53, longitude: 13.406, speed: 7, timestamp: 1001, accuracy: 10, altitude: 35 }
    ]
    const result = buildTrackPointsGeoJSON(locs, colors)
    expect(result.features).toHaveLength(2)
    expect(result.features[0].geometry.type).toBe("Point")
  })

  it("includes metadata properties on each point", () => {
    const locs = [{ latitude: 52.52, longitude: 13.405, speed: 3, timestamp: 1000, accuracy: 5, altitude: 34 }]
    const result = buildTrackPointsGeoJSON(locs, colors)
    const props = result.features[0].properties
    expect(props?.speed).toBe(3)
    expect(props?.timestamp).toBe(1000)
    expect(props?.accuracy).toBe(5)
    expect(props?.altitude).toBe(34)
    expect(props?.color).toBeDefined()
  })

  it("defaults missing optional fields to 0", () => {
    const locs = [{ latitude: 52.52, longitude: 13.405 }]
    const result = buildTrackPointsGeoJSON(locs, colors)
    const props = result.features[0].properties
    expect(props?.speed).toBe(0)
    expect(props?.timestamp).toBe(0)
    expect(props?.accuracy).toBe(0)
    expect(props?.altitude).toBe(0)
  })

  it("uses locationColors when provided", () => {
    const locs = [
      { latitude: 52.52, longitude: 13.405, speed: 0 },
      { latitude: 52.53, longitude: 13.406, speed: 10 }
    ]
    const result = buildTrackPointsGeoJSON(locs, colors, ["#AAAAAA", "#BBBBBB"])
    expect(result.features[0].properties?.color).toBe("#AAAAAA")
    expect(result.features[1].properties?.color).toBe("#BBBBBB")
  })
})

// ============================================================================
// buildGeofencesGeoJSON
// ============================================================================

describe("buildGeofencesGeoJSON", () => {
  const baseGeofence = {
    id: 1,
    name: "Home",
    lat: 52.52,
    lon: 13.405,
    radius: 200,
    enabled: true,
    pauseTracking: true
  }

  it("returns empty collections for no geofences", () => {
    const result = buildGeofencesGeoJSON([], colors)
    expect(result.fills.features).toHaveLength(0)
    expect(result.labels.features).toHaveLength(0)
  })

  it("creates fill polygon and label point per geofence", () => {
    const result = buildGeofencesGeoJSON([baseGeofence], colors)
    expect(result.fills.features).toHaveLength(1)
    expect(result.labels.features).toHaveLength(1)
    expect(result.fills.features[0].geometry.type).toBe("Polygon")
    expect(result.labels.features[0].geometry.type).toBe("Point")
  })

  it("uses warning color for pause zones", () => {
    const result = buildGeofencesGeoJSON([baseGeofence], colors)
    expect(result.fills.features[0].properties?.strokeColor).toBe(colors.warning)
    expect(result.fills.features[0].properties?.fillColor).toBe(colors.warning)
    expect(result.fills.features[0].properties?.fillOpacity).toBe(0.3)
  })

  it("uses info color for non-pause zones", () => {
    const zone = { ...baseGeofence, pauseTracking: false }
    const result = buildGeofencesGeoJSON([zone], colors)
    expect(result.fills.features[0].properties?.strokeColor).toBe(colors.info)
    expect(result.fills.features[0].properties?.fillColor).toBe(colors.info)
    expect(result.fills.features[0].properties?.fillOpacity).toBe(0.3)
  })

  it("label point is at the geofence center", () => {
    const result = buildGeofencesGeoJSON([baseGeofence], colors)
    // @ts-ignore - accessing coordinates on Point
    const labelCoords = result.labels.features[0].geometry.coordinates
    expect(labelCoords).toEqual([13.405, 52.52])
  })

  it("label has name and textColor properties", () => {
    const result = buildGeofencesGeoJSON([baseGeofence], colors)
    expect(result.labels.features[0].properties?.name).toBe("Home")
    expect(result.labels.features[0].properties?.textColor).toBe(colors.warning)
  })
})

// ============================================================================
// computeTrackBounds
// ============================================================================

describe("computeTrackBounds", () => {
  it("returns null for empty input", () => {
    expect(computeTrackBounds([])).toBeNull()
  })

  it("returns correct bounds for a single point", () => {
    const result = computeTrackBounds([{ latitude: 52.52, longitude: 13.405 }])
    expect(result).toEqual({
      sw: [13.405, 52.52],
      ne: [13.405, 52.52]
    })
  })

  it("returns correct bounds for multiple points", () => {
    const locs = [
      { latitude: 52.5, longitude: 13.3 },
      { latitude: 52.55, longitude: 13.45 },
      { latitude: 52.52, longitude: 13.4 }
    ]
    const result = computeTrackBounds(locs)
    expect(result).toEqual({
      sw: [13.3, 52.5],
      ne: [13.45, 52.55]
    })
  })
})

// ============================================================================
// darkifyStyle
// ============================================================================

describe("darkifyStyle", () => {
  it("does not mutate the original style object", () => {
    const original = { version: 8, layers: [{ id: "bg", type: "background", paint: { "background-color": "#fff" } }] }
    const copy = JSON.parse(JSON.stringify(original))
    darkifyStyle(original)
    expect(original).toEqual(copy)
  })

  it("sets dark background color", () => {
    const style = { version: 8, layers: [{ id: "bg", type: "background", paint: {} }] }
    const result = darkifyStyle(style) as any
    expect(result.layers[0].paint["background-color"]).toBe("#1a1a2e")
  })

  it("darkifies water fill layers", () => {
    const style = { version: 8, layers: [{ id: "water-fill", type: "fill", paint: {} }] }
    const result = darkifyStyle(style) as any
    expect(result.layers[0].paint["fill-color"]).toBe("#0d1b2a")
  })

  it("darkifies building fill layers with outline", () => {
    const style = { version: 8, layers: [{ id: "building-3d", type: "fill", paint: {} }] }
    const result = darkifyStyle(style) as any
    expect(result.layers[0].paint["fill-color"]).toBe("#252545")
    expect(result.layers[0].paint["fill-outline-color"]).toBe("#3a3a60")
  })

  it("darkifies park/grass fills with green tint", () => {
    const style = { version: 8, layers: [{ id: "landuse-park", type: "fill", paint: {} }] }
    const result = darkifyStyle(style) as any
    expect(result.layers[0].paint["fill-color"]).toBe("#162e20")
  })

  it("darkifies wood/forest fills with deep green", () => {
    const style = { version: 8, layers: [{ id: "landcover-wood", type: "fill", paint: {} }] }
    const result = darkifyStyle(style) as any
    expect(result.layers[0].paint["fill-color"]).toBe("#132618")
  })

  it("darkifies sand fills with warm tone", () => {
    const style = { version: 8, layers: [{ id: "landcover-sand", type: "fill", paint: {} }] }
    const result = darkifyStyle(style) as any
    expect(result.layers[0].paint["fill-color"]).toBe("#2a2820")
  })

  it("darkifies residential fills distinctly from raw land", () => {
    const style = { version: 8, layers: [{ id: "landuse-residential", type: "fill", paint: {} }] }
    const result = darkifyStyle(style) as any
    expect(result.layers[0].paint["fill-color"]).toBe("#181c36")
  })

  it("darkifies generic fill layers as land", () => {
    const style = { version: 8, layers: [{ id: "landuse-cemetery", type: "fill", paint: {} }] }
    const result = darkifyStyle(style) as any
    expect(result.layers[0].paint["fill-color"]).toBe("#16213e")
  })

  it("darkifies major road lines", () => {
    const style = { version: 8, layers: [{ id: "motorway-line", type: "line", paint: {} }] }
    const result = darkifyStyle(style) as any
    expect(result.layers[0].paint["line-color"]).toBe("#3a3a5c")
  })

  it("darkifies secondary/tertiary road lines distinctly", () => {
    const style = { version: 8, layers: [{ id: "highway-secondary-tertiary", type: "line", paint: {} }] }
    const result = darkifyStyle(style) as any
    expect(result.layers[0].paint["line-color"]).toBe("#323252")
  })

  it("darkifies railway lines with distinct color", () => {
    const style = { version: 8, layers: [{ id: "railway", type: "line", paint: {} }] }
    const result = darkifyStyle(style) as any
    expect(result.layers[0].paint["line-color"]).toBe("#3d3050")
  })

  it("darkifies boundary lines", () => {
    const style = { version: 8, layers: [{ id: "admin-boundary", type: "line", paint: {} }] }
    const result = darkifyStyle(style) as any
    expect(result.layers[0].paint["line-color"]).toBe("#4a4a6a")
  })

  it("darkifies water lines", () => {
    const style = { version: 8, layers: [{ id: "water-line", type: "line", paint: {} }] }
    const result = darkifyStyle(style) as any
    expect(result.layers[0].paint["line-color"]).toBe("#0d1b2a")
  })

  it("darkifies generic road lines", () => {
    const style = { version: 8, layers: [{ id: "street-minor", type: "line", paint: {} }] }
    const result = darkifyStyle(style) as any
    expect(result.layers[0].paint["line-color"]).toBe("#2a2a4a")
  })

  it("darkifies symbol layers with text color and halo", () => {
    const style = { version: 8, layers: [{ id: "place-label", type: "symbol", paint: {} }] }
    const result = darkifyStyle(style) as any
    expect(result.layers[0].paint["text-color"]).toBe("#c8c8d8")
    expect(result.layers[0].paint["text-halo-color"]).toBe("#1a1a2e")
    expect(result.layers[0].paint["text-halo-width"]).toBe(1)
  })

  it("handles layers with no paint property", () => {
    const style = { version: 8, layers: [{ id: "bg", type: "background" }] }
    const result = darkifyStyle(style) as any
    expect(result.layers[0].paint["background-color"]).toBe("#1a1a2e")
  })

  it("handles style with no layers", () => {
    const result = darkifyStyle({ version: 8 }) as any
    expect(result.version).toBe(8)
  })
})
