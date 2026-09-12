/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useMemo, useRef, useState } from "react"
import { View, Text, StyleSheet } from "react-native"
import { useTheme } from "../hooks/useTheme"
import { useCoords } from "../contexts/TrackingProvider"
import { Button, Container } from "../components"
import { ColotaMapView, ColotaMapRef } from "../components/features/map/ColotaMapView"
import { GeofenceLayers } from "../components/features/map/GeofenceLayers"
import { buildGeofencesGeoJSON } from "../components/features/map/mapUtils"
import { fontSizes, fonts } from "../styles/typography"
import { space } from "../constants"
import { formatShortDistance } from "../utils/geo"
import { RootScreenProps } from "../types/navigation"

const WORLD_CENTER: [number, number] = [0, 0]

export function PlaceZoneScreen({ navigation, route }: RootScreenProps<"Place Zone">) {
  const { colors } = useTheme()
  const coords = useCoords()
  const mapRef = useRef<ColotaMapRef>(null)

  const { name, radius, lat, lon } = route.params
  const [picked, setPicked] = useState<{ lat: number; lon: number } | null>(
    lat != null && lon != null ? { lat, lon } : null
  )

  const initialCenter = useMemo<[number, number] | undefined>(() => {
    if (lat != null && lon != null) return [lon, lat]
    if (coords) return [coords.longitude, coords.latitude]
    return undefined
  }, [lat, lon, coords])

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

  const handleConfirm = useCallback(() => {
    if (!picked) return
    navigation.popTo("Geofence Editor", { lat: picked.lat, lon: picked.lon }, { merge: true })
  }, [navigation, picked])

  return (
    <Container>
      <View style={styles.mapWrap}>
        <ColotaMapView
          ref={mapRef}
          initialCenter={initialCenter ?? WORLD_CENTER}
          onPress={(c) => setPicked({ lat: c.latitude, lon: c.longitude })}
          style={styles.map}
        >
          <GeofenceLayers fills={draft.fills as never} labels={draft.labels as never} haloColor={colors.background} />
        </ColotaMapView>
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
  footer: { padding: space.lg, gap: space.sm },
  readout: { fontSize: fontSizes.description, ...fonts.regular }
})
