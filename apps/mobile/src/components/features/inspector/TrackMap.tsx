/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useRef, useEffect, useMemo, useState, useCallback } from "react"
import { View, StyleSheet, Text, Pressable } from "react-native"
import { GeoJSONSource, Layer, type PressEventWithFeatures } from "@maplibre/maplibre-react-native"
import type { NativeSyntheticEvent } from "react-native"
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
import { HIT_SLOP_MD, MAP_ANIMATION_DURATION_MS } from "../../../constants"

const trackLineStyle: any = {
  lineColor: ["get", "color"],
  lineWidth: 3,
  lineCap: "round",
  lineJoin: "round"
}

const trackPointStyle: any = {
  circleRadius: 4,
  circleColor: ["get", "color"],
  circleOpacity: 0.4,
  circleStrokeColor: ["get", "color"],
  circleStrokeWidth: 1.5
}

interface Props {
  locations: TrackLocation[]
  colors: ThemeColors
  trips?: Trip[]
  fitVersion?: number
}

export function TrackMap({ locations, colors, trips, fitVersion }: Props) {
  const mapRef = useRef<ColotaMapRef>(null)
  const [isCentered, setIsCentered] = useState(true)
  const [selectedPoint, setSelectedPoint] = useState<{
    latitude: number
    longitude: number
    color: string
  } | null>(null)
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
    // Defer to next frame so the map's GL context is fully ready after onDidFinishLoadingMap
    requestAnimationFrame(() => {
      if (!mapRef.current?.camera) return
      fittedVersionRef.current = fitVersion ?? 0
      mapRef.current.camera.fitBounds([bounds.sw[0], bounds.sw[1], bounds.ne[0], bounds.ne[1]], {
        padding: { top: 60, right: 60, bottom: 60, left: 60 },
        duration: MAP_ANIMATION_DURATION_MS
      })
    })
  }, [bounds, mapReady, fitVersion])

  const handleMapReady = useCallback(() => setMapReady(true), [])

  // Clear popup and highlight when underlying locations change (new day / different trip)
  useEffect(() => {
    setPopup(null)
    setSelectedPoint(null)
  }, [locations])

  const handleFitTrack = useCallback(() => {
    if (bounds && mapRef.current?.camera) {
      mapRef.current.camera.fitBounds([bounds.sw[0], bounds.sw[1], bounds.ne[0], bounds.ne[1]], {
        padding: { top: 60, right: 60, bottom: 60, left: 60 },
        duration: MAP_ANIMATION_DURATION_MS
      })
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
    () => buildTrackSegmentsGeoJSON(locations, colors, { skipIndices, locationColors }),
    [locations, colors, skipIndices, locationColors]
  )
  const pointsGeoJSON = useMemo(
    () => buildTrackPointsGeoJSON(locations, colors, locationColors),
    [locations, colors, locationColors]
  )

  // Highlight GeoJSON for selected point
  const highlightGeoJSON = useMemo(() => {
    const coord = selectedPoint ? [selectedPoint.longitude, selectedPoint.latitude] : null
    const color = selectedPoint?.color ?? colors.primary
    return {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          properties: { color, visible: coord ? 1 : 0 },
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
      circleStrokeColor: colors.cardElevated,
      circleStrokeWidth: ["*", 2.5, ["get", "visible"]] as any
    }),
    [colors.cardElevated]
  )

  const { factor: speedFactor, unit: speedUnit } = getSpeedUnit()

  const lastPointPressRef = useRef(0)
  const handlePointPress = useCallback(
    (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
      const feature = event.nativeEvent.features[0]
      if (!feature?.properties || !feature?.geometry) return
      lastPointPressRef.current = Date.now()
      const geom = feature.geometry as GeoJSON.Point
      const coord = geom.coordinates as [number, number]
      const color = feature.properties.color ?? colors.primary
      setSelectedPoint({ longitude: coord[0], latitude: coord[1], color })
      setPopup({
        coordinate: coord,
        speed: feature.properties.speed,
        timestamp: feature.properties.timestamp,
        accuracy: feature.properties.accuracy,
        altitude: feature.properties.altitude,
        color
      })
    },
    [colors.primary]
  )

  const handleMapPress = useCallback(() => {
    if (Date.now() - lastPointPressRef.current < 200) return
    setPopup(null)
    setSelectedPoint(null)
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
        <GeoJSONSource id="track-segments" data={segmentsGeoJSON}>
          <Layer id="track-line" type="line" style={trackLineStyle} />
        </GeoJSONSource>
        <GeoJSONSource
          id="track-points"
          data={pointsGeoJSON}
          onPress={handlePointPress}
          hitbox={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <Layer id="track-point-circles" type="circle" style={trackPointStyle} />
        </GeoJSONSource>
        <GeoJSONSource id="highlight-point" data={highlightGeoJSON}>
          <Layer id="highlight-circle" type="circle" style={highlightStyle} />
        </GeoJSONSource>
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

  const isEmpty = locations.length === 0

  return (
    <View style={styles.container}>
      {mapView}

      {isEmpty && (
        <View style={[styles.emptyOverlay, { backgroundColor: colors.card, borderRadius: colors.borderRadius }]}>
          <View style={[styles.iconCircle, { backgroundColor: colors.border }]}>
            <MapPinOff size={32} color={colors.textSecondary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Locations</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>No tracked locations for this day.</Text>
        </View>
      )}

      {!isEmpty && popup && (
        <View style={[styles.popupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.popupHeader}>
            <Text style={[styles.popupTime, { color: colors.text }]}>
              {popup.timestamp ? new Date(popup.timestamp * 1000).toLocaleTimeString() : "-"}
            </Text>
            <Pressable
              onPress={() => {
                setPopup(null)
                setSelectedPoint(null)
              }}
              hitSlop={HIT_SLOP_MD}
              style={({ pressed }) => pressed && { opacity: colors.pressedOpacity }}
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

      {!isEmpty && <MapCenterButton visible={!isCentered} onPress={handleFitTrack} />}

      {!isEmpty && trips && trips.length > 1 && (
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
  emptyOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    zIndex: 20
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
    bottom: 30,
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
