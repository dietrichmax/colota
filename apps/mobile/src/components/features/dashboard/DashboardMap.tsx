/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useRef, useEffect, useMemo, useCallback, useState } from "react"
import { View, StyleSheet, Text, ActivityIndicator, DeviceEventEmitter, Image, Pressable } from "react-native"
import { AlertTriangle } from "lucide-react-native"
import { LocationCoords } from "../../../types/global"
import { useTheme } from "../../../hooks/useTheme"
import { useCoords } from "../../../contexts/TrackingProvider"
import { fonts } from "../../../styles/typography"
import NativeLocationService from "../../../services/NativeLocationService"
import { MAP_ANIMATION_DURATION_MS, MAX_MAP_ZOOM } from "../../../constants"
import { MapCenterButton } from "../map/MapCenterButton"
import { TrackToggleButton } from "../map/TrackToggleButton"
import { ColotaMapView, ColotaMapRef } from "../map/ColotaMapView"
import { buildGeofencesGeoJSON } from "../map/mapUtils"
import { GeofenceLayers } from "../map/GeofenceLayers"
import { CurrentTrackLayers } from "../map/CurrentTrackLayers"
import { UserLocationOverlay } from "../map/UserLocationOverlay"
import { useTodayTrack } from "../../../hooks/useTodayTrack"
import icon from "../../../assets/icons/icon.png"
import { logger } from "../../../utils/logger"

type Props = {
  tracking: boolean
  activeZoneName: string | null
  pauseReason: string | null
  activeProfileName: string | null
  isBatteryCritical: boolean
  locationEnabled: boolean
}

const isValidCoords = (c: LocationCoords | null): c is LocationCoords => {
  return c !== null && c.latitude !== 0 && c.longitude !== 0
}

export function DashboardMap({
  tracking,
  activeZoneName,
  pauseReason,
  activeProfileName,
  isBatteryCritical,
  locationEnabled
}: Props) {
  const coords = useCoords()
  const mapRef = useRef<ColotaMapRef>(null)
  const { colors } = useTheme()
  const [geofences, setGeofences] = useState<any[]>([])
  const [isCentered, setIsCentered] = useState(true)
  const [showTrack, setShowTrack] = useState<boolean | null>(null)
  const { locations: trackLocations, version: trackVersion } = useTodayTrack(tracking, coords)

  // Restore persisted track toggle
  useEffect(() => {
    NativeLocationService.getSetting("showTrack")
      .then((val) => setShowTrack(val === "true"))
      .catch((err) => {
        logger.error("[DashboardMap] Failed to load showTrack setting:", err)
        setShowTrack(false)
      })
  }, [])
  const isCenteredRef = useRef(true)
  const initialCoords = useRef<LocationCoords | null>(null)
  const [hasInitialCoords, setHasInitialCoords] = useState(false)
  useEffect(() => {
    if (!initialCoords.current && coords) {
      initialCoords.current = coords
      setHasInitialCoords(true)
    }
  }, [coords])

  const loadGeofences = useCallback(async () => {
    try {
      const data = await NativeLocationService.getGeofences()
      setGeofences(data)
    } catch (err) {
      logger.error("[DashboardMap] Failed to load geofences:", err)
    }
  }, [])

  useEffect(() => {
    loadGeofences()
  }, [loadGeofences])

  useEffect(() => {
    const listener = DeviceEventEmitter.addListener("geofenceUpdated", loadGeofences)
    return () => listener.remove()
  }, [loadGeofences])

  // Auto-center camera when position changes (only if currently centered).
  // Uses ref to avoid re-triggering when isCentered flips (which would
  // override the setCamera zoom from handleCenterMe with a pan-only moveTo).
  useEffect(() => {
    if (!coords || !isCenteredRef.current || !mapRef.current?.camera) return
    mapRef.current.camera.easeTo({
      center: [coords.longitude, coords.latitude],
      duration: MAP_ANIMATION_DURATION_MS
    })
  }, [coords])

  const handleCenterMe = useCallback(() => {
    if (coords && mapRef.current?.camera) {
      mapRef.current.camera.flyTo({
        center: [coords.longitude, coords.latitude],
        zoom: MAX_MAP_ZOOM,
        duration: MAP_ANIMATION_DURATION_MS
      })
      isCenteredRef.current = true
      setIsCentered(true)
    }
  }, [coords])

  const handleRegionChange = useCallback((payload: { isUserInteraction: boolean }) => {
    if (payload.isUserInteraction) {
      isCenteredRef.current = false
      setIsCentered(false)
    }
  }, [])

  // Geofence GeoJSON
  const geofenceData = useMemo(() => buildGeofencesGeoJSON(geofences, colors), [geofences, colors])

  const showMap = tracking && isValidCoords(coords)
  const waitingForFix = tracking && !isValidCoords(coords)
  const locationOff = tracking && !locationEnabled

  return (
    <View style={[styles.container, { borderRadius: colors.borderRadius }]}>
      {/* Keep map mounted to avoid MapLibre/Fabric unmount race condition.
          Hide it behind the placeholder when not tracking. */}
      {hasInitialCoords && initialCoords.current ? (
        <View style={showMap ? styles.mapVisible : styles.mapHidden} pointerEvents={showMap ? "auto" : "none"}>
          <ColotaMapView
            ref={mapRef}
            initialCenter={[initialCoords.current.longitude, initialCoords.current.latitude]}
            onRegionDidChange={handleRegionChange}
          >
            <CurrentTrackLayers
              locations={trackLocations}
              version={trackVersion}
              visible={!!showTrack}
              colors={colors}
            />

            <GeofenceLayers fills={geofenceData.fills} labels={geofenceData.labels} haloColor={colors.card} />

            {/* Always keep overlay mounted to avoid MapLibre/Fabric unmount race condition */}
            {coords && <UserLocationOverlay coords={coords} isPaused={!!activeZoneName} colors={colors} />}
          </ColotaMapView>
        </View>
      ) : null}

      {!tracking && (
        <View
          style={[
            styles.stateContainer,
            styles.overlay,
            { backgroundColor: colors.card, borderRadius: colors.borderRadius }
          ]}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.border }]}>
            <Image source={icon} style={styles.icon} />
          </View>
          <Text style={[styles.stateTitle, { color: isBatteryCritical ? colors.error : colors.text }]}>
            {isBatteryCritical ? "Tracking Stopped" : "Tracking Disabled"}
          </Text>
          <Text style={[styles.stateSubtext, { color: colors.textSecondary }]}>
            {isBatteryCritical
              ? "Battery critically low. Charge your device to resume."
              : "Start tracking to see the map."}
          </Text>
        </View>
      )}

      {waitingForFix && locationOff && (
        <Pressable
          onPress={() => NativeLocationService.openLocationSettings()}
          style={[
            styles.stateContainer,
            styles.overlay,
            { backgroundColor: colors.card, borderRadius: colors.borderRadius }
          ]}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.warning + "20" }]}>
            <AlertTriangle size={32} color={colors.warning} />
          </View>
          <Text style={[styles.stateTitle, { color: colors.warning }]}>Location Services Off</Text>
          <Text style={[styles.stateSubtext, { color: colors.textSecondary }]}>
            Tracking can&apos;t get GPS fixes. Tap to open Settings.
          </Text>
        </Pressable>
      )}

      {waitingForFix && !locationOff && (
        <View
          style={[
            styles.stateContainer,
            styles.overlay,
            { backgroundColor: colors.card, borderRadius: colors.borderRadius }
          ]}
        >
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.stateTitle, styles.stateTitleSpaced, { color: colors.text }]}>Searching GPS...</Text>
          <Text style={[styles.stateSubtext, { color: colors.textSecondary }]}>Waiting for GPS signal.</Text>
        </View>
      )}

      {showMap && <MapCenterButton visible={!isCentered} onPress={handleCenterMe} />}
      {showMap && showTrack !== null && (
        <TrackToggleButton
          active={!!showTrack}
          onPress={() => {
            const next = !showTrack
            setShowTrack(next)
            NativeLocationService.saveSetting("showTrack", String(next)).catch((err) =>
              logger.error("[DashboardMap] Failed to save showTrack setting:", err)
            )
          }}
        />
      )}

      {showMap && locationOff && (
        <Pressable
          onPress={() => NativeLocationService.openLocationSettings()}
          style={[styles.statusBar, { backgroundColor: colors.error + "DD" }]}
        >
          <Text style={styles.barText}>Location off - tap to enable</Text>
        </Pressable>
      )}

      {showMap && !locationOff && activeZoneName && (
        <View style={[styles.statusBar, { backgroundColor: colors.warning + "DD" }]}>
          <Text style={styles.barText}>
            Paused in {activeZoneName}
            {pauseReason === "wifi" ? " - WiFi" : pauseReason === "motionless" ? " - Motionless" : ""}
          </Text>
        </View>
      )}

      {showMap && !locationOff && !activeZoneName && activeProfileName && (
        <View style={[styles.statusBar, { backgroundColor: colors.primary + "DD" }]}>
          <Text style={styles.barText}>{activeProfileName}</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%", overflow: "hidden" },
  mapVisible: { flex: 1 },
  mapHidden: { flex: 1, opacity: 0 },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 },
  stateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24
  },
  icon: { width: 64, height: 64 },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16
  },
  stateTitle: { fontSize: 18, ...fonts.bold, textAlign: "center" },
  stateTitleSpaced: { marginTop: 20 },
  stateSubtext: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20
  },
  statusBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 6,
    alignItems: "center",
    zIndex: 5
  },
  barText: { fontSize: 13, ...fonts.semiBold, color: "#fff" }
})
