/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useMemo } from "react"
import { GeoJSONSource, Layer } from "@maplibre/maplibre-react-native"

const geofenceFillStyle: any = {
  fillColor: ["get", "fillColor"],
  fillOpacity: ["get", "fillOpacity"],
  fillOutlineColor: ["get", "strokeColor"]
}

const geofenceStrokeStyle: any = {
  lineColor: ["get", "strokeColor"],
  lineWidth: 2
}

interface Props {
  fills: GeoJSON.FeatureCollection
  labels: GeoJSON.FeatureCollection
  haloColor: string
}

export function GeofenceLayers({ fills, labels, haloColor }: Props) {
  const labelStyle = useMemo<any>(
    () => ({
      textField: ["get", "name"],
      textSize: 12,
      textColor: ["get", "textColor"],
      textHaloColor: haloColor,
      textHaloWidth: 2,
      textOffset: [0, -1.8],
      textFont: ["Noto Sans Bold"]
    }),
    [haloColor]
  )

  return (
    <>
      {fills.features.length > 0 && (
        <GeoJSONSource id="geofence-fills" data={fills}>
          <Layer id="geofence-fill" type="fill" style={geofenceFillStyle} />
          <Layer id="geofence-stroke" type="line" style={geofenceStrokeStyle} />
        </GeoJSONSource>
      )}

      {labels.features.length > 0 && (
        <GeoJSONSource id="geofence-labels" data={labels}>
          <Layer id="geofence-label-text" type="symbol" style={labelStyle} />
        </GeoJSONSource>
      )}
    </>
  )
}
