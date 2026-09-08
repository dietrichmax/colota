/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useRef, useEffect, useMemo, useCallback, useState } from "react"
import { View, StyleSheet, DeviceEventEmitter } from "react-native"
import type { ViewPadding } from "@maplibre/maplibre-react-native"
import { Geofence, LocationCoords } from "../../../types/global"
import { useTheme } from "../../../hooks/useTheme"
import { useCoords } from "../../../contexts/TrackingProvider"
import NativeLocationService from "../../../services/NativeLocationService"
import {
  DEFAULT_MAP_ZOOM,
  GEOFENCE_ZOOM_PADDING,
  MAP_ANIMATION_DURATION_MS,
  WORLD_MAP_ZOOM,
  size,
  space
} from "../../../constants"
import { MapCenterButton } from "../map/MapCenterButton"
import { ColotaMapView, ColotaMapRef } from "../map/ColotaMapView"
import { buildGeofencesGeoJSON, geofenceBounds } from "../map/mapUtils"
import { GeofenceLayers } from "../map/GeofenceLayers"
import { CurrentTrackLayers } from "../map/CurrentTrackLayers"
import { UserLocationOverlay } from "../map/UserLocationOverlay"
import { useTodayTrack } from "../../../hooks/useTodayTrack"
import { logger } from "../../../utils/logger"

const isValidCoords = (c: LocationCoords | null): c is LocationCoords => {
  return c !== null && c.latitude !== 0 && c.longitude !== 0
}

export type LastKnownLocation = {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
}

type Props = {
  tracking: boolean
  activeZoneName: string | null
  /** `undefined` until the screen has read the database, `null` when it holds no fix. */
  lastKnown: LastKnownLocation | null | undefined
  cameraPadding: ViewPadding
  controlsBottom: number
  controlsEnd: number
  showTrack: boolean
  onHasTrackChange: (hasTrack: boolean) => void
  /** Bumped by the screen on Start, so the map reacts to the tap and not to the first fix. */
  recentreSignal: number
}

const WORLD_CENTER: [number, number] = [0, 20]
export function DashboardMap({
  tracking,
  activeZoneName,
  lastKnown,
  cameraPadding,
  controlsBottom,
  controlsEnd,
  showTrack,
  onHasTrackChange,
  recentreSignal
}: Props) {
  const coords = useCoords()
  const mapRef = useRef<ColotaMapRef>(null)
  const { colors } = useTheme()
  const [geofences, setGeofences] = useState<Geofence[] | null>(null)
  const [isCentered, setIsCentered] = useState(true)
  const isCenteredRef = useRef(true)
  const placedRef = useRef(false)
  const recentredRef = useRef(0)
  const flyUntilRef = useRef(0)
  const firstLoadRef = useRef(true)
  const initialRef = useRef<LastKnownLocation | LocationCoords | null | undefined>(undefined)
  const [mapLoads, setMapLoads] = useState(0)
  const { locations: trackLocations, version: trackVersion } = useTodayTrack(tracking, coords)

  useEffect(() => {
    onHasTrackChange(trackLocations.length > 0)
  }, [trackLocations, trackVersion, onHasTrackChange])

  const loadGeofences = useCallback(async () => {
    try {
      const data = await NativeLocationService.getGeofences()
      setGeofences(data)
    } catch (err) {
      logger.error("[DashboardMap] Failed to load geofences:", err)
      setGeofences([])
    }
  }, [])

  useEffect(() => {
    loadGeofences()
  }, [loadGeofences])

  useEffect(() => {
    const listener = DeviceEventEmitter.addListener("geofenceUpdated", loadGeofences)
    return () => listener.remove()
  }, [loadGeofences])

  const liveFix = tracking && isValidCoords(coords) ? coords : null
  const position = liveFix ?? lastKnown ?? null

  // A stop sent before the style loads can be reset to its default, so placement runs again on the first map load.
  useEffect(() => {
    if (!position) placedRef.current = false
    if (placedRef.current || !mapRef.current?.camera) return
    if (position) {
      placedRef.current = true
      mapRef.current.camera.setStop({
        center: [position.longitude, position.latitude],
        zoom: DEFAULT_MAP_ZOOM,
        padding: cameraPadding,
        duration: 0
      })
      return
    }
    if (lastKnown === null && geofences && geofences.length > 0) {
      placedRef.current = true
      const [top, right, bottom, left] = GEOFENCE_ZOOM_PADDING
      mapRef.current.camera.fitBounds(geofenceBounds(geofences), {
        padding: {
          top: top + (cameraPadding.top ?? 0),
          right: right + (cameraPadding.right ?? 0),
          bottom: bottom + (cameraPadding.bottom ?? 0),
          left: left + (cameraPadding.left ?? 0)
        },
        duration: 0
      })
    }
  }, [mapLoads, position, lastKnown, geofences, cameraPadding])

  // The event fires again on every style load (a theme flip, the saved style URL resolving), which must not snap the viewport.
  const handleMapReady = useCallback(() => {
    if (!firstLoadRef.current) return
    firstLoadRef.current = false
    placedRef.current = false
    setMapLoads((n) => n + 1)
  }, [])

  // An ease issued mid-flight cancels the fly at whatever zoom it has reached, and it lands on the same point anyway.
  useEffect(() => {
    if (!liveFix || !isCenteredRef.current || !mapRef.current?.camera) return
    if (Date.now() < flyUntilRef.current) return
    mapRef.current.camera.easeTo({
      center: [liveFix.longitude, liveFix.latitude],
      padding: cameraPadding,
      duration: MAP_ANIMATION_DURATION_MS
    })
  }, [liveFix, cameraPadding])

  useEffect(() => {
    if (recentreSignal === recentredRef.current) return
    recentredRef.current = recentreSignal
    if (!position || !mapRef.current?.camera) return
    placedRef.current = true
    flyUntilRef.current = Date.now() + MAP_ANIMATION_DURATION_MS
    mapRef.current.camera.flyTo({
      center: [position.longitude, position.latitude],
      zoom: DEFAULT_MAP_ZOOM,
      padding: cameraPadding,
      duration: MAP_ANIMATION_DURATION_MS
    })
    isCenteredRef.current = true
    setIsCentered(true)
  }, [recentreSignal, position, cameraPadding])

  const handleCenterMe = useCallback(() => {
    if (position && mapRef.current?.camera) {
      flyUntilRef.current = Date.now() + MAP_ANIMATION_DURATION_MS
      mapRef.current.camera.flyTo({
        center: [position.longitude, position.latitude],
        zoom: DEFAULT_MAP_ZOOM,
        padding: cameraPadding,
        duration: MAP_ANIMATION_DURATION_MS
      })
      isCenteredRef.current = true
      setIsCentered(true)
    }
  }, [position, cameraPadding])

  const handleRegionChange = useCallback((payload: { isUserInteraction: boolean }) => {
    if (payload.isUserInteraction) {
      isCenteredRef.current = false
      setIsCentered(false)
    }
  }, [])

  const geofenceData = useMemo(() => buildGeofencesGeoJSON(geofences ?? [], colors), [geofences, colors])

  // The tiles wait for the database, so the map never opens on the world view and jumps to the fix a frame later.
  const settled = liveFix != null || lastKnown !== undefined
  if (settled && initialRef.current === undefined) initialRef.current = liveFix ?? lastKnown ?? null
  const initial = initialRef.current
  const staleCoords = useMemo<LocationCoords | null>(
    () => (lastKnown ? { latitude: lastKnown.latitude, longitude: lastKnown.longitude, accuracy: 0 } : null),
    [lastKnown]
  )

  if (!settled) return <View style={StyleSheet.absoluteFill} testID="dashboard-map-pending" />

  return (
    <View style={StyleSheet.absoluteFill}>
      <ColotaMapView
        ref={mapRef}
        initialCenter={initial ? [initial.longitude, initial.latitude] : WORLD_CENTER}
        initialZoom={initial ? DEFAULT_MAP_ZOOM : WORLD_MAP_ZOOM}
        cameraPadding={cameraPadding}
        controlsBottom={controlsBottom}
        controlsEnd={controlsEnd}
        onRegionDidChange={handleRegionChange}
        onMapReady={handleMapReady}
      >
        <CurrentTrackLayers locations={trackLocations} version={trackVersion} visible={showTrack} colors={colors} />

        <GeofenceLayers fills={geofenceData.fills} labels={geofenceData.labels} haloColor={colors.card} />

        {liveFix ? (
          <UserLocationOverlay coords={liveFix} isPaused={!!activeZoneName} colors={colors} />
        ) : (
          staleCoords && <UserLocationOverlay coords={staleCoords} isPaused colors={colors} />
        )}
      </ColotaMapView>

      <MapCenterButton
        visible={!isCentered && position !== null}
        onPress={handleCenterMe}
        style={{ bottom: controlsBottom + size.iconColumn + space.lg, right: controlsEnd }}
      />
    </View>
  )
}
