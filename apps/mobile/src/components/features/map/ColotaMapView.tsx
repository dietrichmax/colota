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
import { useTranslation } from "../../../i18n/useTranslation"
import {
  size,
  space,
  DEFAULT_MAP_ZOOM,
  MAP_STYLE_URL_LIGHT,
  MAP_STYLE_URL_DARK,
  MAP_CONTROL_STEP,
  MAP_OVERLAY_GUTTER,
  MAP_ANIMATION_DURATION_MS
} from "../../../constants"
import { text } from "../../../styles/typography"
import NativeLocationService from "../../../services/NativeLocationService"
import { MapOverlay } from "../../ui/MapOverlay"

const ATTRIBUTION_MAX_WIDTH = 320

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
  /** Which bottom corner holds the compass and attribution, so a caller can own the other one. */
  controlsPlacement?: "start" | "end"
  style?: StyleProp<ViewStyle>
  children?: React.ReactNode
}

export const ColotaMapView = forwardRef<ColotaMapRef, Props>(function ColotaMapView(
  {
    initialCenter,
    initialZoom = DEFAULT_MAP_ZOOM,
    onPress,
    onRegionDidChange,
    onMapReady,
    controlsPlacement = "end",
    style,
    children
  },
  ref
) {
  const cameraRef = useRef<CameraRef>(null)
  const mapViewRef = useRef<MapRef>(null)
  const { colors, mode } = useTheme()
  const { t } = useTranslation()
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
        duration: MAP_ANIMATION_DURATION_MS,
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
  const side = controlsPlacement === "start" ? styles.controlStart : styles.controlEnd
  // The end column leaves its middle slot free for a floating MapCenterButton; the start column has none.
  const compassBottom = MAP_OVERLAY_GUTTER + (controlsPlacement === "end" ? 2 : 1) * MAP_CONTROL_STEP

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
            zoom: initialZoom
          }}
        />

        {children}
      </Map>

      {showCompass && (
        <MapOverlay
          testID="map-compass-btn"
          variant="control"
          onPress={handleCompassPress}
          accessibilityLabel={t("map.compass")}
          style={[styles.control, side, { bottom: compassBottom }]}
        >
          <View style={{ transform: [{ rotate: `${-heading}deg` }] }}>
            <Compass size={size.icon.md} color={colors.text} />
          </View>
        </MapOverlay>
      )}

      {attributionLinks.length > 0 && (
        <>
          <MapOverlay
            testID="map-attribution-btn"
            variant="control"
            onPress={() => setAttributionOpen(true)}
            accessibilityLabel={t("map.attribution")}
            style={[styles.control, side, styles.attributionPosition]}
          >
            <Info size={size.icon.md} color={colors.text} />
          </MapOverlay>

          <Modal
            transparent
            statusBarTranslucent
            visible={attributionOpen}
            animationType="fade"
            onRequestClose={() => setAttributionOpen(false)}
          >
            <Pressable
              style={[styles.attributionBackdrop, { backgroundColor: colors.overlay }]}
              onPress={() => setAttributionOpen(false)}
            >
              <Pressable onPress={() => {}}>
                <MapOverlay style={styles.attributionPopup}>
                  <Pressable
                    onPress={() => setAttributionOpen(false)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t("map.attribution.close")}
                    style={({ pressed }) => [styles.attributionClose, pressed && { opacity: colors.pressedOpacity }]}
                  >
                    <X size={size.icon.md} color={colors.textLight} />
                  </Pressable>
                  {attributionLinks.map((link) => (
                    <Pressable
                      key={link.url}
                      onPress={() => Linking.openURL(link.url)}
                      style={({ pressed }) => pressed && { opacity: colors.pressedOpacity }}
                    >
                      <Text style={[styles.attributionPopupText, { color: colors.link }]}>{link.label}</Text>
                    </Pressable>
                  ))}
                </MapOverlay>
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
  control: { position: "absolute" },
  controlStart: { start: MAP_OVERLAY_GUTTER },
  controlEnd: { end: MAP_OVERLAY_GUTTER },
  attributionPosition: { bottom: MAP_OVERLAY_GUTTER },
  attributionBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xxl
  },
  attributionPopup: {
    maxWidth: ATTRIBUTION_MAX_WIDTH,
    paddingEnd: size.touch,
    paddingVertical: space.md,
    gap: space.sm
  },
  attributionPopupText: {
    ...text.caption
  },
  attributionClose: {
    position: "absolute",
    top: space.xs,
    end: space.xs,
    padding: space.xs
  }
})
