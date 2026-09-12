/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from "react"
import { View, StyleSheet, ScrollView, DeviceEventEmitter, Share, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useFocusEffect } from "@react-navigation/native"
import { useTheme } from "../hooks/useTheme"
import NativeLocationService from "../services/NativeLocationService"
import { showAlert } from "../services/modalService"
import { Geofence, ScreenProps } from "../types/global"
import { useTracking, useCoords } from "../contexts/TrackingProvider"
import { MapPinHouse, MapPinCheck, Share2, Plus, LocateFixed } from "lucide-react-native"
import { Card, Container, Divider, EmptyState, HeaderAction, ListItem } from "../components"
import {
  DEFAULT_MAP_ZOOM,
  GEOFENCE_ZOOM_PADDING,
  MAP_ANIMATION_DURATION_MS,
  WORLD_MAP_ZOOM,
  size,
  space
} from "../constants"
import { MapActionButton } from "../components/features/map/MapActionButton"
import { ColotaMapView, ColotaMapRef } from "../components/features/map/ColotaMapView"
import { buildGeofencesGeoJSON, geofenceBounds } from "../components/features/map/mapUtils"
import { GeofenceLayers } from "../components/features/map/GeofenceLayers"
import { UserLocationOverlay } from "../components/features/map/UserLocationOverlay"
import { logger } from "../utils/logger"
import { zoneRowSub } from "../utils/geofenceRow"
import { buildGeofencesLink } from "../utils/setupLink"

const MAP_VIEWPORT_SHARE = 0.5
const WORLD_CENTER: [number, number] = [0, 20]

type Fix = { latitude: number; longitude: number; accuracy: number }

export function GeofenceScreen({ navigation }: ScreenProps) {
  const { height: viewportHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const mapHeight = Math.round(viewportHeight * MAP_VIEWPORT_SHARE)
  const { tracking } = useTracking()
  const coords = useCoords()
  const { colors } = useTheme()

  const [geofences, setGeofences] = useState<Geofence[] | null>(null)
  const [currentPauseZone, setCurrentPauseZone] = useState<string | null>(null)
  // `undefined` until the database has answered, so the tiles never open on the world view and jump.
  const [lastFix, setLastFix] = useState<Fix | null | undefined>(undefined)
  const [mapReady, setMapReady] = useState(false)
  const [panned, setPanned] = useState(false)
  const mapRef = useRef<ColotaMapRef>(null)
  const fittedRef = useRef<string | null>(null)

  const loadGeofences = useCallback(async () => {
    try {
      setGeofences(await NativeLocationService.getGeofences())
    } catch (err) {
      logger.error("[GeofenceScreen] Failed to load geofences:", err)
    }
  }, [])

  const checkPauseZone = useCallback(async () => {
    try {
      const result = await NativeLocationService.checkCurrentPauseZone()
      setCurrentPauseZone(result?.zoneName ?? null)
    } catch (err) {
      logger.error("[GeofenceScreen] Failed to check pause zone:", err)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadGeofences()
      checkPauseZone()
    }, [loadGeofences, checkPauseZone])
  )

  useEffect(() => {
    const updated = DeviceEventEmitter.addListener("geofenceUpdated", () => {
      loadGeofences()
      checkPauseZone()
    })
    const zone = DeviceEventEmitter.addListener(
      "onPauseZoneChange",
      (data: { entered: boolean; zoneName: string | null }) => setCurrentPauseZone(data.entered ? data.zoneName : null)
    )
    return () => {
      updated.remove()
      zone.remove()
    }
  }, [loadGeofences, checkPauseZone])

  useEffect(() => {
    if (coords) {
      setLastFix({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy ?? 0 })
      return
    }
    let active = true
    NativeLocationService.getMostRecentLocation()
      .then((latest) => {
        if (!active) return
        setLastFix(
          latest ? { latitude: latest.latitude, longitude: latest.longitude, accuracy: latest.accuracy ?? 0 } : null
        )
      })
      .catch((err) => {
        logger.error("[GeofenceScreen] Failed to read the last known location:", err)
        if (active) setLastFix(null)
      })
    return () => {
      active = false
    }
  }, [coords])

  const edgeStart = space.lg + insets.left
  const edgeEnd = space.lg + insets.right
  const controlsBottom = space.lg + space.sm
  const cameraPadding = useMemo(
    () => ({ top: space.lg, bottom: space.lg, left: edgeStart, right: edgeEnd + size.iconColumn + space.lg }),
    [edgeStart, edgeEnd]
  )
  const fitPadding = useMemo(() => {
    const [top, right, bottom, left] = GEOFENCE_ZOOM_PADDING
    return {
      top: top + cameraPadding.top,
      right: right + cameraPadding.right,
      bottom: bottom + cameraPadding.bottom,
      left: left + cameraPadding.left
    }
  }, [cameraPadding])

  const fitZones = useCallback(
    (zones: Geofence[], duration: number) => {
      mapRef.current?.camera?.fitBounds(geofenceBounds(zones), { padding: fitPadding, duration })
      setPanned(false)
    },
    [fitPadding]
  )

  const zoneKey = geofences?.map((z) => z.id).join(",") ?? null
  useEffect(() => {
    if (!mapReady || !geofences || geofences.length === 0 || zoneKey === fittedRef.current) return
    // The first fit lands before the tiles show; a changed zone set animates so the eye can follow.
    fitZones(geofences, fittedRef.current === null ? 0 : MAP_ANIMATION_DURATION_MS)
    fittedRef.current = zoneKey
  }, [mapReady, geofences, zoneKey, fitZones])

  const handleShareGeofences = useCallback(async () => {
    if (!geofences || geofences.length === 0) return
    try {
      await Share.share({ message: buildGeofencesLink(geofences) })
    } catch (err) {
      logger.error("[GeofenceScreen] Failed to share geofences:", err)
      showAlert("Error", "Failed to share geofences.", "error")
    }
  }, [geofences])

  const openEditor = useCallback(
    (geofenceId?: number) => {
      navigation.navigate("Geofence Editor", geofenceId === undefined ? {} : { geofenceId })
    },
    [navigation]
  )

  const hasZones = (geofences?.length ?? 0) > 0
  const renderHeaderActions = useCallback(
    () => (
      <View style={styles.headerRow}>
        {hasZones && (
          <HeaderAction
            icon={Share2}
            label="Share all geofences"
            onPress={handleShareGeofences}
            testID="share-geofences-btn"
          />
        )}
        <HeaderAction icon={Plus} label="Create geofence" onPress={() => openEditor()} testID="add-geofence-btn" />
      </View>
    ),
    [hasZones, handleShareGeofences, openEditor]
  )
  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: renderHeaderActions })
  }, [navigation, renderHeaderActions])

  const handleRegionChange = useCallback((payload: { isUserInteraction: boolean }) => {
    if (payload.isUserInteraction) setPanned(true)
  }, [])

  const handleFit = useCallback(() => {
    if (geofences && geofences.length > 0) {
      fitZones(geofences, MAP_ANIMATION_DURATION_MS)
    } else if (lastFix) {
      mapRef.current?.camera?.flyTo({
        center: [lastFix.longitude, lastFix.latitude],
        zoom: DEFAULT_MAP_ZOOM,
        padding: cameraPadding,
        duration: MAP_ANIMATION_DURATION_MS
      })
      setPanned(false)
    }
  }, [geofences, lastFix, fitZones, cameraPadding])

  const geofenceData = useMemo(() => buildGeofencesGeoJSON(geofences ?? [], colors), [geofences, colors])
  const liveFix = tracking && coords ? coords : null
  const showDisc = panned && (hasZones || lastFix !== null)

  return (
    <Container>
      <View style={{ height: mapHeight }}>
        {lastFix !== undefined && (
          <ColotaMapView
            ref={mapRef}
            initialCenter={lastFix ? [lastFix.longitude, lastFix.latitude] : WORLD_CENTER}
            initialZoom={lastFix ? DEFAULT_MAP_ZOOM : WORLD_MAP_ZOOM}
            cameraPadding={cameraPadding}
            controlsBottom={controlsBottom}
            controlsEnd={edgeEnd}
            onRegionDidChange={handleRegionChange}
            onMapReady={() => setMapReady(true)}
          >
            <GeofenceLayers
              fills={geofenceData.fills}
              labels={geofenceData.labels}
              haloColor={colors.card}
              onPressZone={openEditor}
            />
            {liveFix && <UserLocationOverlay coords={liveFix} isPaused={!!currentPauseZone} colors={colors} />}
          </ColotaMapView>
        )}
        {showDisc && (
          <MapActionButton
            anchored={false}
            style={[styles.disc, { bottom: controlsBottom + size.iconColumn + space.lg, right: edgeEnd }]}
            accessibilityRole="button"
            accessibilityLabel={hasZones ? "Fit geofences" : "Centre map on my position"}
            onPress={handleFit}
            testID="fit-geofences-btn"
          >
            <LocateFixed size={size.icon.md} color={colors.textLight} />
          </MapActionButton>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {geofences === null ? null : hasZones ? (
          <Card rows>
            {geofences.map((zone, i) => {
              const pausedHere = tracking && currentPauseZone === zone.name
              return (
                <React.Fragment key={zone.id}>
                  {i > 0 && <Divider tight inset />}
                  <ListItem
                    testID={`edit-geofence-${zone.id}`}
                    icon={pausedHere ? MapPinCheck : MapPinHouse}
                    label={zone.name}
                    sub={zoneRowSub(zone, pausedHere)}
                    onPress={() => openEditor(zone.id)}
                  />
                </React.Fragment>
              )
            })}
          </Card>
        ) : (
          <EmptyState
            icon={MapPinHouse}
            title="No geofences yet"
            hint="A geofence stops recording while you are inside it."
            action={{ label: "Create geofence", onPress: () => openEditor() }}
            style={styles.empty}
          />
        )}
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row"
  },
  disc: {
    position: "absolute"
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl
  },
  empty: {
    paddingHorizontal: 0
  }
})
