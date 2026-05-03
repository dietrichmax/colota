/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useRef, useImperativeHandle, forwardRef, useState, useEffect, useCallback } from "react"
import { StyleProp, ViewStyle, View, Text, StyleSheet, Linking, Pressable, Modal } from "react-native"
import { Map, Camera } from "@maplibre/maplibre-react-native"
import type { MapRef, CameraRef, ViewStateChangeEvent, LngLatBounds } from "@maplibre/maplibre-react-native"
import type { NativeSyntheticEvent } from "react-native"
import { Compass, Info, X } from "lucide-react-native"
import { useIsFocused } from "@react-navigation/native"
import { useTheme } from "../../../hooks/useTheme"
import { DEFAULT_MAP_ZOOM, MAP_STYLE_URL_LIGHT, MAP_STYLE_URL_DARK } from "../../../constants"
import { fonts } from "../../../styles/typography"
import NativeLocationService from "../../../services/NativeLocationService"

interface AttributionLink {
  url: string
  label: string
}

// Keep in sync with the attribution in maps.mxd.codes/styles/*/style.json.
const FALLBACK_ATTRIBUTION_LINKS: AttributionLink[] = [
  { url: "https://www.openstreetmap.org/copyright", label: "© OpenStreetMap contributors" },
  { url: "https://maps.mxd.codes", label: "© maps.mxd.codes" },
  { url: "https://openmaptiles.org", label: "© OpenMapTiles" },
  { url: "https://github.com/tilezen/joerd/blob/master/docs/attribution.md", label: "Mapzen Terrain Tiles" }
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
  style?: StyleProp<ViewStyle>
  children?: React.ReactNode
}

export const ColotaMapView = forwardRef<ColotaMapRef, Props>(function ColotaMapView(
  { initialCenter, initialZoom = DEFAULT_MAP_ZOOM, onPress, onRegionDidChange, onMapReady, style, children },
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
      .then((style: { sources?: unknown }) => {
        const parsed = parseStyleAttribution(style?.sources)
        setAttributionLinks(parsed.length > 0 ? parsed : FALLBACK_ATTRIBUTION_LINKS)
      })
      .catch((err) => {
        if (err?.name === "AbortError") return
        setAttributionLinks(FALLBACK_ATTRIBUTION_LINKS)
      })
    return () => controller.abort()
  }, [mapStyle])

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

  return (
    <View style={[styles.container, style]}>
      <Map
        ref={mapViewRef}
        style={styles.map}
        mapStyle={mapStyle}
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
            zoom: initialZoom
          }}
        />

        {children}
      </Map>

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
            <Compass size={20} color={colors.textLight} />
          </View>
        </Pressable>
      )}

      {attributionLinks.length > 0 && (
        <>
          <Pressable
            onPress={() => setAttributionOpen(true)}
            hitSlop={8}
            style={({ pressed }) => [
              styles.attributionButton,
              { backgroundColor: colors.card, borderColor: colors.border },
              pressed && { opacity: colors.pressedOpacity }
            ]}
            accessibilityRole="button"
            accessibilityLabel="Show map attribution"
          >
            <Info size={20} color={colors.textLight} />
          </Pressable>

          <Modal
            transparent
            statusBarTranslucent
            visible={attributionOpen}
            animationType="fade"
            onRequestClose={() => setAttributionOpen(false)}
          >
            <Pressable style={styles.attributionBackdrop} onPress={() => setAttributionOpen(false)}>
              <Pressable
                onPress={() => {}}
                style={[styles.attributionPopup, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Pressable
                  onPress={() => setAttributionOpen(false)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  style={({ pressed }) => [styles.attributionClose, pressed && { opacity: colors.pressedOpacity }]}
                >
                  <X size={20} color={colors.textLight} />
                </Pressable>
                {attributionLinks.map((link) => (
                  <Pressable
                    key={link.url}
                    onPress={() => Linking.openURL(link.url)}
                    style={({ pressed }) => pressed && { opacity: colors.pressedOpacity }}
                  >
                    <Text style={[styles.attributionPopupText, { color: colors.link }, fonts.regular]}>
                      {link.label}
                    </Text>
                  </Pressable>
                ))}
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
  compassButton: {
    position: "absolute",
    bottom: 126,
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
  attributionButton: {
    position: "absolute",
    bottom: 30,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    zIndex: 10
  },
  attributionBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32
  },
  attributionPopup: {
    maxWidth: 320,
    width: "100%",
    paddingLeft: 16,
    paddingRight: 36,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6
  },
  attributionPopupText: {
    fontSize: 13
  },
  attributionClose: {
    position: "absolute",
    top: 6,
    right: 6,
    padding: 4
  }
})
