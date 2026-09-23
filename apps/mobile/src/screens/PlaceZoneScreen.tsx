/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { View, Text, StyleSheet } from "react-native"
import { LocateFixed } from "lucide-react-native"
import { useTheme } from "../hooks/useTheme"
import { useTracking, useCoords } from "../contexts/TrackingProvider"
import NativeLocationService from "../services/NativeLocationService"
import { Button, Container } from "../components"
import { ColotaMapView, ColotaMapRef } from "../components/features/map/ColotaMapView"
import { GeofenceLayers } from "../components/features/map/GeofenceLayers"
import { UserLocationOverlay } from "../components/features/map/UserLocationOverlay"
import { MapActionButton, mapActionStyles } from "../components/features/map/MapActionButton"
import { buildGeofencesGeoJSON } from "../components/features/map/mapUtils"
import { fontSizes, fonts } from "../styles/typography"
import { DEFAULT_MAP_ZOOM, MAP_ANIMATION_DURATION_MS, WORLD_MAP_ZOOM, size, space } from "../constants"
import { formatShortDistance } from "../utils/geo"
import { logger } from "../utils/logger"
import { RootScreenProps } from "../types/navigation"
import type { LocationCoords } from "../types/global"

const WORLD_CENTER: [number, number] = [0, 0]

export function PlaceZoneScreen({ navigation, route }: RootScreenProps<"Place Zone">) {
  const { colors } = useTheme()
  const { tracking } = useTracking()
  const coords = useCoords()
  const mapRef = useRef<ColotaMapRef>(null)

  const { name, radius, lat, lon } = route.params
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(
    lat != null && lon != null ? { lat, lon } : null
  )
  // `undefined` until the database has answered, so the map never opens on [0, 0] at street zoom and jumps.
  const [savedFix, setSavedFix] = useState<LocationCoords | null | undefined>(undefined)

  const liveFix = tracking && coords ? coords : null

  useEffect(() => {
    if (liveFix) return
    let active = true
    NativeLocationService.getMostRecentLocation()
      .then((latest) => {
        if (!active) return
        setSavedFix(latest ? { latitude: latest.latitude, longitude: latest.longitude, accuracy: 0 } : null)
      })
      .catch((err) => {
        logger.error("[PlaceZoneScreen] Failed to read the last known location:", err)
        if (active) setSavedFix(null)
      })
    return () => {
      active = false
    }
  }, [liveFix])

  const position = liveFix ?? savedFix ?? null
  const hasZoneCoord = lat != null && lon != null
  const ready = hasZoneCoord || liveFix !== null || savedFix !== undefined

  const initialCenter = useMemo<[number, number] | undefined>(() => {
    if (lat != null && lon != null) return [lon, lat]
    if (position) return [position.longitude, position.latitude]
    return undefined
  }, [lat, lon, position])

  // Drawn through the list's own builder, so this circle is the circle the zone gets.
  const draft = useMemo(
    () =>
      picked
        ? buildGeofencesGeoJSON(
            [{ id: -1, name, lat: picked.lat, lon: picked.lon, radius, enabled: true } as never],
            colors
          )
        : { fills: { type: "FeatureCollection", features: [] }, labels: { type: "FeatureCollection", features: [] } },
    [picked, name, radius, colors]
  )

  const handlePlaceAtFix = useCallback(() => {
    if (!liveFix) return
    setPicked({ lat: liveFix.latitude, lon: liveFix.longitude })
    mapRef.current?.camera?.flyTo({
      center: [liveFix.longitude, liveFix.latitude],
      zoom: DEFAULT_MAP_ZOOM,
      duration: MAP_ANIMATION_DURATION_MS
    })
  }, [liveFix])

  const handleConfirm = useCallback(() => {
    if (!picked) return
    navigation.popTo("Geofence Editor", { lat: picked.lat, lon: picked.lon }, { merge: true })
  }, [navigation, picked])

  return (
    <Container>
      <View style={styles.mapWrap}>
        {ready && (
          <ColotaMapView
            ref={mapRef}
            initialCenter={initialCenter ?? WORLD_CENTER}
            initialZoom={initialCenter ? DEFAULT_MAP_ZOOM : WORLD_MAP_ZOOM}
            onPress={(c) => setPicked({ lat: c.latitude, lon: c.longitude })}
            style={styles.map}
          >
            <GeofenceLayers fills={draft.fills as never} labels={draft.labels as never} haloColor={colors.background} />
            {liveFix ? (
              <UserLocationOverlay coords={liveFix} isPaused={false} colors={colors} />
            ) : (
              savedFix && <UserLocationOverlay coords={savedFix} isPaused colors={colors} />
            )}
          </ColotaMapView>
        )}
        {liveFix && (
          <MapActionButton
            style={[mapActionStyles.right, styles.locate]}
            accessibilityRole="button"
            accessibilityLabel="Place zone at my position"
            onPress={handlePlaceAtFix}
            testID="place-at-fix-btn"
          >
            <LocateFixed size={size.icon.md} color={colors.textLight} />
          </MapActionButton>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={[styles.readout, { color: picked ? colors.text : colors.textSecondary }]}>
          {picked
            ? `${picked.lat.toFixed(5)}, ${picked.lon.toFixed(5)} · ${formatShortDistance(radius)} radius`
            : "Tap the map to place the zone"}
        </Text>
        <Button title="Use this location" onPress={handleConfirm} disabled={!picked} />
      </View>
    </Container>
  )
}

const styles = StyleSheet.create({
  mapWrap: { flex: 1 },
  map: { flex: 1 },
  locate: { bottom: space.xxl + size.iconColumn + space.lg },
  footer: { padding: space.lg, gap: space.sm },
  readout: { fontSize: fontSizes.description, ...fonts.regular }
})
