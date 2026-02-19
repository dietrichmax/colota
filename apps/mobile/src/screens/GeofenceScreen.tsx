/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { View, Text, StyleSheet, TextInput, Pressable, FlatList, Switch, DeviceEventEmitter } from "react-native"
import { useTheme } from "../hooks/useTheme"
import NativeLocationService from "../services/NativeLocationService"
import { showAlert, showConfirm } from "../services/modalService"
import { Geofence, ScreenProps } from "../types/global"
import { useTracking, useCoords } from "../contexts/TrackingProvider"
import { fonts } from "../styles/typography"
import { X, WifiOff } from "lucide-react-native"
import { Container, SectionTitle, Card } from "../components"
import { useFocusEffect } from "@react-navigation/native"
import {
  STATS_REFRESH_IDLE,
  DEFAULT_MAP_ZOOM,
  WORLD_MAP_ZOOM,
  GEOFENCE_ZOOM_PADDING,
  MAP_ANIMATION_DURATION_MS,
  MAX_MAP_ZOOM
} from "../constants"
import { MapCenterButton } from "../components/features/map/MapCenterButton"
import { ColotaMapView, ColotaMapRef } from "../components/features/map/ColotaMapView"
import { buildGeofencesGeoJSON } from "../components/features/map/mapUtils"
import { GeofenceLayers } from "../components/features/map/GeofenceLayers"
import { UserLocationOverlay } from "../components/features/map/UserLocationOverlay"
import { logger } from "../utils/logger"

export function GeofenceScreen({}: ScreenProps) {
  const { tracking } = useTracking()
  const coords = useCoords()
  const { colors } = useTheme()

  const [geofences, setGeofences] = useState<Geofence[]>([])
  const [newName, setNewName] = useState("")
  const [newRadius, setNewRadius] = useState("50")
  const [placingGeofence, setPlacingGeofence] = useState(false)
  const [isCentered, setIsCentered] = useState(true)
  const isCenteredRef = useRef(true)
  const [hasInitialCoords, setHasInitialCoords] = useState(false)
  const [currentPauseZone, setCurrentPauseZone] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)

  const mapRef = useRef<ColotaMapRef>(null)
  const initialCenter = useRef<{
    latitude: number
    longitude: number
    accuracy: number
  } | null>(null)

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

  // Set initial map center
  useEffect(() => {
    if (hasInitialCoords) return

    if (coords) {
      initialCenter.current = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy ?? 0
      }
      setHasInitialCoords(true)
      return
    }

    NativeLocationService.getMostRecentLocation().then((latest) => {
      if (initialCenter.current) return

      initialCenter.current = latest
        ? {
            latitude: latest.latitude,
            longitude: latest.longitude,
            accuracy: latest.accuracy ?? 0
          }
        : { latitude: 0, longitude: 0, accuracy: 0 }
      setHasInitialCoords(true)
    })
  }, [coords, hasInitialCoords])

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
        const zoneName = await NativeLocationService.checkCurrentPauseZone()
        setCurrentPauseZone(zoneName)
      } catch (err) {
        logger.error("[GeofenceScreen] Failed to check pause zone:", err)
      }
    }

    checkPauseZone()
    const listener = DeviceEventEmitter.addListener("geofenceUpdated", checkPauseZone)
    return () => listener.remove()
  }, [])

  // Auto-center camera when position changes (ref avoids overriding setCamera zoom)
  useEffect(() => {
    if (coords && isCenteredRef.current && tracking && mapRef.current?.camera) {
      mapRef.current.camera.moveTo([coords.longitude, coords.latitude], MAP_ANIMATION_DURATION_MS)
    }
  }, [coords, tracking])

  const handleMapPress = useCallback(
    async (pressCoords: { latitude: number; longitude: number }) => {
      if (!placingGeofence) return

      try {
        await NativeLocationService.createGeofence({
          name: newName,
          lat: pressCoords.latitude,
          lon: pressCoords.longitude,
          radius: Number(newRadius),
          enabled: true,
          pauseTracking: true
        })

        setNewName("")
        setNewRadius("50")
        setPlacingGeofence(false)
        await loadGeofences()
        DeviceEventEmitter.emit("geofenceUpdated")
      } catch {
        showAlert("Error", "Failed to create geofence.", "error")
      }
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

  const togglePause = useCallback(
    async (id: number, value: boolean) => {
      try {
        await NativeLocationService.updateGeofence({
          id,
          pauseTracking: value
        })
        await loadGeofences()
        DeviceEventEmitter.emit("geofenceUpdated")
        await NativeLocationService.recheckZoneSettings()
      } catch {
        showAlert("Error", "Failed to update geofence.", "error")
      }
    },
    [loadGeofences]
  )

  const handleZoomToGeofence = useCallback((item: Geofence) => {
    if (!mapRef.current?.camera) return

    // Compute bounds from circle center + radius
    const latDelta = (item.radius / 111320) * 1.5
    const lonDelta = (item.radius / (111320 * Math.cos((item.lat * Math.PI) / 180))) * 1.5
    mapRef.current.camera.fitBounds(
      [item.lon + lonDelta, item.lat + latDelta],
      [item.lon - lonDelta, item.lat - latDelta],
      [...GEOFENCE_ZOOM_PADDING],
      600
    )
  }, [])

  const handleDelete = useCallback(
    async (item: Geofence) => {
      const confirmed = await showConfirm({
        title: "Delete Geofence",
        message: `Delete "${item.name}"?`,
        confirmText: "Delete",
        destructive: true
      })

      if (!confirmed) return

      try {
        await NativeLocationService.deleteGeofence(item.id!)
        await loadGeofences()
        DeviceEventEmitter.emit("geofenceUpdated")
      } catch {
        showAlert("Error", "Failed to delete geofence.", "error")
      }
    },
    [loadGeofences]
  )

  // Geofence GeoJSON
  const geofenceData = useMemo(() => buildGeofencesGeoJSON(geofences, colors), [geofences, colors])

  const hasRealCoords =
    initialCenter.current && (initialCenter.current.latitude !== 0 || initialCenter.current.longitude !== 0)
  const initialZoom = hasRealCoords ? DEFAULT_MAP_ZOOM : WORLD_MAP_ZOOM

  const renderItem = useCallback(
    ({ item }: { item: Geofence }) => (
      <Card style={styles.card}>
        <View style={styles.row}>
          <Pressable
            style={({ pressed }) => [styles.info, pressed && { opacity: 0.7 }]}
            onPress={() => handleZoomToGeofence(item)}
          >
            <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
            <Text style={[styles.radius, { color: colors.textSecondary }]}>{item.radius}m radius</Text>
          </Pressable>

          <View style={styles.actions}>
            <View style={styles.pauseSwitch}>
              <Text style={[styles.pauseLabel, { color: colors.textSecondary }]}>Pause</Text>
              <Switch
                value={item.pauseTracking}
                onValueChange={(val) => togglePause(item.id!, val)}
                trackColor={{
                  false: colors.border,
                  true: colors.warning + "80"
                }}
                thumbColor={item.pauseTracking ? colors.warning : colors.border}
              />
            </View>

            <Pressable
              onPress={() => handleDelete(item)}
              style={({ pressed }) => [
                styles.deleteBtn,
                { backgroundColor: colors.error + "15" },
                pressed && { opacity: 0.7 }
              ]}
            >
              <X size={16} color={colors.error} />
            </Pressable>
          </View>
        </View>
      </Card>
    ),
    [colors, handleDelete, togglePause, handleZoomToGeofence]
  )

  return (
    <Container>
      <View style={[styles.map, { borderRadius: colors.borderRadius }]}>
        {hasInitialCoords && initialCenter.current ? (
          <ColotaMapView
            ref={mapRef}
            initialCenter={[initialCenter.current.longitude, initialCenter.current.latitude]}
            initialZoom={initialZoom}
            onPress={handleMapPress}
            onRegionDidChange={handleRegionChange}
          >
            <GeofenceLayers fills={geofenceData.fills} labels={geofenceData.labels} haloColor={colors.card} />

            {/* Accuracy circle + user marker */}
            {coords && tracking && (
              <UserLocationOverlay coords={coords} tracking={tracking} isPaused={!!currentPauseZone} colors={colors} />
            )}
          </ColotaMapView>
        ) : null}

        <MapCenterButton visible={!isCentered && tracking} onPress={handleCenterMe} />

        {isOffline && (
          <View style={[styles.offlineBanner, { backgroundColor: colors.card }]}>
            <WifiOff size={14} color={colors.textSecondary} />
            <Text style={[styles.offlineText, { color: colors.textSecondary }]}>
              Map tiles unavailable — no internet
            </Text>
          </View>
        )}
      </View>

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
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.background,
                          color: colors.text,
                          borderColor: colors.border
                        }
                      ]}
                      placeholder="Home, Office..."
                      placeholderTextColor={colors.placeholder}
                      value={newName}
                      onChangeText={setNewName}
                    />
                  </View>

                  <View style={[styles.inputGroup, styles.inputGroupRadius]}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Radius (m)</Text>
                    <TextInput
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
                  style={({ pressed }) => [
                    styles.placeBtn,
                    { backgroundColor: colors.primary },
                    pressed && { opacity: 0.7 }
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

            {geofences.length > 0 && <SectionTitle>Active Geofences ({geofences.length})</SectionTitle>}
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
  card: { marginBottom: 12, padding: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  info: { flex: 1, marginRight: 12 },
  name: { fontSize: 15, ...fonts.semiBold, marginBottom: 2 },
  radius: { fontSize: 12 },
  actions: { flexDirection: "row", alignItems: "center", gap: 12 },
  pauseSwitch: { flexDirection: "row", alignItems: "center", gap: 6 },
  pauseLabel: {
    fontSize: 11,
    ...fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.3
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center"
  },
  empty: { alignItems: "center", paddingVertical: 40 },
  emptyText: { fontSize: 15, ...fonts.semiBold, marginBottom: 6 },
  emptyHint: {
    fontSize: 13,
    textAlign: "center",
    maxWidth: 260,
    lineHeight: 18
  },
  offlineBanner: {
    position: "absolute",
    top: 14,
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
