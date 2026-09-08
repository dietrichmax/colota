/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useMemo } from "react"
import type { NativeSyntheticEvent } from "react-native"
import { GeoJSONSource, Layer, type PressEventWithFeatures } from "@maplibre/maplibre-react-native"
import { pickSmallestZone, ZONE_HITBOX } from "./mapUtils"

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
  /** Makes the circles tappable; absent, the layers stay a drawing. */
  onPressZone?: (id: number) => void
}

export function GeofenceLayers({ fills, labels, haloColor, onPressZone }: Props) {
  const handlePress = useCallback(
    (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
      const id = pickSmallestZone(event.nativeEvent.features)
      if (id !== null) onPressZone?.(id)
    },
    [onPressZone]
  )

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
        <GeoJSONSource
          id="geofence-fills"
          data={fills}
          onPress={onPressZone ? handlePress : undefined}
          hitbox={onPressZone ? ZONE_HITBOX : undefined}
        >
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
