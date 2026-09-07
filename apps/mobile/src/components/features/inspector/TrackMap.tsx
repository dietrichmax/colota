/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useRef, useEffect, useMemo, useState, useCallback } from "react"
import { View, StyleSheet, Text, Pressable, TextInput } from "react-native"
import { GeoJSONSource, Layer, type PressEventWithFeatures } from "@maplibre/maplibre-react-native"
import type { NativeSyntheticEvent } from "react-native"
import { MapPinOff, X, Check, Trash2, Split } from "lucide-react-native"
import { ThemeColors, Trip } from "../../../types/global"
import { getTripColor } from "../../../utils/trips"
import { fontSizes, fonts } from "../../../styles/typography"
import { MapCenterButton } from "../map/MapCenterButton"
import { ColotaMapView, ColotaMapRef } from "../map/ColotaMapView"
import { EmptyState } from "../../ui/EmptyState"
import {
  buildTrackSegmentsGeoJSON,
  buildTrackPointsGeoJSON,
  computeTrackBounds,
  TRACK_LINE_STYLE,
  type TrackLocation
} from "../map/mapUtils"
import { getSpeedUnit } from "../../../utils/geo"
import {
  DEFAULT_MAP_ZOOM,
  HIT_SLOP_MD,
  MAP_ANIMATION_DURATION_MS,
  size,
  space,
  elevation,
  STATE_LAYER_ALPHA
} from "../../../constants"
import { radius } from "@colota/shared"

const HAS_NOTE = ["!=", ["get", "note"], ""]
const trackPointStyle: any = {
  circleRadius: ["case", HAS_NOTE, 5, 4],
  circleColor: ["get", "color"],
  circleOpacity: ["case", HAS_NOTE, 1, 0.4],
  circleStrokeColor: ["get", "color"],
  circleStrokeWidth: ["case", HAS_NOTE, 2, 1.5]
}

interface Props {
  locations: TrackLocation[]
  colors: ThemeColors
  trips?: Trip[]
  trackColor: string
  fitVersion?: number
  /** Notes saved this session, by id. Held by the parent because the tabs unmount this map. */
  noteOverrides?: Record<number, string | undefined>
  /** When provided, the point popup gains an editable note field. Omit for read-only maps. */
  onPointNoteChange?: (id: number, note: string | null) => void
  /** When provided, the point popup gains a delete action. Omit for read-only maps. */
  onPointDelete?: (id: number) => void
  /** When provided, the point popup gains a "start a new trip here" action. */
  onPointSplit?: (id: number) => void
}

export function TrackMap({
  locations,
  colors,
  trips,
  trackColor,
  fitVersion,
  noteOverrides,
  onPointNoteChange,
  onPointDelete,
  onPointSplit
}: Props) {
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
    id: number
    note: string
  } | null>(null)
  const [noteDraft, setNoteDraft] = useState("")
  const [mapReady, setMapReady] = useState(false)

  // Fit map to track bounds when fitVersion changes (date change, trip select)
  const bounds = useMemo(() => computeTrackBounds(locations), [locations])
  const fittedVersionRef = useRef(-1)

  // Zero-extent bounds would make fitBounds zoom past the deepest tile level
  const fitCamera = useCallback(
    (camera: NonNullable<ColotaMapRef["camera"]>) => {
      if (!bounds) return
      if (bounds.sw[0] === bounds.ne[0] && bounds.sw[1] === bounds.ne[1]) {
        camera.setStop({ center: bounds.sw, zoom: DEFAULT_MAP_ZOOM, duration: MAP_ANIMATION_DURATION_MS })
      } else {
        camera.fitBounds([bounds.sw[0], bounds.sw[1], bounds.ne[0], bounds.ne[1]], {
          padding: { top: 60, right: 60, bottom: 60, left: 60 },
          duration: MAP_ANIMATION_DURATION_MS
        })
      }
    },
    [bounds]
  )

  useEffect(() => {
    if (!bounds || !mapReady || !mapRef.current?.camera) return
    if (fitVersion === fittedVersionRef.current) return
    // Defer to next frame so the map's GL context is fully ready after onDidFinishLoadingMap
    requestAnimationFrame(() => {
      const camera = mapRef.current?.camera
      if (!camera) return
      fittedVersionRef.current = fitVersion ?? 0
      fitCamera(camera)
    })
  }, [bounds, mapReady, fitVersion, fitCamera])

  const handleMapReady = useCallback(() => setMapReady(true), [])

  // Clear popup and highlight when the locations change (new day / different trip)
  useEffect(() => {
    setPopup(null)
    setSelectedPoint(null)
  }, [locations])

  const handleFitTrack = useCallback(() => {
    if (bounds && mapRef.current?.camera) {
      fitCamera(mapRef.current.camera)
      setIsCentered(true)
    }
  }, [bounds, fitCamera])

  const handleRegionChange = useCallback((payload: { isUserInteraction: boolean }) => {
    if (payload.isUserInteraction) {
      setIsCentered(false)
    }
  }, [])

  // Owning trip per point, -1 when segmentTrips dropped the segment. Keyed on startIndex,
  // since a running locationCount sum skips over dropped segments
  const tripIdByPoint = useMemo(() => {
    if (!trips) return undefined
    const ids = new Int32Array(locations.length).fill(-1)
    trips.forEach((trip, tripId) => {
      const end = Math.min(trip.startIndex + trip.locationCount, locations.length)
      for (let i = trip.startIndex; i < end; i++) ids[i] = tripId
    })
    return ids
  }, [trips, locations])

  // Line breaks between trips, and on both sides of every dropped point
  const skipIndices = useMemo(() => {
    if (!tripIdByPoint) return undefined
    const indices = new Set<number>()
    for (let i = 1; i < tripIdByPoint.length; i++) {
      if (tripIdByPoint[i] < 0 || tripIdByPoint[i] !== tripIdByPoint[i - 1]) indices.add(i)
    }
    return indices
  }, [tripIdByPoint])

  // Per-location colors
  const locationColors = useMemo(() => {
    if (!tripIdByPoint || !trips) return locations.map(() => trackColor)
    return Array.from(tripIdByPoint, (tripId) => (tripId < 0 ? trackColor : getTripColor(trips[tripId].index)))
  }, [tripIdByPoint, trips, locations, trackColor])

  // GeoJSON data
  const segmentsGeoJSON = useMemo(
    () => buildTrackSegmentsGeoJSON(locations, colors, { skipIndices, locationColors }),
    [locations, colors, skipIndices, locationColors]
  )
  const pointsGeoJSON = useMemo(() => {
    const locs =
      !noteOverrides || Object.keys(noteOverrides).length === 0
        ? locations
        : locations.map((l) => (l.id != null && l.id in noteOverrides ? { ...l, note: noteOverrides[l.id] } : l))
    return buildTrackPointsGeoJSON(locs, colors, locationColors)
  }, [locations, colors, locationColors, noteOverrides])

  // Highlight GeoJSON for selected point
  const highlightGeoJSON = useMemo(() => {
    const coord = selectedPoint ? [selectedPoint.longitude, selectedPoint.latitude] : null
    const color = selectedPoint?.color ?? trackColor
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
  }, [selectedPoint, trackColor])

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
      const color = feature.properties.color ?? trackColor
      const id = (feature.properties.id as number | undefined) ?? -1
      const note = feature.properties.note ?? ""
      setSelectedPoint({ longitude: coord[0], latitude: coord[1], color })
      setNoteDraft(note)
      setPopup({
        coordinate: coord,
        speed: feature.properties.speed,
        timestamp: feature.properties.timestamp,
        accuracy: feature.properties.accuracy,
        altitude: feature.properties.altitude,
        color,
        id,
        note
      })
    },
    [trackColor]
  )

  const handleSaveNote = useCallback(() => {
    if (!popup || popup.id < 0 || !onPointNoteChange) return
    const saved = noteDraft.trim()
    onPointNoteChange(popup.id, saved || null)
    setPopup((p) => (p ? { ...p, note: saved } : p))
    setNoteDraft(saved)
  }, [popup, noteDraft, onPointNoteChange])

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
          <Layer id="track-line" type="line" style={TRACK_LINE_STYLE} />
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
        <View style={[styles.emptyOverlay, { backgroundColor: colors.background }]}>
          <EmptyState icon={MapPinOff} title="No locations" hint="No tracked locations for this day" />
        </View>
      )}

      {!isEmpty && popup && (
        <View style={[styles.popupCard, { backgroundColor: colors.card }]}>
          <View style={styles.popupHeader}>
            <Text style={[styles.popupTime, { color: colors.text }]}>
              {popup.timestamp ? new Date(popup.timestamp * 1000).toLocaleTimeString() : "-"}
            </Text>
            <View style={styles.popupActions}>
              {onPointSplit && popup.id >= 0 && (
                <Pressable
                  testID="popup-split-point"
                  onPress={() => onPointSplit(popup.id)}
                  hitSlop={HIT_SLOP_MD}
                  android_ripple={{ color: colors.textSecondary + STATE_LAYER_ALPHA, borderless: true }}
                  accessibilityRole="button"
                  accessibilityLabel="Start a new trip at this point"
                >
                  <Split size={size.icon.sm} color={colors.text} />
                </Pressable>
              )}
              {onPointDelete && popup.id >= 0 && (
                <Pressable
                  testID="popup-delete-point"
                  onPress={() => onPointDelete(popup.id)}
                  hitSlop={HIT_SLOP_MD}
                  android_ripple={{ color: colors.textSecondary + STATE_LAYER_ALPHA, borderless: true }}
                  accessibilityRole="button"
                  accessibilityLabel="Delete this point"
                >
                  <Trash2 size={size.icon.sm} color={colors.error} />
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close point details"
                onPress={() => {
                  setPopup(null)
                  setSelectedPoint(null)
                }}
                hitSlop={HIT_SLOP_MD}
                android_ripple={{ color: colors.textSecondary + STATE_LAYER_ALPHA, borderless: true }}
              >
                <X size={size.icon.sm} color={colors.textSecondary} />
              </Pressable>
            </View>
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
          {popup.id >= 0 && (onPointNoteChange || popup.note !== "") && (
            <View style={[styles.noteSection, { borderTopColor: colors.border }]}>
              <Text style={[styles.popupLabel, { color: colors.textSecondary }]}>Note</Text>
              {onPointNoteChange ? (
                <View style={styles.noteRow}>
                  <TextInput
                    testID="popup-note-input"
                    value={noteDraft}
                    onChangeText={setNoteDraft}
                    placeholder="Add a note"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.noteInput, { color: colors.text, backgroundColor: colors.well }]}
                    multiline
                  />
                  {noteDraft.trim() !== popup.note && (
                    <Pressable
                      testID="popup-note-save"
                      accessibilityRole="button"
                      accessibilityLabel="Save note"
                      onPress={handleSaveNote}
                      hitSlop={HIT_SLOP_MD}
                      android_ripple={{ color: colors.primary + STATE_LAYER_ALPHA, borderless: true }}
                      style={styles.noteSaveBtn}
                    >
                      <Check size={size.icon.md} color={colors.primary} />
                    </Pressable>
                  )}
                </View>
              ) : (
                <Text style={[styles.popupValue, { color: colors.text }]}>{popup.note}</Text>
              )}
            </View>
          )}
        </View>
      )}

      {!isEmpty && <MapCenterButton visible={!isCentered} onPress={handleFitTrack} />}

      {!isEmpty && trips && trips.length > 1 && (
        <View style={[styles.legend, { backgroundColor: colors.card }]}>
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
    padding: space.xl,
    zIndex: 20
  },
  popupCard: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    padding: space.md,
    borderRadius: radius.md,
    elevation: elevation.overlay,
    zIndex: 10
  },
  popupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: space.xs
  },
  popupActions: {
    flexDirection: "row",
    alignItems: "center",
    // Both icons carry HIT_SLOP_MD, so a smaller gap overlaps delete with close
    gap: space.xl
  },
  popupTime: {
    ...fonts.semiBold,
    fontSize: fontSizes.description
  },
  popupRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  popupLabel: {
    fontSize: fontSizes.small,
    ...fonts.semiBold
  },
  popupValue: {
    ...fonts.medium,
    fontSize: fontSizes.caption
  },
  noteSection: {
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    marginTop: space.xs
  },
  noteInput: {
    flex: 1,
    fontSize: fontSizes.description,
    paddingVertical: space.xxs,
    paddingHorizontal: space.sm,
    borderRadius: 6,
    minHeight: 32,
    maxHeight: 80
  },
  noteSaveBtn: {
    padding: space.sm
  },
  legend: {
    position: "absolute",
    bottom: 30,
    left: 10,
    borderRadius: radius.md,
    padding: space.sm,
    gap: space.xs,
    elevation: elevation.floating,
    zIndex: 10
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill
  },
  legendLabel: {
    fontSize: fontSizes.small,
    ...fonts.medium
  }
})
