/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useMemo } from "react"
import { View, StyleSheet } from "react-native"
import { ShapeSource, CircleLayer, MarkerView } from "@maplibre/maplibre-react-native"
import type { LocationCoords, ThemeColors } from "../../../types/global"

/** meters-per-pixel at zoom 0 on the equator (Web Mercator constant) */
const METERS_PER_PX_Z0 = 156543.03
const MARKER_ANCHOR = { x: 0.5, y: 0.5 }

interface Props {
  coords: LocationCoords
  isPaused: boolean
  colors: ThemeColors
}

/**
 * Shared overlay for DashboardMap and GeofenceScreen:
 *  – accuracy circle (CircleLayer with zoom-based radius)
 *  – user position dot (MarkerView)
 */
export function UserLocationOverlay({ coords, isPaused, colors }: Props) {
  const markerColor = isPaused ? colors.textDisabled : colors.primary

  const radiusFactor = useMemo(() => {
    if (!coords.accuracy || coords.accuracy <= 0) return 0
    return coords.accuracy / (METERS_PER_PX_Z0 * Math.cos((coords.latitude * Math.PI) / 180))
  }, [coords.latitude, coords.accuracy])

  const accuracyGeoJSON = useMemo(() => {
    if (radiusFactor <= 0) return null
    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "Point" as const,
            coordinates: [coords.longitude, coords.latitude]
          }
        }
      ]
    }
  }, [coords.latitude, coords.longitude, radiusFactor])

  const accuracyStyle = useMemo(
    () => ({
      circleRadius: ["interpolate", ["exponential", 2], ["zoom"], 0, radiusFactor, 24, radiusFactor * 16777216] as any,
      circleColor: colors.primary,
      circleOpacity: 0.12,
      circleStrokeColor: colors.primary,
      circleStrokeWidth: 1.5,
      circleStrokeOpacity: 0.4
    }),
    [radiusFactor, colors.primary]
  )

  const markerCoordinate = useMemo(
    () => [coords.longitude, coords.latitude] as [number, number],
    [coords.longitude, coords.latitude]
  )

  return (
    <>
      {accuracyGeoJSON && (
        <ShapeSource id="user-accuracy" shape={accuracyGeoJSON}>
          <CircleLayer id="user-accuracy-fill" style={accuracyStyle} />
        </ShapeSource>
      )}

      <MarkerView coordinate={markerCoordinate} anchor={MARKER_ANCHOR} allowOverlap>
        <View style={[styles.markerDot, { backgroundColor: markerColor }]} />
      </MarkerView>
    </>
  )
}

const styles = StyleSheet.create({
  markerDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: "white",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4
  }
})
