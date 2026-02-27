/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import type { ThemeColors, Geofence } from "../../../types/global"

// ============================================================================
// SPEED COLOR INTERPOLATION
// ============================================================================

/** Parse a hex color string into [r, g, b] */
function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "")
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)]
}

/** Linearly interpolate between two hex colors by factor t (0..1) */
export function lerpColor(c1: string, c2: string, t: number): string {
  const a = parseHex(c1)
  const b = parseHex(c2)
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r},${g},${bl})`
}

/**
 * Returns a color for a given speed (m/s) using the theme's semantic colors.
 * Speed thresholds: <=2 green, 2-5 green->yellow, 5-8 yellow->red, >=8 red
 */
export function getSpeedColor(speed: number, colors: ThemeColors): string {
  if (speed <= 2) return colors.success
  if (speed >= 8) return colors.error
  if (speed <= 5) return lerpColor(colors.success, colors.warning, (speed - 2) / 3)
  return lerpColor(colors.warning, colors.error, (speed - 5) / 3)
}

// ============================================================================
// GEOGRAPHIC CIRCLE POLYGON
// ============================================================================

const EARTH_RADIUS_M = 6371000

/**
 * Generates a GeoJSON Polygon approximating a circle on the Earth's surface.
 * MapLibre's CircleLayer is screen-space (fixed pixel size), so we need
 * actual polygon geometry for meter-based geofence circles.
 */
export function createCirclePolygon(
  center: [number, number], // [lon, lat]
  radiusMeters: number,
  numPoints: number = 64
): GeoJSON.Polygon {
  const [lon, lat] = center
  const latRad = (lat * Math.PI) / 180
  const lonRad = (lon * Math.PI) / 180
  const d = radiusMeters / EARTH_RADIUS_M

  const coords: [number, number][] = []
  for (let i = 0; i <= numPoints; i++) {
    const bearing = (2 * Math.PI * i) / numPoints
    const pLat = Math.asin(Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(bearing))
    const pLon =
      lonRad +
      Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(latRad), Math.cos(d) - Math.sin(latRad) * Math.sin(pLat))
    coords.push([(pLon * 180) / Math.PI, (pLat * 180) / Math.PI])
  }

  return { type: "Polygon", coordinates: [coords] }
}

// ============================================================================
// GEOJSON BUILDERS
// ============================================================================

export interface TrackLocation {
  latitude: number
  longitude: number
  timestamp?: number
  accuracy?: number
  speed?: number
  altitude?: number
}

/** Build per-segment LineString features with a pre-computed `color` property.
 *  Pass `skipIndices` to leave gaps between trips (indices where a new trip starts).
 *  Pass `locationColors` to override speed-based coloring with per-location colors. */
export function buildTrackSegmentsGeoJSON(
  locations: TrackLocation[],
  colors: ThemeColors,
  skipIndices?: Set<number>,
  locationColors?: string[]
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (let i = 1; i < locations.length; i++) {
    if (skipIndices?.has(i)) continue
    const color = locationColors
      ? locationColors[i]
      : getSpeedColor(((locations[i - 1].speed ?? 0) + (locations[i].speed ?? 0)) / 2, colors)
    features.push({
      type: "Feature",
      properties: { color },
      geometry: {
        type: "LineString",
        coordinates: [
          [locations[i - 1].longitude, locations[i - 1].latitude],
          [locations[i].longitude, locations[i].latitude]
        ]
      }
    })
  }
  return { type: "FeatureCollection", features }
}

/** Build Point features for each track location with metadata properties.
 *  Pass `locationColors` to override speed-based dot coloring. */
export function buildTrackPointsGeoJSON(
  locations: TrackLocation[],
  colors: ThemeColors,
  locationColors?: string[]
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: locations.map((loc, i) => ({
      type: "Feature" as const,
      properties: {
        speed: loc.speed ?? 0,
        timestamp: loc.timestamp ?? 0,
        accuracy: loc.accuracy ?? 0,
        altitude: loc.altitude ?? 0,
        color: locationColors ? locationColors[i] : getSpeedColor(loc.speed ?? 0, colors)
      },
      geometry: {
        type: "Point" as const,
        coordinates: [loc.longitude, loc.latitude]
      }
    }))
  }
}

/** Build geofence circle polygons + label points as separate FeatureCollections */
export function buildGeofencesGeoJSON(
  geofences: Geofence[],
  colors: ThemeColors
): { fills: GeoJSON.FeatureCollection; labels: GeoJSON.FeatureCollection } {
  const fills: GeoJSON.Feature[] = []
  const labels: GeoJSON.Feature[] = []

  for (const zone of geofences) {
    const fillColor = zone.pauseTracking ? colors.warning : colors.info
    fills.push({
      type: "Feature",
      properties: {
        id: zone.id,
        name: zone.name,
        fillColor,
        fillOpacity: 0.3,
        strokeColor: fillColor,
        pauseTracking: zone.pauseTracking
      },
      geometry: createCirclePolygon([zone.lon, zone.lat], zone.radius)
    })

    labels.push({
      type: "Feature",
      properties: {
        name: zone.name,
        textColor: fillColor
      },
      geometry: {
        type: "Point",
        coordinates: [zone.lon, zone.lat]
      }
    })
  }

  return {
    fills: { type: "FeatureCollection", features: fills },
    labels: { type: "FeatureCollection", features: labels }
  }
}

/** Compute the bounding box [sw, ne] for a set of track locations */
export function computeTrackBounds(locations: TrackLocation[]): { sw: [number, number]; ne: [number, number] } | null {
  if (locations.length === 0) return null
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity
  for (const loc of locations) {
    if (loc.longitude < minLon) minLon = loc.longitude
    if (loc.latitude < minLat) minLat = loc.latitude
    if (loc.longitude > maxLon) maxLon = loc.longitude
    if (loc.latitude > maxLat) maxLat = loc.latitude
  }
  return {
    sw: [minLon, minLat],
    ne: [maxLon, maxLat]
  }
}

// ============================================================================
// DARK MODE STYLE TRANSFORMATION
// ============================================================================

// Base
const DARK_BG = "#1a1a2e"
const DARK_WATER = "#0d1b2a"
const DARK_LAND = "#16213e"

// Nature
const DARK_PARK = "#162e20"
const DARK_WOOD = "#132618"
const DARK_SAND = "#2a2820"

// Land use
const DARK_RESIDENTIAL = "#181c36"
const DARK_COMMERCIAL = "#1a1a32"

// Buildings
const DARK_BUILDING = "#252545"
const DARK_BUILDING_OUTLINE = "#3a3a60"

// Roads
const DARK_ROAD = "#2a2a4a"
const DARK_ROAD_SECONDARY = "#323252"
const DARK_ROAD_MAJOR = "#3a3a5c"
const DARK_RAILWAY = "#3d3050"

// Other
const DARK_BORDER = "#4a4a6a"
const DARK_TEXT = "#c8c8d8"
const DARK_TEXT_HALO = "#1a1a2e"

/**
 * Transforms a vector tile style JSON into a dark theme variant.
 * Deep-clones the style and overrides paint properties by matching layer IDs.
 *
 * Tuned for OpenFreeMap "bright" style layer naming conventions.
 */
export function darkifyStyle(style: any): object {
  const result = JSON.parse(JSON.stringify(style))

  for (const layer of result.layers ?? []) {
    const id: string = layer.id ?? ""
    const type: string = layer.type ?? ""
    if (!layer.paint) layer.paint = {}

    if (type === "background") {
      layer.paint["background-color"] = DARK_BG
    } else if (type === "fill") {
      if (id.includes("water") || id.includes("glacier") || id.includes("ice")) {
        layer.paint["fill-color"] = DARK_WATER
      } else if (id.includes("building")) {
        layer.paint["fill-color"] = DARK_BUILDING
        layer.paint["fill-outline-color"] = DARK_BUILDING_OUTLINE
      } else if (id.includes("wood")) {
        layer.paint["fill-color"] = DARK_WOOD
      } else if (id.includes("park") || id.includes("grass")) {
        layer.paint["fill-color"] = DARK_PARK
      } else if (id.includes("sand")) {
        layer.paint["fill-color"] = DARK_SAND
      } else if (id.includes("residential") || id.includes("suburb")) {
        layer.paint["fill-color"] = DARK_RESIDENTIAL
      } else if (id.includes("commercial") || id.includes("industrial")) {
        layer.paint["fill-color"] = DARK_COMMERCIAL
      } else {
        layer.paint["fill-color"] = DARK_LAND
      }
    } else if (type === "line") {
      if (id.includes("boundary") || id.includes("admin")) {
        layer.paint["line-color"] = DARK_BORDER
      } else if (id.includes("water")) {
        layer.paint["line-color"] = DARK_WATER
      } else if (id.includes("railway") || id.includes("rail")) {
        layer.paint["line-color"] = DARK_RAILWAY
      } else if (id.includes("motorway") || id.includes("trunk") || id.includes("primary")) {
        layer.paint["line-color"] = DARK_ROAD_MAJOR
      } else if (id.includes("secondary") || id.includes("tertiary")) {
        layer.paint["line-color"] = DARK_ROAD_SECONDARY
      } else {
        layer.paint["line-color"] = DARK_ROAD
      }
    } else if (type === "symbol") {
      layer.paint["text-color"] = DARK_TEXT
      layer.paint["text-halo-color"] = DARK_TEXT_HALO
      layer.paint["text-halo-width"] = 1
    }
  }

  return result
}
