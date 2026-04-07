/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useMemo } from "react"
import { ShapeSource, LineLayer } from "@maplibre/maplibre-react-native"
import { buildTrackSegmentsGeoJSON, type TrackLocation } from "./mapUtils"
import type { ThemeColors } from "../../../types/global"

const trackLineStyle = {
  lineColor: ["get", "color"] as const,
  lineWidth: 3,
  lineCap: "round" as const,
  lineJoin: "round" as const
}

interface Props {
  locations: TrackLocation[]
  version: number
  visible: boolean
  colors: ThemeColors
}

export function CurrentTrackLayers({ locations, version, visible, colors }: Props) {
  const geoJSON = useMemo(
    () => buildTrackSegmentsGeoJSON(locations, colors),
    // locations is a stable ref array - version is the change signal for rebuilds
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, colors]
  )

  if (!visible || locations.length < 2) return null

  return (
    <ShapeSource id="current-track-segments" shape={geoJSON}>
      <LineLayer id="current-track-line" style={trackLineStyle} />
    </ShapeSource>
  )
}
