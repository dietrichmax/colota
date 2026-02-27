/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useRef, useImperativeHandle, forwardRef, useState, useEffect, useCallback } from "react"
import { StyleProp, ViewStyle, View, Text, StyleSheet, Linking, Pressable } from "react-native"
import { MapView, Camera } from "@maplibre/maplibre-react-native"
import type { MapViewRef, CameraRef } from "@maplibre/maplibre-react-native"
import type { RegionPayload } from "@maplibre/maplibre-react-native"
import { Compass } from "lucide-react-native"
import { useTheme } from "../../../hooks/useTheme"
import { DEFAULT_MAP_ZOOM } from "../../../constants"
import { fonts } from "../../../styles/typography"
import { darkifyStyle } from "./mapUtils"

const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/bright"

/** Cached dark style object so we only fetch + transform once */
let cachedDarkStyle: object | null = null
let darkStyleFetchPromise: Promise<object | null> | null = null

async function getDarkStyle(): Promise<object | null> {
  if (cachedDarkStyle) return cachedDarkStyle
  if (darkStyleFetchPromise) return darkStyleFetchPromise
  darkStyleFetchPromise = fetch(OPENFREEMAP_STYLE)
    .then((res) => res.json())
    .then((json) => {
      cachedDarkStyle = darkifyStyle(json)
      darkStyleFetchPromise = null
      return cachedDarkStyle
    })
    .catch(() => {
      darkStyleFetchPromise = null
      return null
    })
  return darkStyleFetchPromise
}

export interface ColotaMapRef {
  camera: CameraRef | null
  mapView: MapViewRef | null
}

interface Props {
  initialCenter: [number, number] // [lon, lat]
  initialZoom?: number
  onPress?: (coords: { latitude: number; longitude: number }) => void
  onRegionDidChange?: (payload: RegionPayload & { isUserInteraction: boolean }) => void
  onMapReady?: () => void
  style?: StyleProp<ViewStyle>
  children?: React.ReactNode
}

export const ColotaMapView = forwardRef<ColotaMapRef, Props>(function ColotaMapView(
  { initialCenter, initialZoom = DEFAULT_MAP_ZOOM, onPress, onRegionDidChange, onMapReady, style, children },
  ref
) {
  const cameraRef = useRef<CameraRef>(null)
  const mapViewRef = useRef<MapViewRef>(null)
  const { colors, mode } = useTheme()
  const isDark = mode === "dark"

  const [darkStyle, setDarkStyle] = useState<object | null>(cachedDarkStyle)
  const [heading, setHeading] = useState(0)

  useEffect(() => {
    if (isDark && !darkStyle) {
      getDarkStyle().then((resolved) => {
        if (resolved) setDarkStyle(resolved)
      })
    }
  }, [isDark, darkStyle])

  useImperativeHandle(ref, () => ({
    get camera() {
      return cameraRef.current
    },
    get mapView() {
      return mapViewRef.current
    }
  }))

  const mapStyle = isDark && darkStyle ? darkStyle : OPENFREEMAP_STYLE

  const handleRegionDidChange = useCallback(
    (feature: any) => {
      const props = feature.properties as RegionPayload & { isUserInteraction: boolean }
      setHeading(props.heading ?? 0)
      if (onRegionDidChange) {
        onRegionDidChange(props)
      }
    },
    [onRegionDidChange]
  )

  const handleCompassPress = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.setCamera({
        heading: 0,
        animationDuration: 300,
        animationMode: "easeTo"
      })
    }
  }, [])

  const showCompass = Math.abs(heading) > 3

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapViewRef}
        style={styles.map}
        mapStyle={mapStyle}
        attributionEnabled={false}
        logoEnabled={false}
        compassEnabled={false}
        onDidFinishLoadingMap={onMapReady}
        onPress={(feature) => {
          if (onPress && feature.geometry?.type === "Point") {
            const [lon, lat] = (feature.geometry as GeoJSON.Point).coordinates
            onPress({ latitude: lat, longitude: lon })
          }
        }}
        onRegionDidChange={handleRegionDidChange}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: initialCenter,
            zoomLevel: initialZoom
          }}
        />

        {children}
      </MapView>

      {/* Custom compass button */}
      {showCompass && (
        <Pressable
          style={({ pressed }) => [
            styles.compassButton,
            { backgroundColor: colors.card, borderColor: colors.border },
            pressed && { opacity: 0.7 }
          ]}
          onPress={handleCompassPress}
        >
          <View style={{ transform: [{ rotate: `${-heading}deg` }] }}>
            <Compass size={24} color={colors.text} />
          </View>
        </Pressable>
      )}

      {/* Attribution */}
      <View style={[styles.attribution, { backgroundColor: colors.card + "CC" }]}>
        <Pressable
          onPress={() => Linking.openURL("https://openfreemap.org")}
          style={({ pressed }) => pressed && { opacity: 0.7 }}
        >
          <Text style={[styles.attributionText, { color: colors.link }, fonts.regular]}>OpenFreeMap</Text>
        </Pressable>
        <Text style={[styles.attributionSep, { color: colors.textLight }]}>{" | "}</Text>
        <Pressable
          onPress={() => Linking.openURL("https://www.openstreetmap.org/copyright")}
          style={({ pressed }) => pressed && { opacity: 0.7 }}
        >
          <Text style={[styles.attributionText, { color: colors.link }, fonts.regular]}>OSM</Text>
        </Pressable>
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  compassButton: {
    position: "absolute",
    bottom: 78,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    borderWidth: 1,
    zIndex: 10
  },
  attribution: {
    position: "absolute",
    bottom: 4,
    right: 4,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  attributionText: {
    fontSize: 10
  },
  attributionSep: {
    fontSize: 10
  }
})
