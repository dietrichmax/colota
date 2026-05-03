/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { View, Text, StyleSheet, TextInput, Pressable, FlatList, DeviceEventEmitter, Share } from "react-native"
import { useTheme } from "../hooks/useTheme"
import NativeLocationService from "../services/NativeLocationService"
import { showAlert } from "../services/modalService"
import { Geofence, ScreenProps } from "../types/global"
import { useTracking, useCoords } from "../contexts/TrackingProvider"
import { fonts } from "../styles/typography"
import { ChevronRight, Wifi, PersonStanding, MapPinHouse, Share2 } from "lucide-react-native"
import { Container, SectionTitle, Card } from "../components"
import {
  DEFAULT_MAP_ZOOM,
  WORLD_MAP_ZOOM,
  GEOFENCE_ZOOM_PADDING,
  MAP_ANIMATION_DURATION_MS,
  MAX_MAP_ZOOM,
  HIT_SLOP_MD
} from "../constants"
import { MapCenterButton } from "../components/features/map/MapCenterButton"
import { ColotaMapView, ColotaMapRef } from "../components/features/map/ColotaMapView"
import { buildGeofencesGeoJSON } from "../components/features/map/mapUtils"
import { GeofenceLayers } from "../components/features/map/GeofenceLayers"
import { UserLocationOverlay } from "../components/features/map/UserLocationOverlay"
import { logger } from "../utils/logger"
import { formatShortDistance, shortDistanceUnit, inputToMeters } from "../utils/geo"

const GeofenceMap = React.memo(function GeofenceMap({
  tracking,
  geofenceData,
  currentPauseZone,
  onMapPress,
  focusRequest
}: {
  tracking: boolean
  geofenceData: ReturnType<typeof buildGeofencesGeoJSON>
  currentPauseZone: string | null
  onMapPress: (coords: { latitude: number; longitude: number }) => void
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
        duration: 600
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
    <View style={[styles.map, { borderRadius: colors.borderRadius }]}>
      {hasInitialCoords && initialCenter.current ? (
        <ColotaMapView
          ref={mapRef}
          initialCenter={[initialCenter.current.longitude, initialCenter.current.latitude]}
          initialZoom={initialZoom}
          onPress={onMapPress}
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

export function GeofenceScreen({ navigation }: ScreenProps) {
  const { tracking } = useTracking()
  const { colors } = useTheme()

  const [geofences, setGeofences] = useState<Geofence[]>([])
  const [newName, setNewName] = useState("")
  const [newRadius, setNewRadius] = useState("50")
  const [placingGeofence, setPlacingGeofence] = useState(false)
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

  const handleMapPress = useCallback(
    async (pressCoords: { latitude: number; longitude: number }) => {
      if (!placingGeofence) return
      setPlacingGeofence(false)
      try {
        await NativeLocationService.createGeofence({
          name: newName.trim(),
          lat: pressCoords.latitude,
          lon: pressCoords.longitude,
          radius: inputToMeters(Number(newRadius)),
          enabled: true,
          pauseTracking: true,
          pauseOnWifi: false,
          pauseOnMotionless: false,
          motionlessTimeoutMinutes: 10,
          heartbeatEnabled: false,
          heartbeatIntervalMinutes: 15
        })
        await loadGeofences()
        DeviceEventEmitter.emit("geofenceUpdated")
      } catch (err) {
        logger.error("[GeofenceScreen] Failed to create geofence:", err)
        showAlert("Error", "Failed to create geofence.", "error")
      }
      setNewName("")
      setNewRadius("50")
    },
    [placingGeofence, newName, newRadius, loadGeofences]
  )

  const startPlacingGeofence = useCallback(() => {
    if (!newName.trim()) {
      showAlert("Missing Name", "Please enter a name.", "warning")
      return
    }

    const radius = Number(newRadius)
    if (!radius || radius <= 0) {
      showAlert("Invalid Radius", "Please enter a valid radius.", "warning")
      return
    }

    setPlacingGeofence(true)
  }, [newName, newRadius])

  const focusKeyRef = useRef(0)
  const handleZoomToGeofence = useCallback((item: Geofence) => {
    setFocusRequest({ geofence: item, key: ++focusKeyRef.current })
  }, [])

  const handleShareGeofences = useCallback(async () => {
    if (geofences.length === 0) return
    try {
      const exportable = geofences.map(({ id: _id, createdAt: _createdAt, enabled: _enabled, ...rest }) => rest)
      const encoded = btoa(JSON.stringify({ geofences: exportable }))
      const link = `colota://setup?config=${encoded}`
      await Share.share({ message: link })
    } catch (err) {
      logger.error("[GeofenceScreen] Failed to share geofences:", err)
      showAlert("Error", "Failed to share geofences.", "error")
    }
  }, [geofences])

  const geofenceData = useMemo(() => buildGeofencesGeoJSON(geofences, colors), [geofences, colors])

  const renderItem = useCallback(
    ({ item }: { item: Geofence }) => (
      <Card style={styles.card}>
        <View style={styles.row}>
          <Pressable
            onPress={() => handleZoomToGeofence(item)}
            hitSlop={HIT_SLOP_MD}
            style={({ pressed }) => [styles.zoomBtn, pressed && { opacity: colors.pressedOpacity }]}
          >
            <MapPinHouse size={20} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            testID={`edit-geofence-${item.id}`}
            style={({ pressed }) => [styles.editBtn, pressed && { opacity: colors.pressedOpacity }]}
            onPress={() => navigation.navigate("Geofence Editor", { geofenceId: item.id })}
          >
            <View style={styles.info}>
              <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
              <View style={styles.radiusRow}>
                <Text style={[styles.radius, { color: colors.textSecondary }]}>
                  {formatShortDistance(item.radius)} radius
                </Text>
                {item.pauseOnWifi && <Wifi size={12} color={colors.textSecondary} />}
                {item.pauseOnMotionless && <PersonStanding size={12} color={colors.textSecondary} />}
              </View>
            </View>
            <ChevronRight size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      </Card>
    ),
    [colors, handleZoomToGeofence, navigation]
  )

  return (
    <Container>
      <GeofenceMap
        tracking={tracking}
        geofenceData={geofenceData}
        currentPauseZone={currentPauseZone}
        onMapPress={handleMapPress}
        focusRequest={focusRequest}
      />

      <FlatList
        data={geofences}
        keyExtractor={(item) => item.id!.toString()}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={styles.section}>
              <SectionTitle>Create Geofence</SectionTitle>
              <Card>
                <Text style={[styles.hint, { color: colors.textSecondary }]}>
                  Enter a name and radius, then tap the map to place
                </Text>

                <View style={styles.inputRow}>
                  <View style={[styles.inputGroup, styles.inputGroupName]}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Name</Text>
                    <TextInput
                      testID="geofence-name-input"
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.background,
                          color: colors.text,
                          borderColor: colors.border
                        }
                      ]}
                      placeholder="Home, Work..."
                      placeholderTextColor={colors.placeholder}
                      value={newName}
                      onChangeText={setNewName}
                    />
                  </View>

                  <View style={[styles.inputGroup, styles.inputGroupRadius]}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Radius ({shortDistanceUnit()})</Text>
                    <TextInput
                      testID="geofence-radius-input"
                      style={[
                        styles.input,
                        styles.inputCentered,
                        {
                          backgroundColor: colors.background,
                          color: colors.text,
                          borderColor: colors.border
                        }
                      ]}
                      placeholder="50"
                      placeholderTextColor={colors.placeholder}
                      value={newRadius}
                      keyboardType="numeric"
                      onChangeText={setNewRadius}
                    />
                  </View>
                </View>

                <Pressable
                  testID="place-geofence-btn"
                  style={({ pressed }) => [
                    styles.placeBtn,
                    { backgroundColor: colors.primary },
                    pressed && { opacity: colors.pressedOpacity }
                  ]}
                  onPress={startPlacingGeofence}
                  disabled={placingGeofence}
                >
                  <Text style={[styles.placeBtnText, { color: colors.textOnPrimary }]}>
                    {placingGeofence ? "Tap Map to Place..." : "Place Geofence"}
                  </Text>
                </Pressable>
              </Card>
            </View>

            {geofences.length > 0 && (
              <View style={styles.activeHeader}>
                <SectionTitle>Active Geofences ({geofences.length})</SectionTitle>
                <Pressable
                  testID="share-geofences-btn"
                  onPress={handleShareGeofences}
                  hitSlop={HIT_SLOP_MD}
                  style={({ pressed }) => [styles.shareBtn, pressed && { opacity: colors.pressedOpacity }]}
                >
                  <Share2 size={20} color={colors.textSecondary} />
                </Pressable>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          geofences.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No geofences yet</Text>
              <Text style={[styles.emptyHint, { color: colors.textLight }]}>
                Create a geofence to stop recording locations in specific areas
              </Text>
            </View>
          ) : null
        }
        renderItem={renderItem}
      />
    </Container>
  )
}

const styles = StyleSheet.create({
  map: { height: 450, overflow: "hidden" },
  list: { padding: 20, paddingBottom: 40 },
  section: { marginBottom: 16 },
  hint: { fontSize: 13, ...fonts.regular, lineHeight: 18, marginBottom: 16 },
  inputRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  inputGroup: { flex: 1 },
  inputGroupName: {
    flex: 2
  },
  inputGroupRadius: {
    flex: 0,
    minWidth: 90
  },
  label: {
    fontSize: 12,
    ...fonts.semiBold,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  input: { padding: 14, borderWidth: 1.5, borderRadius: 10, fontSize: 15 },
  inputCentered: {
    textAlign: "center"
  },
  placeBtn: { padding: 16, borderRadius: 12, alignItems: "center" },
  placeBtnText: { fontSize: 15, ...fonts.semiBold },
  card: { marginBottom: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  zoomBtn: { padding: 4, marginRight: 16 },
  activeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  shareBtn: { padding: 4 },
  editBtn: { flex: 1, flexDirection: "row", alignItems: "center" },
  info: { flex: 1, marginRight: 12 },
  name: { fontSize: 15, ...fonts.semiBold, marginBottom: 2 },
  radiusRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  radius: { fontSize: 12 },
  empty: { alignItems: "center", paddingVertical: 20 },
  emptyText: { fontSize: 15, ...fonts.semiBold, marginBottom: 6 },
  emptyHint: {
    fontSize: 13,
    textAlign: "center",
    maxWidth: 260,
    lineHeight: 18
  }
})
