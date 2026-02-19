/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useRef, useEffect, useMemo, useState, useCallback } from "react"
import { View, StyleSheet, Text, Pressable } from "react-native"
import { ShapeSource, LineLayer, CircleLayer } from "@maplibre/maplibre-react-native"
import { MapPinOff, X } from "lucide-react-native"
import { ThemeColors } from "../../../types/global"
import { fonts } from "../../../styles/typography"
import { MapCenterButton } from "../map/MapCenterButton"
import { ColotaMapView, ColotaMapRef } from "../map/ColotaMapView"
import {
  buildTrackSegmentsGeoJSON,
  buildTrackPointsGeoJSON,
  computeTrackBounds,
  type TrackLocation
} from "../map/mapUtils"
import { getSpeedUnit } from "../../../utils/geo"

// MapLibre layer styles (extracted to satisfy no-inline-styles lint rule)
const trackLineStyle = {
  lineColor: ["get", "color"] as const,
  lineWidth: 3,
  lineCap: "round" as const,
  lineJoin: "round" as const
}

const trackPointStyle = {
  circleRadius: 4,
  circleColor: ["get", "color"] as const,
  circleOpacity: 0.4,
  circleStrokeColor: ["get", "color"] as const,
  circleStrokeWidth: 1.5
}

const endpointStyle = {
  circleRadius: 8,
  circleColor: ["get", "color"] as const,
  circleStrokeColor: "#ffffff",
  circleStrokeWidth: 2
}
import { MAP_ANIMATION_DURATION_MS } from "../../../constants"

interface Props {
  locations: TrackLocation[]
  selectedPoint: { latitude: number; longitude: number } | null
  colors: ThemeColors
}

export function TrackMap({ locations, selectedPoint, colors }: Props) {
  const mapRef = useRef<ColotaMapRef>(null)
  const [isCentered, setIsCentered] = useState(true)
  const [popup, setPopup] = useState<{
    coordinate: [number, number]
    speed: number
    timestamp: number
    accuracy: number
    altitude: number
  } | null>(null)
  const [mapReady, setMapReady] = useState(false)

  // Fit map to track bounds on first load
  const bounds = useMemo(() => computeTrackBounds(locations), [locations])

  useEffect(() => {
    if (bounds && mapReady && mapRef.current?.camera) {
      mapRef.current.camera.fitBounds(bounds.ne, bounds.sw, [60, 60, 60, 60], MAP_ANIMATION_DURATION_MS)
    }
  }, [bounds, mapReady])

  const handleMapReady = useCallback(() => setMapReady(true), [])

  // Zoom to selected point from table tap
  useEffect(() => {
    if (selectedPoint && mapRef.current?.camera) {
      mapRef.current.camera.setCamera({
        centerCoordinate: [selectedPoint.longitude, selectedPoint.latitude],
        zoomLevel: 17,
        animationDuration: 500,
        animationMode: "flyTo"
      })
    }
  }, [selectedPoint])

  const handleFitTrack = useCallback(() => {
    if (bounds && mapRef.current?.camera) {
      mapRef.current.camera.fitBounds(bounds.ne, bounds.sw, [60, 60, 60, 60], MAP_ANIMATION_DURATION_MS)
      setIsCentered(true)
    }
  }, [bounds])

  const handleRegionChange = useCallback((payload: { isUserInteraction: boolean }) => {
    if (payload.isUserInteraction) {
      setIsCentered(false)
    }
  }, [])

  // GeoJSON data
  const segmentsGeoJSON = useMemo(() => buildTrackSegmentsGeoJSON(locations, colors), [locations, colors])
  const pointsGeoJSON = useMemo(() => buildTrackPointsGeoJSON(locations, colors), [locations, colors])

  // Highlight point GeoJSON
  const highlightGeoJSON = useMemo(() => {
    if (!selectedPoint) return null
    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "Point" as const,
            coordinates: [selectedPoint.longitude, selectedPoint.latitude]
          }
        }
      ]
    }
  }, [selectedPoint])

  const highlightStyle = useMemo(
    () => ({
      circleRadius: 12,
      circleColor: colors.primary + "44",
      circleStrokeColor: colors.primary,
      circleStrokeWidth: 2
    }),
    [colors.primary]
  )

  // Start/end endpoint GeoJSON (single ShapeSource with data-driven color)
  const endpointsGeoJSON = useMemo(() => {
    if (locations.length === 0) return null
    const features: GeoJSON.Feature[] = [
      {
        type: "Feature",
        properties: { color: colors.success },
        geometry: { type: "Point", coordinates: [locations[0].longitude, locations[0].latitude] }
      }
    ]
    if (locations.length > 1) {
      const last = locations[locations.length - 1]
      features.push({
        type: "Feature",
        properties: { color: colors.error },
        geometry: { type: "Point", coordinates: [last.longitude, last.latitude] }
      })
    }
    return { type: "FeatureCollection" as const, features }
  }, [locations, colors])

  // Speed legend data
  const { factor: speedFactor, unit: speedUnit } = getSpeedUnit()
  const slowLabel = `< ${Math.round(2 * speedFactor)} ${speedUnit}`
  const midLabel = `${Math.round(2 * speedFactor)}–${Math.round(8 * speedFactor)} ${speedUnit}`
  const fastLabel = `> ${Math.round(8 * speedFactor)} ${speedUnit}`

  // Handle point tap (track timestamp to distinguish from map tap)
  const lastPointPressRef = useRef(0)
  const handlePointPress = useCallback(
    (event: { features: GeoJSON.Feature[]; coordinates: { latitude: number; longitude: number } }) => {
      const feature = event.features[0]
      if (!feature?.properties) return
      lastPointPressRef.current = Date.now()
      setPopup({
        coordinate: [event.coordinates.longitude, event.coordinates.latitude],
        speed: feature.properties.speed,
        timestamp: feature.properties.timestamp,
        accuracy: feature.properties.accuracy,
        altitude: feature.properties.altitude
      })
    },
    []
  )

  // Tap on empty map area dismisses popup
  const handleMapPress = useCallback(() => {
    if (Date.now() - lastPointPressRef.current < 200) return
    setPopup(null)
  }, [])

  if (locations.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.card, borderRadius: colors.borderRadius }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.border }]}>
          <MapPinOff size={32} color={colors.textSecondary} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No Locations</Text>
        <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>No tracked locations for this day.</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ColotaMapView
        ref={mapRef}
        initialCenter={locations.length > 0 ? [locations[0].longitude, locations[0].latitude] : [0, 0]}
        initialZoom={2}
        onPress={handleMapPress}
        onRegionDidChange={handleRegionChange}
        onMapReady={handleMapReady}
      >
        {/* Speed-colored track segments */}
        <ShapeSource id="track-segments" shape={segmentsGeoJSON}>
          <LineLayer id="track-line" style={trackLineStyle} />
        </ShapeSource>

        {/* Track point dots */}
        <ShapeSource
          id="track-points"
          shape={pointsGeoJSON}
          onPress={handlePointPress}
          hitbox={{ width: 20, height: 20 }}
        >
          <CircleLayer id="track-point-circles" style={trackPointStyle} />
        </ShapeSource>

        {/* Highlight selected point */}
        {highlightGeoJSON && (
          <ShapeSource id="highlight" shape={highlightGeoJSON}>
            <CircleLayer id="highlight-circle" style={highlightStyle} />
          </ShapeSource>
        )}

        {/* Start/end markers via ShapeSource + CircleLayer */}
        {endpointsGeoJSON && (
          <ShapeSource id="endpoints" shape={endpointsGeoJSON}>
            <CircleLayer id="endpoint-circles" style={endpointStyle} />
          </ShapeSource>
        )}
      </ColotaMapView>

      {/* Popup card for tapped point (outside MapView for reliable touch on Android) */}
      {popup && (
        <View style={[styles.popupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.popupHeader}>
            <Text style={[styles.popupTime, { color: colors.text }]}>
              {popup.timestamp ? new Date(popup.timestamp * 1000).toLocaleTimeString() : "—"}
            </Text>
            <Pressable
              onPress={() => setPopup(null)}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              style={({ pressed }) => pressed && { opacity: 0.7 }}
            >
              <X size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.popupRow}>
            <Text style={[styles.popupLabel, { color: colors.textSecondary }]}>Speed</Text>
            <Text style={[styles.popupValue, { color: colors.text }]}>
              {(popup.speed * speedFactor).toFixed(1)} {speedUnit}
            </Text>
          </View>
          <View style={styles.popupRow}>
            <Text style={[styles.popupLabel, { color: colors.textSecondary }]}>Accuracy</Text>
            <Text style={[styles.popupValue, { color: colors.text }]}>
              {"\u00B1"}
              {popup.accuracy.toFixed(0)}m
            </Text>
          </View>
          <View style={styles.popupRow}>
            <Text style={[styles.popupLabel, { color: colors.textSecondary }]}>Altitude</Text>
            <Text style={[styles.popupValue, { color: colors.text }]}>{popup.altitude.toFixed(0)}m</Text>
          </View>
        </View>
      )}

      <MapCenterButton visible={!isCentered} onPress={handleFitTrack} />

      {/* Speed legend */}
      <View style={[styles.speedLegend, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>{slowLabel}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
          <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>{midLabel}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
          <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>{fastLabel}</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden"
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16
  },
  emptyTitle: {
    fontSize: 18,
    ...fonts.bold,
    textAlign: "center"
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20
  },
  popupCard: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    zIndex: 10
  },
  popupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4
  },
  popupTime: {
    fontWeight: "600",
    fontSize: 13
  },
  popupRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  popupLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    fontWeight: "600"
  },
  popupValue: {
    fontWeight: "500",
    fontSize: 12
  },
  speedLegend: {
    position: "absolute",
    bottom: 10,
    left: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
    gap: 4,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    zIndex: 10
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  legendLabel: {
    fontSize: 11,
    fontWeight: "500"
  }
})
