/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useRef, useEffect, useMemo, useState, useCallback } from "react"
import { View, StyleSheet, Text, ActivityIndicator, DeviceEventEmitter, Image } from "react-native"
import { LocationCoords } from "../../../types/global"
import { useTheme } from "../../../hooks/useTheme"
import { fonts } from "../../../styles/typography"
import { WifiOff } from "lucide-react-native"
import NativeLocationService from "../../../services/NativeLocationService"
import { useFocusEffect } from "@react-navigation/native"
import { STATS_REFRESH_IDLE, MAP_ANIMATION_DURATION_MS, MAX_MAP_ZOOM } from "../../../constants"
import { MapCenterButton } from "../map/MapCenterButton"
import { ColotaMapView, ColotaMapRef } from "../map/ColotaMapView"
import { buildGeofencesGeoJSON } from "../map/mapUtils"
import { GeofenceLayers } from "../map/GeofenceLayers"
import { UserLocationOverlay } from "../map/UserLocationOverlay"
import icon from "../../../assets/icons/icon.png"
import { logger } from "../../../utils/logger"

type Props = {
  coords: LocationCoords | null
  tracking: boolean
  activeZoneName: string | null
  activeProfileName: string | null
}

const isValidCoords = (c: LocationCoords | null): c is LocationCoords => {
  return c !== null && c.latitude !== 0 && c.longitude !== 0
}

export function DashboardMap({ coords, tracking, activeZoneName, activeProfileName }: Props) {
  const mapRef = useRef<ColotaMapRef>(null)
  const { colors } = useTheme()
  const [geofences, setGeofences] = useState<any[]>([])
  const [isCentered, setIsCentered] = useState(true)
  const isCenteredRef = useRef(true)
  const initialCoords = useRef<LocationCoords | null>(null)
  const [hasInitialCoords, setHasInitialCoords] = useState(false)
  const [currentPauseZone, setCurrentPauseZone] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)

  useFocusEffect(
    useCallback(() => {
      const check = () => {
        NativeLocationService.isNetworkAvailable().then((available) => setIsOffline(!available))
      }
      check()
      const interval = setInterval(check, STATS_REFRESH_IDLE)
      return () => clearInterval(interval)
    }, [])
  )

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
    const checkPauseZone = async () => {
      try {
        const zoneName = await NativeLocationService.checkCurrentPauseZone()
        setCurrentPauseZone(zoneName)
      } catch (err) {
        logger.error("[DashboardMap] Failed to check pause zone:", err)
      }
    }

    checkPauseZone()
    const listener = DeviceEventEmitter.addListener("geofenceUpdated", () => {
      checkPauseZone()
      loadGeofences()
    })
    return () => listener.remove()
  }, [loadGeofences])

  // Auto-center camera when position changes (only if currently centered).
  // Uses ref to avoid re-triggering when isCentered flips (which would
  // override the setCamera zoom from handleCenterMe with a pan-only moveTo).
  useEffect(() => {
    if (coords && isCenteredRef.current && mapRef.current?.camera) {
      mapRef.current.camera.moveTo([coords.longitude, coords.latitude], MAP_ANIMATION_DURATION_MS)
    }
  }, [coords])

  const handleCenterMe = useCallback(() => {
    if (coords && mapRef.current?.camera) {
      mapRef.current.camera.setCamera({
        centerCoordinate: [coords.longitude, coords.latitude],
        zoomLevel: MAX_MAP_ZOOM,
        animationDuration: MAP_ANIMATION_DURATION_MS,
        animationMode: "flyTo"
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

  if (!tracking) {
    return (
      <View style={[styles.stateContainer, { backgroundColor: colors.card, borderRadius: colors.borderRadius }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.border }]}>
          <Image source={icon} style={styles.icon} />
        </View>
        <Text style={[styles.stateTitle, { color: colors.text }]}>Tracking Disabled</Text>
        <Text style={[styles.stateSubtext, { color: colors.textSecondary }]}>Start tracking to see the map.</Text>
      </View>
    )
  }

  if (!isValidCoords(coords)) {
    return (
      <View style={[styles.stateContainer, { backgroundColor: colors.card, borderRadius: colors.borderRadius }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.stateTitle, styles.stateTitleSpaced, { color: colors.text }]}>Searching GPS...</Text>
        <Text style={[styles.stateSubtext, { color: colors.textSecondary }]}>Waiting for GPS signal.</Text>
      </View>
    )
  }

  return (
    <View style={[styles.container, { borderRadius: colors.borderRadius }]}>
      {hasInitialCoords && initialCoords.current ? (
        <ColotaMapView
          ref={mapRef}
          initialCenter={[initialCoords.current.longitude, initialCoords.current.latitude]}
          onRegionDidChange={handleRegionChange}
        >
          <GeofenceLayers fills={geofenceData.fills} labels={geofenceData.labels} haloColor={colors.card} />

          {/* Accuracy circle + user marker */}
          <UserLocationOverlay coords={coords} isPaused={!!currentPauseZone} colors={colors} />
        </ColotaMapView>
      ) : (
        <View style={[styles.stateContainer, { backgroundColor: colors.card }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.stateTitle, styles.stateTitleSpaced, { color: colors.text }]}>Loading Map...</Text>
        </View>
      )}

      <MapCenterButton visible={!isCentered} onPress={handleCenterMe} />

      {isOffline && (
        <View style={[styles.offlineBanner, { backgroundColor: colors.card }]}>
          <WifiOff size={14} color={colors.textSecondary} />
          <Text style={[styles.offlineText, { color: colors.textSecondary }]}>Map tiles unavailable — no internet</Text>
        </View>
      )}

      {activeZoneName && (
        <View
          style={[
            styles.topInfoCard,
            {
              backgroundColor: colors.card,
              borderLeftColor: colors.warning
            }
          ]}
        >
          <Text style={[styles.infoTitle, { color: colors.text }]}>Paused in {activeZoneName}</Text>
          <Text style={[styles.infoSub, { color: colors.textSecondary }]}>
            {activeProfileName ? `Profile "${activeProfileName}" resumes on exit` : "Location not being recorded"}
          </Text>
        </View>
      )}

      {!activeZoneName && activeProfileName && (
        <View
          style={[
            styles.topInfoCard,
            {
              backgroundColor: colors.card,
              borderLeftColor: colors.primary
            }
          ]}
        >
          <Text style={[styles.infoTitle, { color: colors.text }]}>Profile: {activeProfileName}</Text>
          <Text style={[styles.infoSub, { color: colors.textSecondary }]}>Tracking settings adjusted</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%", overflow: "hidden" },
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
  topInfoCard: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    padding: 16,
    borderRadius: 16,
    elevation: 8,
    shadowOpacity: 0.2,
    borderLeftWidth: 5,
    zIndex: 5
  },
  infoTitle: { fontSize: 16, ...fonts.bold, marginBottom: 2 },
  infoSub: { fontSize: 13 },
  offlineBanner: {
    position: "absolute",
    bottom: 90,
    left: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    elevation: 8,
    shadowOpacity: 0.2,
    zIndex: 5
  },
  offlineText: {
    fontSize: 13,
    ...fonts.medium
  }
})
