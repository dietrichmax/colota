/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { View, Text, StyleSheet } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTheme } from "../hooks/useTheme"
import { useTranslation } from "../i18n/useTranslation"
import { useCoords } from "../contexts/TrackingProvider"
import NativeLocationService from "../services/NativeLocationService"
import { Button, Container, MapOverlay } from "../components"
import { ColotaMapView } from "../components/features/map/ColotaMapView"
import { GeofenceLayers } from "../components/features/map/GeofenceLayers"
import { buildGeofencesGeoJSON } from "../components/features/map/mapUtils"
import { text } from "../styles/typography"
import { elevation, space, DEFAULT_MAP_ZOOM, WORLD_MAP_ZOOM, MAP_OVERLAY_GUTTER } from "../constants"
import { logger } from "../utils/logger"
import type { RootScreenProps } from "../types/navigation"

type Picked = { latitude: number; longitude: number }

/**
 * The map step of the geofence editor. It owns nothing but the centre: the draft stays in the
 * editor below it on the stack, so hardware back returns to a form that still holds the name,
 * the radius and every pause option.
 */
export function GeofencePlacementScreen({ navigation, route }: RootScreenProps<"Place Zone">) {
  const { colors, mode } = useTheme()
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const coords = useCoords()
  const { name, radius, lat, lon } = route.params

  const [picked, setPicked] = useState<Picked | null>(
    lat != null && lon != null ? { latitude: lat, longitude: lon } : null
  )

  const initialCenter = useRef<[number, number] | null>(null)
  const [hasInitialCenter, setHasInitialCenter] = useState(false)

  useEffect(() => {
    if (hasInitialCenter) return
    if (lat != null && lon != null) {
      initialCenter.current = [lon, lat]
      setHasInitialCenter(true)
      return
    }
    if (coords) {
      initialCenter.current = [coords.longitude, coords.latitude]
      setHasInitialCenter(true)
      return
    }
    NativeLocationService.getMostRecentLocation()
      .then((latest) => {
        if (initialCenter.current) return
        initialCenter.current = latest ? [latest.longitude, latest.latitude] : [0, 0]
        setHasInitialCenter(true)
      })
      .catch((err) => {
        logger.error("[GeofencePlacement] Failed to read the last known location:", err)
        initialCenter.current = [0, 0]
        setHasInitialCenter(true)
      })
  }, [coords, hasInitialCenter, lat, lon])

  const preview = useMemo(() => {
    if (!picked) return null
    return buildGeofencesGeoJSON(
      [
        {
          name: name ?? "",
          lat: picked.latitude,
          lon: picked.longitude,
          radius,
          enabled: true,
          pauseTracking: true,
          pauseOnWifi: false,
          pauseOnMotionless: false,
          motionlessTimeoutMinutes: 1,
          heartbeatEnabled: false,
          heartbeatIntervalMinutes: 15
        }
      ],
      colors
    )
  }, [picked, name, radius, colors])

  const handleConfirm = useCallback(() => {
    if (!picked) return
    navigation.navigate(
      "Geofence Editor",
      { lat: picked.latitude, lon: picked.longitude },
      // Merge, or the editor loses the id it is editing.
      { merge: true }
    )
  }, [navigation, picked])

  const hasRealCenter = initialCenter.current && (initialCenter.current[0] !== 0 || initialCenter.current[1] !== 0)

  return (
    <Container>
      <View style={styles.map}>
        {hasInitialCenter && initialCenter.current ? (
          <ColotaMapView
            initialCenter={initialCenter.current}
            initialZoom={hasRealCenter ? DEFAULT_MAP_ZOOM : WORLD_MAP_ZOOM}
            onPress={setPicked}
          >
            {preview && <GeofenceLayers fills={preview.fills} labels={preview.labels} haloColor={colors.card} />}
          </ColotaMapView>
        ) : null}

        <View
          pointerEvents="box-none"
          style={[
            styles.hint,
            {
              top: MAP_OVERLAY_GUTTER,
              start: insets.left + MAP_OVERLAY_GUTTER,
              end: insets.right + MAP_OVERLAY_GUTTER
            }
          ]}
        >
          <MapOverlay testID="placement-hint">
            <Text style={[styles.hintLabel, { color: colors.text }]}>
              {picked ? t("geofencePlacement.hintPlaced") : t("geofencePlacement.hint")}
            </Text>
          </MapOverlay>
        </View>

        {picked && (
          <View pointerEvents="box-none" style={[styles.confirm, { bottom: insets.bottom + MAP_OVERLAY_GUTTER }]}>
            <Button
              testID="confirm-placement-btn"
              shape="pill"
              elevation={mode === "dark" ? 0 : elevation.floating}
              title={t("geofencePlacement.confirm")}
              onPress={handleConfirm}
            />
          </View>
        )}
      </View>
    </Container>
  )
}

const styles = StyleSheet.create({
  map: {
    flex: 1
  },
  hint: {
    position: "absolute",
    alignItems: "flex-start"
  },
  hintLabel: {
    ...text.label
  },
  confirm: {
    position: "absolute",
    start: 0,
    end: 0,
    alignItems: "center",
    paddingHorizontal: space.lg
  }
})
