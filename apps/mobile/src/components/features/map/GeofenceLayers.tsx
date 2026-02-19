/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useMemo } from "react"
import { ShapeSource, FillLayer, LineLayer, SymbolLayer } from "@maplibre/maplibre-react-native"

const geofenceFillStyle = {
  fillColor: ["get", "fillColor"] as const,
  fillOpacity: ["get", "fillOpacity"] as const,
  fillOutlineColor: ["get", "strokeColor"] as const
}

const geofenceStrokeStyle = {
  lineColor: ["get", "strokeColor"] as const,
  lineWidth: 2
}

interface Props {
  fills: GeoJSON.FeatureCollection
  labels: GeoJSON.FeatureCollection
  haloColor: string
}

export function GeofenceLayers({ fills, labels, haloColor }: Props) {
  const labelStyle = useMemo(
    () => ({
      textField: ["get", "name"] as const,
      textSize: 12,
      textColor: ["get", "textColor"] as const,
      textHaloColor: haloColor,
      textHaloWidth: 2,
      textOffset: [0, -1.8] as [number, number],
      textFont: ["Noto Sans Bold"]
    }),
    [haloColor]
  )

  return (
    <>
      {fills.features.length > 0 && (
        <ShapeSource id="geofence-fills" shape={fills}>
          <FillLayer id="geofence-fill" style={geofenceFillStyle} />
          <LineLayer id="geofence-stroke" style={geofenceStrokeStyle} />
        </ShapeSource>
      )}

      {labels.features.length > 0 && (
        <ShapeSource id="geofence-labels" shape={labels}>
          <SymbolLayer id="geofence-label-text" style={labelStyle} />
        </ShapeSource>
      )}
    </>
  )
}
