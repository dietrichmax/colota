/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useMemo, useState, useEffect } from "react"
import { View, StyleSheet } from "react-native"
import { ShapeSource, CircleLayer, MarkerView } from "@maplibre/maplibre-react-native"
import type { LocationCoords, ThemeColors } from "../../../types/global"

/** meters-per-pixel at zoom 0 on the equator (Web Mercator constant) */
const METERS_PER_PX_Z0 = 156543.03

interface Props {
  coords: LocationCoords
  tracking: boolean
  isPaused: boolean
  colors: ThemeColors
}

/**
 * Shared overlay for DashboardMap and GeofenceScreen:
 *  – accuracy circle (CircleLayer with zoom-based radius)
 *  – user position dot (MarkerView)
 *  – pulsing stroke on the accuracy circle when actively tracking
 */
export function UserLocationOverlay({ coords, tracking, isPaused, colors }: Props) {
  const isActive = tracking && !isPaused
  const markerColor = isPaused ? colors.textDisabled : colors.primary

  // Smooth pulse: 4 fps sine wave, full cycle every 2 s
  const [pulseValue, setPulseValue] = useState(0)
  useEffect(() => {
    if (!isActive) {
      setPulseValue(0)
      return
    }
    const sine = [0, 0.38, 0.71, 0.92, 1, 0.92, 0.71, 0.38]
    let phase = 0
    const id = setInterval(() => {
      phase = (phase + 1) % 8
      setPulseValue(sine[phase])
    }, 250)
    return () => clearInterval(id)
  }, [isActive])

  // Compute radiusFactor for zoom-based meter→pixel conversion.
  // circleRadius = radiusFactor × 2^zoom  (matches Web Mercator scaling)
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
      circleStrokeWidth: isActive ? 1.5 + pulseValue * 1.5 : 1.5,
      circleStrokeOpacity: isActive ? 0.3 + pulseValue * 0.4 : 0.4
    }),
    [radiusFactor, colors.primary, isActive, pulseValue]
  )

  return (
    <>
      {/* Accuracy circle */}
      {accuracyGeoJSON && (
        <ShapeSource id="user-accuracy" shape={accuracyGeoJSON}>
          <CircleLayer id="user-accuracy-fill" style={accuracyStyle} />
        </ShapeSource>
      )}

      {/* User position dot */}
      <MarkerView coordinate={[coords.longitude, coords.latitude]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
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
