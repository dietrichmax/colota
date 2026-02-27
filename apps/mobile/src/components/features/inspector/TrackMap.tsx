/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useRef, useEffect, useMemo, useState, useCallback } from "react"
import { View, StyleSheet, Text, Pressable } from "react-native"
import { ShapeSource, LineLayer, CircleLayer } from "@maplibre/maplibre-react-native"
import { MapPinOff, X } from "lucide-react-native"
import { ThemeColors, Trip } from "../../../types/global"
import { getTripColor } from "../../../utils/trips"
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
import { MAP_ANIMATION_DURATION_MS } from "../../../constants"

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

interface Props {
  locations: TrackLocation[]
  selectedPoint: { latitude: number; longitude: number } | null
  colors: ThemeColors
  trips?: Trip[]
  fitVersion?: number
}

export function TrackMap({ locations, selectedPoint, colors, trips, fitVersion }: Props) {
  const mapRef = useRef<ColotaMapRef>(null)
  const [isCentered, setIsCentered] = useState(true)
  const [popup, setPopup] = useState<{
    coordinate: [number, number]
    speed: number
    timestamp: number
    accuracy: number
    altitude: number
    color: string
  } | null>(null)
  const [mapReady, setMapReady] = useState(false)

  // Fit map to track bounds when fitVersion changes (date change, trip select)
  const bounds = useMemo(() => computeTrackBounds(locations), [locations])
  const fittedVersionRef = useRef(-1)

  useEffect(() => {
    if (!bounds || !mapReady || !mapRef.current?.camera) return
    if (fitVersion === fittedVersionRef.current) return
    fittedVersionRef.current = fitVersion ?? 0
    mapRef.current.camera.fitBounds(bounds.ne, bounds.sw, [60, 60, 60, 60], MAP_ANIMATION_DURATION_MS)
  }, [bounds, mapReady, fitVersion])

  const handleMapReady = useCallback(() => setMapReady(true), [])

  // Clear popup when underlying locations change (new day / different trip)
  useEffect(() => {
    setPopup(null)
  }, [locations])

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

  // Trip boundary indices to avoid drawing lines between trips
  const skipIndices = useMemo(() => {
    if (!trips || trips.length <= 1) return undefined
    const indices = new Set<number>()
    let offset = 0
    for (const trip of trips) {
      if (offset > 0) indices.add(offset)
      offset += trip.locationCount
    }
    return indices
  }, [trips])

  // Per-location colors
  const locationColors = useMemo(() => {
    if (trips) {
      const arr: string[] = []
      for (const trip of trips) {
        const tripColor = getTripColor(trip.index)
        for (let j = 0; j < trip.locationCount; j++) {
          arr.push(tripColor)
        }
      }
      // Fill remaining points with default color
      while (arr.length < locations.length) {
        arr.push(colors.primary)
      }
      return arr
    }
    return locations.map(() => colors.primary)
  }, [trips, locations, colors.primary])

  // GeoJSON data
  const segmentsGeoJSON = useMemo(
    () => buildTrackSegmentsGeoJSON(locations, colors, skipIndices, locationColors),
    [locations, colors, skipIndices, locationColors]
  )
  const pointsGeoJSON = useMemo(
    () => buildTrackPointsGeoJSON(locations, colors, locationColors),
    [locations, colors, locationColors]
  )

  // Highlight GeoJSON for selected point
  const highlightGeoJSON = useMemo(() => {
    const coord = selectedPoint ? [selectedPoint.longitude, selectedPoint.latitude] : null
    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: { color: colors.primary, visible: coord ? 1 : 0 },
          geometry: { type: "Point" as const, coordinates: coord ?? [0, 0] }
        }
      ]
    }
  }, [selectedPoint, colors.primary])

  const highlightStyle = useMemo(
    () => ({
      circleRadius: 8,
      circleColor: ["get", "color"] as any,
      circleOpacity: ["get", "visible"] as any,
      circleStrokeColor: "#ffffff",
      circleStrokeWidth: ["*", 2.5, ["get", "visible"]] as any
    }),
    []
  )

  const { factor: speedFactor, unit: speedUnit } = getSpeedUnit()

  const lastPointPressRef = useRef(0)
  const handlePointPress = useCallback(
    (event: { features: GeoJSON.Feature[]; coordinates: { latitude: number; longitude: number } }) => {
      const feature = event.features[0]
      if (!feature?.properties || !feature?.geometry) return
      lastPointPressRef.current = Date.now()
      const geom = feature.geometry as GeoJSON.Point
      const coord = geom.coordinates as [number, number]
      setPopup({
        coordinate: coord,
        speed: feature.properties.speed,
        timestamp: feature.properties.timestamp,
        accuracy: feature.properties.accuracy,
        altitude: feature.properties.altitude,
        color: feature.properties.color ?? colors.primary
      })
    },
    [colors.primary]
  )

  const handleMapPress = useCallback(() => {
    if (Date.now() - lastPointPressRef.current < 200) return
    setPopup(null)
  }, [])

  const initialCenter = useMemo(
    () => [locations[0]?.longitude ?? 0, locations[0]?.latitude ?? 0] as [number, number],
    [locations]
  )

  // Memoize the map block to prevent popup state changes from triggering re-renders
  const mapView = useMemo(
    () => (
      <ColotaMapView
        ref={mapRef}
        initialCenter={initialCenter}
        initialZoom={2}
        onPress={handleMapPress}
        onRegionDidChange={handleRegionChange}
        onMapReady={handleMapReady}
      >
        <ShapeSource id="track-segments" shape={segmentsGeoJSON}>
          <LineLayer id="track-line" style={trackLineStyle} />
        </ShapeSource>
        <ShapeSource
          id="track-points"
          shape={pointsGeoJSON}
          onPress={handlePointPress}
          hitbox={{ width: 20, height: 20 }}
        >
          <CircleLayer id="track-point-circles" style={trackPointStyle} />
        </ShapeSource>
        <ShapeSource id="highlight-point" shape={highlightGeoJSON}>
          <CircleLayer id="highlight-circle" style={highlightStyle} />
        </ShapeSource>
      </ColotaMapView>
    ),
    [
      initialCenter,
      handleMapPress,
      handleRegionChange,
      handleMapReady,
      segmentsGeoJSON,
      pointsGeoJSON,
      highlightGeoJSON,
      handlePointPress,
      highlightStyle
    ]
  )

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
      {mapView}

      {/* Point detail popup */}
      {popup && (
        <View style={[styles.popupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.popupHeader}>
            <Text style={[styles.popupTime, { color: colors.text }]}>
              {popup.timestamp ? new Date(popup.timestamp * 1000).toLocaleTimeString() : "-"}
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

      {/* Trip legend */}
      {trips && trips.length > 1 && (
        <View style={[styles.legend, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {trips.map((trip) => (
            <View key={trip.index} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: getTripColor(trip.index) }]} />
              <Text style={[styles.legendLabel, { color: colors.textSecondary }]}>Trip {trip.index}</Text>
            </View>
          ))}
        </View>
      )}
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
  legend: {
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
