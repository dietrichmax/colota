/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useRef, useEffect, useMemo, useState, useCallback } from "react"
import { View, StyleSheet } from "react-native"
import { GeoJSONSource, Layer, type PressEventWithFeatures, type ViewPadding } from "@maplibre/maplibre-react-native"
import type { NativeSyntheticEvent } from "react-native"
import { LocateFixed } from "lucide-react-native"
import { ThemeColors, Trip } from "../../../types/global"
import { getTripColor } from "../../../utils/trips"
import { MapActionButton } from "../map/MapActionButton"
import { ColotaMapView, ColotaMapRef } from "../map/ColotaMapView"
import {
  buildTripTerminalsGeoJSON,
  buildTrackSegmentsGeoJSON,
  buildTrackPointsGeoJSON,
  computeTrackBounds,
  TRACK_CASING_STYLE,
  TRACK_LINE_STYLE,
  type TrackLocation
} from "../map/mapUtils"
import { DEFAULT_MAP_ZOOM, MAP_ANIMATION_DURATION_MS, WORLD_MAP_ZOOM, size, space } from "../../../constants"

const FOCUSED_FILTER: ["==", ["get", "focused"], true] = ["==", ["get", "focused"], true]
const START_FILTER: ["==", ["get", "kind"], "start"] = ["==", ["get", "kind"], "start"]
// A source press bubbles to the map press, and the point source can report after the line source.
const FEATURE_PRESS_WINDOW_MS = 200
const LINE_PRESS_DEFER_MS = 80
const END_FILTER: ["==", ["get", "kind"], "end"] = ["==", ["get", "kind"], "end"]
export const POINT_HITBOX: ViewPadding = {
  top: size.touch / 2,
  right: size.touch / 2,
  bottom: size.touch / 2,
  left: size.touch / 2
}

const HAS_NOTE = ["!=", ["get", "note"], ""]
const trackPointStyle: any = {
  circleRadius: ["case", HAS_NOTE, 5, 4],
  circleColor: ["get", "color"],
  circleOpacity: ["case", HAS_NOTE, 1, 0.4],
  circleStrokeColor: ["get", "color"],
  circleStrokeWidth: ["case", HAS_NOTE, 2, 1.5]
}

type Bounds = NonNullable<ReturnType<typeof computeTrackBounds>>

interface Props {
  locations: TrackLocation[]
  colors: ThemeColors
  trips?: Trip[]
  trackColor: string
  fitVersion?: number
  /** Notes saved this session, by id. Held by the parent because the tabs unmount this map. */
  noteOverrides?: Record<number, string | undefined>
  selectedPointId?: number | null
  onSelectPoint: (id: number | null) => void
  /** A `Trip.index`, the number the trip rows and `getTripColor` use. */
  focusedTripIndex?: number | null
  onFocusTrip: (index: number | null) => void
  cameraPadding: ViewPadding
  controlsBottom: number
  controlsEnd: number
  onMapReady?: () => void
}

export function TrackMap({
  locations,
  colors,
  trips,
  trackColor,
  fitVersion,
  noteOverrides,
  selectedPointId,
  onSelectPoint,
  focusedTripIndex,
  onFocusTrip,
  cameraPadding,
  controlsBottom,
  controlsEnd,
  onMapReady
}: Props) {
  const mapRef = useRef<ColotaMapRef>(null)
  const [isCentered, setIsCentered] = useState(true)
  const [mapReady, setMapReady] = useState(false)

  const focusedTrip = useMemo(
    () => (focusedTripIndex == null ? undefined : trips?.find((trip) => trip.index === focusedTripIndex)),
    [trips, focusedTripIndex]
  )
  const dayBounds = useMemo(() => computeTrackBounds(locations), [locations])
  const fitTarget = useMemo(
    () =>
      focusedTrip
        ? computeTrackBounds(
            locations.slice(focusedTrip.startIndex, focusedTrip.startIndex + focusedTrip.locationCount)
          )
        : dayBounds,
    [focusedTrip, locations, dayBounds]
  )
  const fittedVersionRef = useRef(-1)

  // Zero-extent bounds would make fitBounds zoom past the deepest tile level
  const fitCamera = useCallback(
    (camera: NonNullable<ColotaMapRef["camera"]>, bounds: Bounds) => {
      if (bounds.sw[0] === bounds.ne[0] && bounds.sw[1] === bounds.ne[1]) {
        camera.setStop({
          center: bounds.sw,
          zoom: DEFAULT_MAP_ZOOM,
          padding: cameraPadding,
          duration: MAP_ANIMATION_DURATION_MS
        })
      } else {
        camera.fitBounds([bounds.sw[0], bounds.sw[1], bounds.ne[0], bounds.ne[1]], {
          padding: cameraPadding,
          duration: MAP_ANIMATION_DURATION_MS
        })
      }
    },
    [cameraPadding]
  )

  const selectedIndex = selectedPointId == null ? -1 : locations.findIndex((l) => l.id === selectedPointId)
  const mountTargetRef = useRef<[number, number] | null>(
    selectedIndex >= 0 ? [locations[selectedIndex].longitude, locations[selectedIndex].latitude] : null
  )

  useEffect(() => {
    if (!fitTarget || !mapReady || !mapRef.current?.camera) return
    if (fitVersion === fittedVersionRef.current) return
    // Defer to next frame so the map's GL context is fully ready after onDidFinishLoadingMap
    requestAnimationFrame(() => {
      const camera = mapRef.current?.camera
      if (!camera) return
      fittedVersionRef.current = fitVersion ?? 0
      const target = mountTargetRef.current
      if (target) {
        mountTargetRef.current = null
        camera.easeTo({
          center: target,
          zoom: DEFAULT_MAP_ZOOM,
          padding: cameraPadding,
          duration: MAP_ANIMATION_DURATION_MS
        })
        return
      }
      fitCamera(camera, fitTarget)
    })
  }, [fitTarget, mapReady, fitVersion, fitCamera, cameraPadding])

  const handleMapReady = useCallback(() => {
    setMapReady(true)
    onMapReady?.()
  }, [onMapReady])

  const handleFitDay = useCallback(() => {
    if (dayBounds && mapRef.current?.camera) {
      fitCamera(mapRef.current.camera, dayBounds)
      setIsCentered(true)
    }
  }, [dayBounds, fitCamera])

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

  const locationColors = useMemo(() => {
    if (!tripIdByPoint || !trips) return locations.map(() => trackColor)
    return Array.from(tripIdByPoint, (tripId) => (tripId < 0 ? trackColor : getTripColor(trips[tripId].index)))
  }, [tripIdByPoint, trips, locations, trackColor])

  const locationTrips = useMemo(() => {
    if (!tripIdByPoint || !trips) return undefined
    return Array.from(tripIdByPoint, (tripId) => (tripId < 0 ? -1 : trips[tripId].index))
  }, [tripIdByPoint, trips])

  const segmentsGeoJSON = useMemo(
    () =>
      buildTrackSegmentsGeoJSON(locations, colors, {
        skipIndices,
        locationColors,
        locationTrips,
        focusedTrip: focusedTripIndex
      }),
    [locations, colors, skipIndices, locationColors, locationTrips, focusedTripIndex]
  )
  const pointsGeoJSON = useMemo(() => {
    const locs =
      !noteOverrides || Object.keys(noteOverrides).length === 0
        ? locations
        : locations.map((l) => (l.id != null && l.id in noteOverrides ? { ...l, note: noteOverrides[l.id] } : l))
    return buildTrackPointsGeoJSON(locs, colors, locationColors)
  }, [locations, colors, locationColors, noteOverrides])

  const hasFocus = focusedTripIndex != null
  const lineStyles = useMemo(() => {
    const lineOpacity = ["case", ["any", !hasFocus, ["get", "focused"]], 1, 0.4]
    return {
      casing: { ...TRACK_CASING_STYLE, lineColor: colors.card, lineOpacity },
      line: { ...TRACK_LINE_STYLE, lineWidth: ["case", ["get", "focused"], 5, 3], lineOpacity },
      // Drawn again in their own layers above the rest, so the focused trip is never under a later one.
      casingFocused: { ...TRACK_CASING_STYLE, lineColor: colors.card, lineWidth: 7 },
      lineFocused: { ...TRACK_LINE_STYLE, lineWidth: 5 }
    }
  }, [hasFocus, colors.card])

  const terminalsGeoJSON = useMemo(() => {
    const terminalTrips = trips
      ? trips.map((t) => ({
          index: t.index,
          color: getTripColor(t.index),
          locations: locations.slice(t.startIndex, t.startIndex + t.locationCount)
        }))
      : [{ index: 0, color: trackColor, locations }]
    return buildTripTerminalsGeoJSON(terminalTrips, focusedTripIndex)
  }, [trips, trackColor, locations, focusedTripIndex])
  const terminalStyles = useMemo(() => {
    const opacity = ["case", ["any", !hasFocus, ["get", "focused"]], 1, 0.4] as any
    return {
      start: {
        circleRadius: 6,
        circleColor: ["get", "color"] as any,
        circleStrokeColor: colors.card,
        circleStrokeWidth: 2,
        circleOpacity: opacity,
        circleStrokeOpacity: opacity
      },
      end: {
        circleRadius: 5,
        circleColor: colors.card,
        circleStrokeColor: ["get", "color"] as any,
        circleStrokeWidth: 3,
        circleOpacity: opacity,
        circleStrokeOpacity: opacity
      }
    }
  }, [hasFocus, colors.card])

  const highlightGeoJSON = useMemo(() => {
    const selected = selectedIndex >= 0 ? locations[selectedIndex] : null
    const coord = selected ? [selected.longitude, selected.latitude] : null
    const color = selectedIndex >= 0 ? locationColors[selectedIndex] : trackColor
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
  }, [selectedIndex, locations, locationColors, trackColor])

  const highlightStyle = useMemo(
    () => ({
      circleRadius: 8,
      circleColor: ["get", "color"] as any,
      circleOpacity: ["get", "visible"] as any,
      circleStrokeColor: colors.card,
      circleStrokeWidth: ["*", 2.5, ["get", "visible"]] as any
    }),
    [colors.card]
  )

  const lastFeaturePressRef = useRef(0)
  const lastPointPressRef = useRef(0)
  const linePressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => clearTimeout(linePressTimer.current ?? undefined), [])

  const handlePointPress = useCallback(
    (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
      const hits = event.nativeEvent.features
      // Where two trips share a road, the point of the trip drawn on top is the one the finger meant.
      const focusedColor = focusedTripIndex != null ? getTripColor(focusedTripIndex) : null
      const hit = (focusedColor && hits.find((f) => f.properties?.color === focusedColor)) || hits[0]
      const id = hit?.properties?.id
      if (typeof id !== "number" || id < 0) return
      lastFeaturePressRef.current = Date.now()
      lastPointPressRef.current = Date.now()
      if (linePressTimer.current) {
        clearTimeout(linePressTimer.current)
        linePressTimer.current = null
      }
      onSelectPoint(id)
    },
    [onSelectPoint, focusedTripIndex]
  )

  const handleLinePress = useCallback(
    (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
      const tripIndex = event.nativeEvent.features[0]?.properties?.tripIndex
      if (typeof tripIndex !== "number" || tripIndex < 0) return
      lastFeaturePressRef.current = Date.now()
      if (Date.now() - lastPointPressRef.current < FEATURE_PRESS_WINDOW_MS) return
      if (linePressTimer.current) clearTimeout(linePressTimer.current)
      linePressTimer.current = setTimeout(() => {
        linePressTimer.current = null
        if (Date.now() - lastPointPressRef.current >= FEATURE_PRESS_WINDOW_MS) onFocusTrip(tripIndex)
      }, LINE_PRESS_DEFER_MS)
    },
    [onFocusTrip]
  )

  const handleMapPress = useCallback(() => {
    if (Date.now() - lastFeaturePressRef.current < FEATURE_PRESS_WINDOW_MS) return
    onFocusTrip(null)
    onSelectPoint(null)
  }, [onFocusTrip, onSelectPoint])

  const initialCenter = useMemo(
    () => [locations[0]?.longitude ?? 0, locations[0]?.latitude ?? 0] as [number, number],
    [locations]
  )

  const hasPoints = locations.length > 0

  return (
    <View style={StyleSheet.absoluteFill}>
      <ColotaMapView
        ref={mapRef}
        initialCenter={initialCenter}
        initialZoom={WORLD_MAP_ZOOM}
        cameraPadding={cameraPadding}
        controlsBottom={controlsBottom}
        controlsEnd={controlsEnd}
        onPress={handleMapPress}
        onRegionDidChange={handleRegionChange}
        onMapReady={handleMapReady}
      >
        <GeoJSONSource id="track-segments" data={segmentsGeoJSON} onPress={handleLinePress}>
          <Layer id="track-casing" type="line" style={lineStyles.casing} />
          <Layer id="track-line" type="line" style={lineStyles.line} />
          {hasFocus && (
            <>
              <Layer id="track-casing-focused" type="line" filter={FOCUSED_FILTER} style={lineStyles.casingFocused} />
              <Layer id="track-line-focused" type="line" filter={FOCUSED_FILTER} style={lineStyles.lineFocused} />
            </>
          )}
        </GeoJSONSource>
        <GeoJSONSource id="track-points" data={pointsGeoJSON} onPress={handlePointPress} hitbox={POINT_HITBOX}>
          <Layer id="track-point-circles" type="circle" style={trackPointStyle} />
        </GeoJSONSource>
        <GeoJSONSource id="trip-terminals" data={terminalsGeoJSON}>
          <Layer id="trip-start" type="circle" filter={START_FILTER} style={terminalStyles.start} />
          <Layer id="trip-end" type="circle" filter={END_FILTER} style={terminalStyles.end} />
        </GeoJSONSource>
        <GeoJSONSource id="highlight-point" data={highlightGeoJSON}>
          <Layer id="highlight-circle" type="circle" style={highlightStyle} />
        </GeoJSONSource>
      </ColotaMapView>

      {hasPoints && !isCentered && (
        <MapActionButton
          onPress={handleFitDay}
          anchored={false}
          style={[styles.fitDay, { bottom: controlsBottom + size.iconColumn + space.lg, right: controlsEnd }]}
          accessibilityRole="button"
          accessibilityLabel="Fit the day"
        >
          <LocateFixed size={size.icon.md} color={colors.textLight} />
        </MapActionButton>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  fitDay: { position: "absolute" }
})
