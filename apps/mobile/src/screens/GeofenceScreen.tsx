/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { View, StyleSheet, FlatList, DeviceEventEmitter, Share, useWindowDimensions } from "react-native"
import { useTheme } from "../hooks/useTheme"
import NativeLocationService from "../services/NativeLocationService"
import { showAlert } from "../services/modalService"
import { Geofence, ScreenProps } from "../types/global"
import { useTracking, useCoords } from "../contexts/TrackingProvider"
import { MapPinHouse, Share2, Plus } from "lucide-react-native"
import { Button, Card, Container, Divider, EmptyState, IconButton, ListItem, SectionTitle } from "../components"
import { DEFAULT_MAP_ZOOM, MAP_ANIMATION_DURATION_MS, WORLD_MAP_ZOOM, space } from "../constants"
import { MapCenterButton } from "../components/features/map/MapCenterButton"
import { ColotaMapView, ColotaMapRef } from "../components/features/map/ColotaMapView"
import { buildGeofencesGeoJSON } from "../components/features/map/mapUtils"
import { GeofenceLayers } from "../components/features/map/GeofenceLayers"
import { UserLocationOverlay } from "../components/features/map/UserLocationOverlay"
import { logger } from "../utils/logger"
import { formatShortDistance } from "../utils/geo"
import { buildGeofencesLink } from "../utils/setupLink"

const ZoneSeparator = () => <Divider tight />

const GeofenceMap = React.memo(function GeofenceMapView({
  tracking,
  geofenceData,
  currentPauseZone
}: {
  tracking: boolean
  geofenceData: ReturnType<typeof buildGeofencesGeoJSON>
  currentPauseZone: string | null
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

  const handleCenterMe = useCallback(() => {
    if (coords && mapRef.current?.camera) {
      mapRef.current.camera.flyTo({
        center: [coords.longitude, coords.latitude],
        zoom: DEFAULT_MAP_ZOOM,
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
    <View style={[styles.map, { borderRadius: colors.borderRadius }]}>
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

const MAP_VIEWPORT_SHARE = 0.4

export function GeofenceScreen({ navigation }: ScreenProps) {
  const { height: viewportHeight } = useWindowDimensions()
  const mapHeight = Math.round(viewportHeight * MAP_VIEWPORT_SHARE)
  const { tracking } = useTracking()
  const { colors } = useTheme()

  const [geofences, setGeofences] = useState<Geofence[]>([])
  const [currentPauseZone, setCurrentPauseZone] = useState<string | null>(null)

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

  const handleShareGeofences = useCallback(async () => {
    if (geofences.length === 0) return
    try {
      await Share.share({ message: buildGeofencesLink(geofences) })
    } catch (err) {
      logger.error("[GeofenceScreen] Failed to share geofences:", err)
      showAlert("Error", "Failed to share geofences.", "error")
    }
  }, [geofences])

  const geofenceData = useMemo(() => buildGeofencesGeoJSON(geofences, colors), [geofences, colors])

  const renderItem = useCallback(
    ({ item }: { item: Geofence }) => {
      const modes = [item.pauseOnWifi && "WiFi pause", item.pauseOnMotionless && "motionless pause"].filter(Boolean)
      return (
        <ListItem
          testID={`edit-geofence-${item.id}`}
          icon={MapPinHouse}
          label={item.name}
          sub={[`${formatShortDistance(item.radius)} radius`, ...modes].join(" · ")}
          onPress={() => navigation.navigate("Geofence Editor", { geofenceId: item.id })}
        />
      )
    },
    [navigation]
  )

  return (
    <Container>
      <View style={{ height: mapHeight }}>
        <GeofenceMap tracking={tracking} geofenceData={geofenceData} currentPauseZone={currentPauseZone} />
      </View>

      <View style={styles.listWrap}>
        <Button
          title="Create geofence"
          icon={Plus}
          testID="add-geofence-btn"
          onPress={() => navigation.navigate("Geofence Editor", {})}
        />

        {geofences.length > 0 && (
          <View style={styles.activeHeader}>
            <SectionTitle>Active geofences ({geofences.length})</SectionTitle>
            <IconButton
              icon={Share2}
              testID="share-geofences-btn"
              accessibilityLabel="Share all zones"
              onPress={handleShareGeofences}
            />
          </View>
        )}
        <Card rows style={styles.listCard}>
          <FlatList
            data={geofences}
            keyExtractor={(item) => item.id!.toString()}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={ZoneSeparator}
            showsVerticalScrollIndicator={false}
            renderItem={renderItem}
          />
        </Card>
        {geofences.length === 0 && (
          <EmptyState title="No geofences yet" hint="Create a geofence to stop recording locations in specific areas" />
        )}
      </View>
    </Container>
  )
}

const styles = StyleSheet.create({
  map: { flex: 1, overflow: "hidden" },
  listWrap: { flex: 1, padding: space.lg },
  // ListItem cancels the padding of whatever contains it, and inside a list that is the content
  // container rather than the card. Moving this back onto the card clips the leading icon.
  listCard: { flex: 1, paddingHorizontal: 0 },
  listContent: { paddingHorizontal: space.lg },
  activeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }
})
