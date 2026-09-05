/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from "react"
import { View, StyleSheet, Pressable, ScrollView, DeviceEventEmitter, Share } from "react-native"
import { useTheme } from "../hooks/useTheme"
import { useTranslation } from "../i18n/useTranslation"
import NativeLocationService from "../services/NativeLocationService"
import { showAlert } from "../services/modalService"
import { Geofence, ScreenProps } from "../types/global"
import { useTracking, useCoords } from "../contexts/TrackingProvider"
import { MapPinHouse, Plus, Share2 } from "lucide-react-native"
import { Card, Container, Divider, EmptyState, ListItem, SectionTitle } from "../components"
import {
  size,
  space,
  DEFAULT_MAP_ZOOM,
  WORLD_MAP_ZOOM,
  GEOFENCE_FOCUS_DURATION_MS,
  GEOFENCE_ZOOM_PADDING,
  MAP_ANIMATION_DURATION_MS,
  MAP_HERO_FRACTION,
  MAX_MAP_ZOOM,
  STATE_LAYER_ALPHA
} from "../constants"
import { MapCenterButton } from "../components/features/map/MapCenterButton"
import { ColotaMapView, ColotaMapRef } from "../components/features/map/ColotaMapView"
import { buildGeofencesGeoJSON } from "../components/features/map/mapUtils"
import { GeofenceLayers } from "../components/features/map/GeofenceLayers"
import { UserLocationOverlay } from "../components/features/map/UserLocationOverlay"
import { logger } from "../utils/logger"
import { formatShortDistance } from "../utils/geo"
import { buildGeofencesLink } from "../utils/setupLink"

const RIPPLE_RADIUS = 20

const GeofenceMap = React.memo(function GeofenceMap({
  tracking,
  geofenceData,
  currentPauseZone,
  focusRequest
}: {
  tracking: boolean
  geofenceData: ReturnType<typeof buildGeofencesGeoJSON>
  currentPauseZone: string | null
  focusRequest: { geofence: Geofence; key: number } | null
}) {
  const coords = useCoords()
  const { colors } = useTheme()

  const mapRef = useRef<ColotaMapRef>(null)
  const isCenteredRef = useRef(true)
  const [isCentered, setIsCentered] = useState(true)
  const [hasInitialCoords, setHasInitialCoords] = useState(false)
  const initialCenter = useRef<{ latitude: number; longitude: number; accuracy: number } | null>(null)

  useEffect(() => {
    if (hasInitialCoords) return
    if (coords) {
      initialCenter.current = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy ?? 0 }
      setHasInitialCoords(true)
      return
    }
    NativeLocationService.getMostRecentLocation().then((latest) => {
      if (initialCenter.current) return
      initialCenter.current = latest
        ? { latitude: latest.latitude, longitude: latest.longitude, accuracy: latest.accuracy ?? 0 }
        : { latitude: 0, longitude: 0, accuracy: 0 }
      setHasInitialCoords(true)
    })
  }, [coords, hasInitialCoords])

  useEffect(() => {
    if (!coords || !isCenteredRef.current || !tracking || !mapRef.current?.camera) return
    mapRef.current.camera.easeTo({
      center: [coords.longitude, coords.latitude],
      duration: MAP_ANIMATION_DURATION_MS
    })
  }, [coords, tracking])

  useEffect(() => {
    if (!focusRequest || !mapRef.current?.camera) return
    const { geofence } = focusRequest
    const latDelta = (geofence.radius / 111320) * 1.5
    const lonDelta = (geofence.radius / (111320 * Math.cos((geofence.lat * Math.PI) / 180))) * 1.5
    mapRef.current.camera.fitBounds(
      [geofence.lon - lonDelta, geofence.lat - latDelta, geofence.lon + lonDelta, geofence.lat + latDelta],
      {
        padding: {
          top: GEOFENCE_ZOOM_PADDING[0],
          right: GEOFENCE_ZOOM_PADDING[1],
          bottom: GEOFENCE_ZOOM_PADDING[2],
          left: GEOFENCE_ZOOM_PADDING[3]
        },
        duration: GEOFENCE_FOCUS_DURATION_MS
      }
    )
  }, [focusRequest])

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

  const hasRealCoords =
    initialCenter.current && (initialCenter.current.latitude !== 0 || initialCenter.current.longitude !== 0)
  const initialZoom = hasRealCoords ? DEFAULT_MAP_ZOOM : WORLD_MAP_ZOOM

  return (
    <View style={styles.mapBody}>
      {hasInitialCoords && initialCenter.current ? (
        <ColotaMapView
          ref={mapRef}
          initialCenter={[initialCenter.current.longitude, initialCenter.current.latitude]}
          initialZoom={initialZoom}
          onRegionDidChange={handleRegionChange}
        >
          <GeofenceLayers fills={geofenceData.fills} labels={geofenceData.labels} haloColor={colors.card} />
          {coords && tracking && <UserLocationOverlay coords={coords} isPaused={!!currentPauseZone} colors={colors} />}
        </ColotaMapView>
      ) : null}
      <MapCenterButton visible={!isCentered && tracking} onPress={handleCenterMe} />
    </View>
  )
})

/** What the zone does, as one whole phrase: the conditions gate each other, so they never assemble. */
function zoneBehaviourKey(zone: Geofence): string {
  if (!zone.pauseTracking) return "geofences.row.noPause"
  if (zone.pauseOnWifi && zone.pauseOnMotionless) return "geofences.row.pauseBoth"
  if (zone.pauseOnWifi) return "geofences.row.pauseWifi"
  if (zone.pauseOnMotionless) return "geofences.row.pauseMotionless"
  return "geofences.row.pause"
}

export function GeofenceScreen({ navigation }: ScreenProps) {
  const { tracking } = useTracking()
  const { colors } = useTheme()
  const { t } = useTranslation()

  const [geofences, setGeofences] = useState<Geofence[]>([])
  const [currentPauseZone, setCurrentPauseZone] = useState<string | null>(null)

  const [focusRequest, setFocusRequest] = useState<{ geofence: Geofence; key: number } | null>(null)

  const loadGeofences = useCallback(async () => {
    try {
      const data = await NativeLocationService.getGeofences()
      setGeofences(data)
    } catch (err) {
      logger.error("[GeofenceScreen] Failed to load geofences:", err)
    }
  }, [])

  useEffect(() => {
    loadGeofences()
  }, [loadGeofences])

  useEffect(() => {
    const checkPauseZone = async () => {
      try {
        const result = await NativeLocationService.checkCurrentPauseZone()
        setCurrentPauseZone(result?.zoneName ?? null)
      } catch (err) {
        logger.error("[GeofenceScreen] Failed to check pause zone:", err)
      }
    }

    checkPauseZone()
    const listener = DeviceEventEmitter.addListener("geofenceUpdated", () => {
      checkPauseZone()
      loadGeofences()
    })
    return () => listener.remove()
  }, [loadGeofences])

  const focusKeyRef = useRef(0)
  const handleZoomToGeofence = useCallback((item: Geofence) => {
    setFocusRequest({ geofence: item, key: ++focusKeyRef.current })
  }, [])

  const handleCreate = useCallback(() => {
    navigation.navigate("Geofence Editor")
  }, [navigation])

  const handleShareGeofences = useCallback(async () => {
    if (geofences.length === 0) return
    try {
      await Share.share({ message: buildGeofencesLink(geofences) })
    } catch (err) {
      logger.error("[GeofenceScreen] Failed to share geofences:", err)
      showAlert(t("geofences.share.failed"), t("geofences.share.failed.message"), "error")
    }
  }, [geofences, t])

  const hasGeofences = geofences.length > 0

  const headerRight = useCallback(
    () => (
      <View style={styles.headerActions}>
        {hasGeofences && (
          <Pressable
            testID="share-geofences-btn"
            onPress={handleShareGeofences}
            accessibilityRole="button"
            accessibilityLabel={t("geofences.share")}
            android_ripple={{ color: colors.text + STATE_LAYER_ALPHA, borderless: true, radius: RIPPLE_RADIUS }}
            style={styles.headerBtn}
          >
            <Share2 size={size.icon.lg} color={colors.text} />
          </Pressable>
        )}
        <Pressable
          testID="new-geofence-btn"
          onPress={handleCreate}
          accessibilityRole="button"
          accessibilityLabel={t("geofences.new")}
          android_ripple={{ color: colors.text + STATE_LAYER_ALPHA, borderless: true, radius: RIPPLE_RADIUS }}
          style={styles.headerBtn}
        >
          <Plus size={size.icon.lg} color={colors.text} />
        </Pressable>
      </View>
    ),
    [colors, handleCreate, handleShareGeofences, hasGeofences, t]
  )

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight })
  }, [navigation, headerRight])

  const geofenceData = useMemo(() => buildGeofencesGeoJSON(geofences, colors), [geofences, colors])

  return (
    <Container>
      <View style={styles.map}>
        <GeofenceMap
          tracking={tracking}
          geofenceData={geofenceData}
          currentPauseZone={currentPauseZone}
          focusRequest={focusRequest}
        />
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
        <Card variant="sheet" style={styles.sheetBody}>
          {hasGeofences ? (
            <>
              <SectionTitle first caption={t("geofences.count", { count: geofences.length })}>
                {t("geofences.zones")}
              </SectionTitle>
              {geofences.map((item, index) => (
                <View key={item.id}>
                  {index > 0 && <Divider tight inset={size.touch} />}
                  <View style={styles.zoneRow}>
                    <Pressable
                      testID={`focus-geofence-${item.id}`}
                      onPress={() => handleZoomToGeofence(item)}
                      accessibilityRole="button"
                      accessibilityLabel={t("geofences.focus", { name: item.name })}
                      android_ripple={{
                        color: colors.text + STATE_LAYER_ALPHA,
                        borderless: true,
                        radius: RIPPLE_RADIUS
                      }}
                      style={styles.focusBtn}
                    >
                      <MapPinHouse size={size.icon.md} color={colors.textSecondary} />
                    </Pressable>
                    <ListItem
                      testID={`edit-geofence-${item.id}`}
                      style={styles.zoneItem}
                      dot={item.pauseTracking ? colors.warning : colors.info}
                      label={item.name}
                      sub={currentPauseZone === item.name ? t("geofences.row.pausedNow") : t(zoneBehaviourKey(item))}
                      value={formatShortDistance(item.radius)}
                      onPress={() => navigation.navigate("Geofence Editor", { geofenceId: item.id })}
                    />
                  </View>
                </View>
              ))}
            </>
          ) : (
            <EmptyState
              testID="geofences-empty"
              title={t("geofences.empty")}
              message={t("geofences.empty.message")}
              actionLabel={t("geofences.new")}
              onActionPress={handleCreate}
            />
          )}
        </Card>
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  map: {
    flex: MAP_HERO_FRACTION,
    width: "100%"
  },
  mapBody: {
    flex: 1
  },
  sheet: {
    flex: 1 - MAP_HERO_FRACTION
  },
  sheetContent: {
    flexGrow: 1
  },
  sheetBody: {
    paddingBottom: space.xxl
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center"
  },
  headerBtn: {
    width: size.touch,
    height: size.touch,
    alignItems: "center",
    justifyContent: "center"
  },
  zoneRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  focusBtn: {
    width: size.touch,
    height: size.touch,
    alignItems: "center",
    justifyContent: "center"
  },
  zoneItem: {
    flex: 1
  }
})
