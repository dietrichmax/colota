/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useRef, useImperativeHandle, forwardRef, useState, useEffect, useCallback } from "react"
import { StyleProp, ViewStyle, View, Text, StyleSheet, Linking, Pressable, Modal } from "react-native"
import { Map, Camera } from "@maplibre/maplibre-react-native"
import type {
  MapRef,
  CameraRef,
  ViewStateChangeEvent,
  LngLatBounds,
  ViewPadding
} from "@maplibre/maplibre-react-native"
import type { NativeSyntheticEvent } from "react-native"
import { Compass, Info } from "lucide-react-native"
import { useIsFocused } from "@react-navigation/native"
import { radius } from "@colota/shared"
import { useTheme } from "../../../hooks/useTheme"
import {
  DEFAULT_MAP_ZOOM,
  MAP_STYLE_URL_DARK,
  MAP_STYLE_URL_LIGHT,
  size,
  space,
  elevation,
  STATE_LAYER_ALPHA
} from "../../../constants"
import { fontSizes, fonts, lineHeights, type } from "../../../styles/typography"
import NativeLocationService from "../../../services/NativeLocationService"
import { MapActionButton, mapActionStyles } from "./MapActionButton"
import { Button } from "../../ui/Button"

interface AttributionLink {
  url: string
  label: string
}

// Used when the style fetch fails or returns no attribution. Must cover
// anything legally required for the default tile sources (OSM ODbL,
// OpenMapTiles CC-BY) so attribution is never silently hidden.
const FALLBACK_ATTRIBUTION_LINKS: AttributionLink[] = [
  { url: "https://www.openstreetmap.org/copyright", label: "© OpenStreetMap contributors" },
  { url: "https://maps.mxd.codes", label: "© maps.mxd.codes" },
  { url: "https://openmaptiles.org", label: "© OpenMapTiles" }
]

function parseStyleAttribution(sources: unknown): AttributionLink[] {
  if (!sources || typeof sources !== "object") return []
  const seen = new Set<string>()
  const links: AttributionLink[] = []
  const anchorRe = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi
  for (const src of Object.values(sources as Record<string, unknown>)) {
    const html = (src as { attribution?: unknown })?.attribution
    if (typeof html !== "string") continue
    for (const match of html.matchAll(anchorRe)) {
      const url = match[1]
      const label = match[2].trim()
      if (!label || seen.has(url)) continue
      seen.add(url)
      links.push({ url, label })
    }
  }
  return links
}

export interface ColotaMapRef {
  camera: CameraRef | null
  mapView: MapRef | null
}

export interface RegionChangePayload {
  heading: number
  isUserInteraction: boolean
  bounds: LngLatBounds
}

interface Props {
  initialCenter: [number, number] // [lon, lat]
  initialZoom?: number
  onPress?: (coords: { latitude: number; longitude: number }) => void
  onRegionDidChange?: (payload: RegionChangePayload) => void
  onMapReady?: () => void
  cameraPadding?: ViewPadding
  controlsBottom?: number
  controlsEnd?: number
  style?: StyleProp<ViewStyle>
  children?: React.ReactNode
}

export const ColotaMapView = forwardRef<ColotaMapRef, Props>(function ColotaMapViewInner(
  {
    initialCenter,
    initialZoom = DEFAULT_MAP_ZOOM,
    onPress,
    onRegionDidChange,
    onMapReady,
    cameraPadding,
    controlsBottom,
    controlsEnd,
    style,
    children
  },
  ref
) {
  const cameraRef = useRef<CameraRef>(null)
  const mapViewRef = useRef<MapRef>(null)
  const { colors, mode } = useTheme()
  const isDark = mode === "dark"

  const [mapStyleLight, setMapStyleLight] = useState(MAP_STYLE_URL_LIGHT)
  const [mapStyleDark, setMapStyleDark] = useState(MAP_STYLE_URL_DARK)
  const [heading, setHeading] = useState(0)
  const [attributionLinks, setAttributionLinks] = useState<AttributionLink[]>(FALLBACK_ATTRIBUTION_LINKS)
  const [attributionOpen, setAttributionOpen] = useState(false)

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

  useEffect(() => {
    if (!/^https?:/i.test(mapStyle)) {
      setAttributionLinks(FALLBACK_ATTRIBUTION_LINKS)
      return
    }
    const controller = new AbortController()
    fetch(mapStyle, { signal: controller.signal })
      .then((r) => r.json())
      .then((loadedStyle: { sources?: unknown }) => {
        const parsed = parseStyleAttribution(loadedStyle?.sources)
        setAttributionLinks(parsed.length > 0 ? parsed : FALLBACK_ATTRIBUTION_LINKS)
      })
      .catch((err) => {
        if (err?.name === "AbortError") return
        setAttributionLinks(FALLBACK_ATTRIBUTION_LINKS)
      })
    return () => controller.abort()
  }, [mapStyle])

  const hasPadding = cameraPadding !== undefined
  const { top, right, bottom, left } = cameraPadding ?? {}
  useEffect(() => {
    if (!hasPadding) return
    cameraRef.current?.setStop({ padding: { top, right, bottom, left }, duration: 0 })
  }, [hasPadding, top, right, bottom, left])

  const handleRegionDidChange = useCallback(
    (event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const { bearing, userInteraction, bounds } = event.nativeEvent
      setHeading(bearing ?? 0)
      if (onRegionDidChange) {
        onRegionDidChange({ heading: bearing ?? 0, isUserInteraction: userInteraction, bounds })
      }
    },
    [onRegionDidChange]
  )

  const handleCompassPress = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.setStop({
        bearing: 0,
        duration: 300,
        easing: "ease"
      })
    }
  }, [])

  const handlePress = useCallback(
    (event: NativeSyntheticEvent<{ lngLat: [number, number] }>) => {
      if (onPress) {
        const [lon, lat] = event.nativeEvent.lngLat
        onPress({ latitude: lat, longitude: lon })
      }
    },
    [onPress]
  )

  const showCompass = Math.abs(heading) > 3
  const columnEnd = controlsEnd !== undefined && { right: controlsEnd }
  const attributionStyle = [
    mapActionStyles.right,
    controlsBottom !== undefined && { bottom: controlsBottom },
    columnEnd
  ]
  const compassStyle = [
    mapActionStyles.right,
    controlsBottom === undefined
      ? styles.compassPosition
      : { bottom: controlsBottom + 2 * (size.iconColumn + space.lg) },
    columnEnd
  ]

  return (
    <View style={[styles.container, style]}>
      <Map
        ref={mapViewRef}
        style={styles.map}
        mapStyle={mapStyle}
        androidView="texture"
        attribution={false}
        logo={false}
        compass={false}
        onDidFinishLoadingMap={onMapReady}
        onPress={onPress ? handlePress : undefined}
        onRegionDidChange={handleRegionDidChange}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: initialCenter,
            zoom: initialZoom,
            ...(cameraPadding && { padding: cameraPadding })
          }}
        />

        {children}
      </Map>

      {/* Custom compass button */}
      {showCompass && (
        <MapActionButton
          onPress={handleCompassPress}
          style={compassStyle}
          accessibilityRole="button"
          accessibilityLabel="Reset map to north"
        >
          <View style={{ transform: [{ rotate: `${-heading}deg` }] }}>
            <Compass size={size.icon.md} color={colors.textLight} />
          </View>
        </MapActionButton>
      )}

      {attributionLinks.length > 0 && (
        <>
          <MapActionButton
            onPress={() => setAttributionOpen(true)}
            style={attributionStyle}
            accessibilityRole="button"
            accessibilityLabel="Show map attribution"
          >
            <Info size={size.icon.md} color={colors.textLight} />
          </MapActionButton>

          <Modal
            transparent
            statusBarTranslucent
            visible={attributionOpen}
            animationType="fade"
            onRequestClose={() => setAttributionOpen(false)}
          >
            <Pressable
              accessibilityRole="none"
              style={[styles.attributionBackdrop, { backgroundColor: colors.overlay }]}
              onPress={() => setAttributionOpen(false)}
            >
              <Pressable
                accessibilityRole="none"
                onPress={() => {}}
                style={[styles.attributionPopup, { backgroundColor: colors.card }]}
              >
                <Text style={[styles.attributionTitle, { color: colors.text }]}>Map data</Text>
                <View style={styles.attributionLinks}>
                  {attributionLinks.map((link) => (
                    <Pressable
                      key={link.url}
                      accessibilityRole="link"
                      onPress={() => Linking.openURL(link.url)}
                      android_ripple={{ color: colors.link + STATE_LAYER_ALPHA, borderless: true }}
                    >
                      <Text style={[styles.attributionLink, { color: colors.link }]}>{link.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.attributionButtons}>
                  <Button title="Close" variant="ghost" onPress={() => setAttributionOpen(false)} />
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  compassPosition: { bottom: space.xxl + 2 * (size.iconColumn + space.lg) },
  attributionBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: space.xxl
  },
  attributionPopup: {
    width: "100%",
    padding: space.xl,
    borderRadius: radius.lg,
    elevation: elevation.overlay
  },
  attributionTitle: {
    ...type.title,
    marginBottom: space.md
  },
  attributionLinks: {
    gap: space.sm
  },
  attributionLink: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    ...fonts.regular
  },
  attributionButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: space.lg
  }
})
