/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useRef, useEffect, useMemo, useCallback, useState } from "react"
import { View, StyleSheet, Text, DeviceEventEmitter, Pressable } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { LocationCoords } from "../../../types/global"
import { useTheme } from "../../../hooks/useTheme"
import { useCoords } from "../../../contexts/TrackingProvider"
import { useTranslation } from "../../../i18n/useTranslation"
import { text } from "../../../styles/typography"
import NativeLocationService from "../../../services/NativeLocationService"
import { size, space, MAP_ANIMATION_DURATION_MS, MAX_MAP_ZOOM, MAP_OVERLAY_GUTTER } from "../../../constants"
import { Expand, Shrink } from "lucide-react-native"
import { MapOverlay } from "../../ui/MapOverlay"
import { EmptyState } from "../../ui/EmptyState"
import { MapCenterButton } from "../map/MapCenterButton"
import { TrackToggleButton } from "../map/TrackToggleButton"
import { ColotaMapView, ColotaMapRef } from "../map/ColotaMapView"
import { buildGeofencesGeoJSON } from "../map/mapUtils"
import { GeofenceLayers } from "../map/GeofenceLayers"
import { CurrentTrackLayers } from "../map/CurrentTrackLayers"
import { UserLocationOverlay } from "../map/UserLocationOverlay"
import { useTodayTrack } from "../../../hooks/useTodayTrack"
import { logger } from "../../../utils/logger"

const DOT_SIZE = 8

type Props = {
  tracking: boolean
  activeZoneName: string | null
  pauseReason: string | null
  activeProfileName: string | null
  isBatteryCritical: boolean
  locationEnabled: boolean
  interval: number
  /** Expand control: rendered only when a caller owns the seam and can animate it. */
  expanded?: boolean
  onToggleExpand?: () => void
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
  locationEnabled,
  interval,
  expanded = false,
  onToggleExpand
}: Props) {
  const coords = useCoords()
  const mapRef = useRef<ColotaMapRef>(null)
  const { colors } = useTheme()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
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

  const handleTrackToggle = useCallback(() => {
    const next = !showTrack
    setShowTrack(next)
    NativeLocationService.saveSetting("showTrack", String(next)).catch((err) =>
      logger.error("[DashboardMap] Failed to save showTrack setting:", err)
    )
  }, [showTrack])

  // Geofence GeoJSON
  const geofenceData = useMemo(() => buildGeofencesGeoJSON(geofences, colors), [geofences, colors])

  const showMap = isValidCoords(coords)
  const locationOff = tracking && !locationEnabled

  // Only the dot carries the state hue; the words stay ink so they read over any tile.
  const chip = ((): { label: string; dot: string; onPress?: () => void } | null => {
    if (!tracking) return null
    if (locationOff) {
      return {
        label: t("dashboard.chip.locationOff"),
        dot: colors.error,
        onPress: () => NativeLocationService.openLocationSettings()
      }
    }
    if (activeZoneName) {
      const key =
        pauseReason === "wifi"
          ? "dashboard.chip.pausedWifi"
          : pauseReason === "motionless"
            ? "dashboard.chip.pausedMotionless"
            : "dashboard.chip.paused"
      return { label: t(key, { zone: activeZoneName }), dot: colors.warning }
    }
    if (!showMap) return { label: t("dashboard.chip.waiting"), dot: colors.textLight }
    if (activeProfileName) {
      return {
        label: t("dashboard.chip.trackingProfile", { profile: activeProfileName, interval }),
        dot: colors.primary
      }
    }
    return { label: t("dashboard.chip.tracking", { interval }), dot: colors.primary }
  })()

  const chipNode = chip ? (
    <MapOverlay testID="map-state-chip" shape="pill" style={styles.chipSurface}>
      <View style={styles.chipRow}>
        <View style={[styles.chipDot, { backgroundColor: chip.dot }]} importantForAccessibility="no" />
        <Text style={[styles.chipLabel, { color: colors.text }]} numberOfLines={1}>
          {chip.label}
        </Text>
      </View>
    </MapOverlay>
  ) : null

  return (
    <View style={styles.container}>
      {/* Keep map mounted to avoid MapLibre/Fabric unmount race condition.
          Hide it while there is no fix to draw. */}
      {hasInitialCoords && initialCoords.current ? (
        <View style={showMap ? styles.mapVisible : styles.mapHidden} pointerEvents={showMap ? "auto" : "none"}>
          <ColotaMapView
            ref={mapRef}
            controlsPlacement="start"
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

      {!showMap && !tracking && (
        <View style={[styles.empty, { paddingTop: insets.top + MAP_OVERLAY_GUTTER }]}>
          <EmptyState
            testID="map-empty"
            title={isBatteryCritical ? t("dashboard.map.emptyBattery") : t("dashboard.map.empty")}
            message={isBatteryCritical ? t("dashboard.map.emptyBattery.message") : t("dashboard.map.empty.message")}
          />
        </View>
      )}

      {chipNode && (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.chip, { top: insets.top + MAP_OVERLAY_GUTTER, start: insets.left + MAP_OVERLAY_GUTTER }]}
        >
          {chip?.onPress ? (
            <Pressable
              onPress={chip.onPress}
              accessibilityRole="button"
              accessibilityLabel={chip.label}
              accessibilityHint={t("dashboard.chip.locationOff.hint")}
              style={({ pressed }) => pressed && { opacity: colors.pressedOpacity }}
            >
              {chipNode}
            </Pressable>
          ) : (
            chipNode
          )}
        </View>
      )}

      <View
        testID="map-controls"
        pointerEvents="box-none"
        style={[styles.controls, { bottom: MAP_OVERLAY_GUTTER, end: insets.right + MAP_OVERLAY_GUTTER }]}
      >
        {showMap && <MapCenterButton floating={false} visible={!isCentered} onPress={handleCenterMe} />}
        {showMap && showTrack !== null && <TrackToggleButton active={!!showTrack} onPress={handleTrackToggle} />}
        {showMap && onToggleExpand && (
          <MapOverlay
            testID="map-expand-btn"
            variant="control"
            onPress={onToggleExpand}
            accessibilityLabel={expanded ? t("map.collapse") : t("map.expand")}
          >
            {expanded ? (
              <Shrink size={size.icon.md} color={colors.text} />
            ) : (
              <Expand size={size.icon.md} color={colors.text} />
            )}
          </MapOverlay>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%" },
  mapVisible: { flex: 1 },
  mapHidden: { flex: 1, opacity: 0 },
  empty: {
    position: "absolute",
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    paddingHorizontal: space.lg
  },
  chip: { position: "absolute" },
  chipSurface: { paddingVertical: space.xs },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm
  },
  chipDot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2
  },
  chipLabel: {
    ...text.bodyStrong,
    flexShrink: 1
  },
  controls: {
    position: "absolute",
    alignItems: "center",
    gap: space.md
  }
})
