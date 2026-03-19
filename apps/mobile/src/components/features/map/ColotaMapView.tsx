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
import { useIsFocused } from "@react-navigation/native"
import { useTheme } from "../../../hooks/useTheme"
import { DEFAULT_MAP_ZOOM, MAP_STYLE_URL_LIGHT, MAP_STYLE_URL_DARK } from "../../../constants"
import { fonts } from "../../../styles/typography"
import NativeLocationService from "../../../services/NativeLocationService"

const DEFAULT_ATTRIBUTION_LINKS = [
  { url: "https://mxd.codes", label: "mxd.codes" },
  { url: "https://openmaptiles.org/", label: "© OpenMapTiles" },
  { url: "https://www.openstreetmap.org/copyright", label: "© OpenStreetMap contributors" }
]

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

  const [mapStyleLight, setMapStyleLight] = useState(MAP_STYLE_URL_LIGHT)
  const [mapStyleDark, setMapStyleDark] = useState(MAP_STYLE_URL_DARK)
  const [heading, setHeading] = useState(0)

  const isFocused = useIsFocused()

  useEffect(() => {
    if (!isFocused) return
    Promise.all([
      NativeLocationService.getSetting("mapStyleUrlLight"),
      NativeLocationService.getSetting("mapStyleUrlDark")
    ])
      .then(([light, dark]) => {
        setMapStyleLight(light || MAP_STYLE_URL_LIGHT)
        setMapStyleDark(dark || MAP_STYLE_URL_DARK)
      })
      .catch(() => {})
  }, [isFocused])

  useImperativeHandle(
    ref,
    () => ({
      get camera() {
        return cameraRef.current
      },
      get mapView() {
        return mapViewRef.current
      }
    }),
    []
  )

  const mapStyle = isDark ? mapStyleDark : mapStyleLight
  const isCustomStyle = mapStyleLight !== MAP_STYLE_URL_LIGHT || mapStyleDark !== MAP_STYLE_URL_DARK

  const handleRegionDidChange = useCallback(
    (feature: GeoJSON.Feature<GeoJSON.Point, RegionPayload>) => {
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

  const handlePress = useCallback(
    (feature: GeoJSON.Feature) => {
      if (onPress && feature.geometry?.type === "Point") {
        const [lon, lat] = (feature.geometry as GeoJSON.Point).coordinates
        onPress({ latitude: lat, longitude: lon })
      }
    },
    [onPress]
  )

  const showCompass = Math.abs(heading) > 3

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapViewRef}
        style={styles.map}
        mapStyle={mapStyle}
        attributionEnabled={isCustomStyle}
        logoEnabled={false}
        compassEnabled={false}
        onDidFinishLoadingMap={onMapReady}
        onPress={onPress ? handlePress : undefined}
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
            pressed && { opacity: colors.pressedOpacity }
          ]}
          onPress={handleCompassPress}
        >
          <View style={{ transform: [{ rotate: `${-heading}deg` }] }}>
            <Compass size={24} color={colors.text} />
          </View>
        </Pressable>
      )}

      {/* Attribution - custom overlay for default server, MapLibre built-in for custom styles */}
      {!isCustomStyle && (
        <View style={[styles.attribution, { backgroundColor: colors.card + "CC" }]}>
          {DEFAULT_ATTRIBUTION_LINKS.map((link, i) => (
            <React.Fragment key={link.url}>
              {i > 0 && <Text style={[styles.attributionText, { color: colors.textLight }, fonts.regular]}> · </Text>}
              <Pressable
                onPress={() => Linking.openURL(link.url)}
                style={({ pressed }) => pressed && { opacity: colors.pressedOpacity }}
              >
                <Text style={[styles.attributionText, { color: colors.link }, fonts.regular]}>{link.label}</Text>
              </Pressable>
            </React.Fragment>
          ))}
        </View>
      )}
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
  }
})
