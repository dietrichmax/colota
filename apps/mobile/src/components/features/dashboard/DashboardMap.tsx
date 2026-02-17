/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useRef, useEffect, useMemo, useState, useCallback } from "react"
import { View, StyleSheet, Text, ActivityIndicator, DeviceEventEmitter, Image } from "react-native"
import { WebView } from "react-native-webview"
import { LocationCoords } from "../../../types/global"
import { useTheme } from "../../../hooks/useTheme"
import { fonts } from "../../../styles/typography"
import { WifiOff } from "lucide-react-native"
import NativeLocationService from "../../../services/NativeLocationService"
import { useFocusEffect } from "@react-navigation/native"
import {
  STATS_REFRESH_IDLE,
  DEFAULT_MAP_ZOOM,
  MAX_MAP_ZOOM,
  GEOFENCE_ZOOM_PADDING,
  MARKER_ANIMATION_DURATION_MS,
  MAP_ANIMATION_DURATION_MS
} from "../../../constants"
import { MapCenterButton } from "../map/MapCenterButton"
import { mapStyles, mapMarkerHelpers } from "../map/mapHtml"
import icon from "../../../assets/icons/icon.png"
import { logger } from "../../../utils/logger"

type Props = {
  coords: LocationCoords | null
  tracking: boolean
  activeZoneName: string | null
}

export function DashboardMap({ coords, tracking, activeZoneName }: Props) {
  const webviewRef = useRef<WebView>(null)
  const { colors, mode } = useTheme()
  const isDark = mode === "dark"
  const [geofences, setGeofences] = useState<any[]>([])
  const [isCentered, setIsCentered] = useState(true)
  const [mapReady, setMapReady] = useState(false)
  const initialCoords = useRef<LocationCoords | null>(null)
  const [hasInitialCoords, setHasInitialCoords] = useState(false)

  const [currentPauseZone, setCurrentPauseZone] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)

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

  const isValidCoords = (c: LocationCoords | null): c is LocationCoords => {
    return c !== null && c.latitude !== 0 && c.longitude !== 0
  }

  useEffect(() => {
    if (!initialCoords.current && coords) {
      initialCoords.current = coords
      setHasInitialCoords(true)
    }
  }, [coords])

  const loadGeofences = useCallback(async () => {
    try {
      const data = await NativeLocationService.getGeofences()
      setGeofences(data)
    } catch (err) {
      logger.error("[DashboardMap] Failed to load geofences:", err)
    }
  }, [])

  useEffect(() => {
    loadGeofences()
  }, [loadGeofences])

  // Check for pause zone
  useEffect(() => {
    const checkPauseZone = async () => {
      try {
        const zoneName = await NativeLocationService.checkCurrentPauseZone()
        setCurrentPauseZone(zoneName)
      } catch (err) {
        logger.error("[DashboardMap] Failed to check pause zone:", err)
      }
    }

    checkPauseZone()
    const listener = DeviceEventEmitter.addListener("geofenceUpdated", () => {
      checkPauseZone()
      loadGeofences() // Reload geofences when they're updated
    })
    return () => listener.remove()
  }, [loadGeofences])

  // Update user position
  useEffect(() => {
    if (webviewRef.current && mapReady && coords) {
      webviewRef.current.postMessage(
        JSON.stringify({
          action: "update_user_pos",
          coords,
          tracking,
          isPaused: !!currentPauseZone
        })
      )
    }
  }, [coords, mapReady, tracking, currentPauseZone])

  // Update geofences
  useEffect(() => {
    if (webviewRef.current && mapReady) {
      webviewRef.current.postMessage(
        JSON.stringify({
          action: "update_geofences",
          geofences
        })
      )
    }
  }, [geofences, mapReady])

  const handleCenterMe = useCallback(() => {
    if (coords) {
      webviewRef.current?.postMessage(JSON.stringify({ action: "center_map", coords }))
    }
  }, [coords])
  const html = useMemo(() => {
    if (!hasInitialCoords || !initialCoords.current) return ""

    const lon = initialCoords.current.longitude
    const lat = initialCoords.current.latitude

    return `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">

    <link rel="stylesheet" href="openlayers/ol.css">
    <style>${mapStyles(colors, isDark)}</style>
  </head>
  <body>
    <div id="map"></div>
    <script src="openlayers/ol.js"></script>
    <script>
      ${mapMarkerHelpers()}

      const geofenceSource = new ol.source.Vector();
      const accuracySource = new ol.source.Vector();

      const map = new ol.Map({
        target: "map",
        layers: [
          new ol.layer.Tile({ source: new ol.source.OSM() }),
          new ol.layer.Vector({ source: geofenceSource }),
          new ol.layer.Vector({ source: accuracySource }),
        ],
        view: new ol.View({
          center: ol.proj.fromLonLat([${lon}, ${lat}]),
          zoom: ${DEFAULT_MAP_ZOOM},
        }),
      });

      let accuracyFeature = null;

      const accuracyStyle = new ol.style.Style({
        fill: new ol.style.Fill({
          color: "${colors.primary}22"
        })
      });

      const markerEl = document.createElement("div");
      markerEl.innerHTML = \`
        <div class="marker-pulse" style="display:none"></div>
        <div class="marker"></div>
      \`;

      const markerOverlay = new ol.Overlay({
        element: markerEl,
        positioning: "center-center",
        stopEvent: false
      });

      map.addOverlay(markerOverlay);
      markerOverlay.setPosition(ol.proj.fromLonLat([${lon}, ${lat}]))

      function drawGeofences(geofences) {
        geofenceSource.clear();
        geofences.forEach(zone => {
          const center = ol.proj.fromLonLat([zone.lon, zone.lat]);
          const circle = new ol.geom.Circle(center, zone.radius);
          const feature = new ol.Feature(circle);

          feature.setStyle(
            new ol.style.Style({
              stroke: new ol.style.Stroke({
                color: zone.pauseTracking ? "${colors.warning}" : "${colors.info}",
                width: 2,
                lineDash: zone.pauseTracking ? null : [5, 5]
              }),
              fill: new ol.style.Fill({
                color: zone.pauseTracking ? "${colors.warning}4D" : "${colors.info}1A"
              }),
            })
          );

          const label = new ol.Feature(new ol.geom.Point(center));
          label.setStyle(
            new ol.style.Style({
              text: new ol.style.Text({
                text: zone.name,
                font: "bold 12px sans-serif",
                fill: new ol.style.Fill({
                  color: zone.pauseTracking ? "${colors.warning}" : "${colors.info}"
                }),
                stroke: new ol.style.Stroke({ color: "#fff", width: 3 }),
                offsetY: -25
              }),
            })
          );

          geofenceSource.addFeature(feature);
          geofenceSource.addFeature(label);
        });
      }

      function handleInternalMessage(e) {
        let data;
        try {
          data = JSON.parse(e.data);
        } catch(err) {
          return;
        }

        if (data.action === "update_user_pos") {
          const newPos = ol.proj.fromLonLat([data.coords.longitude, data.coords.latitude]);
          
          animateMarker(newPos, ${MARKER_ANIMATION_DURATION_MS});

          // Only auto-center if user has not manually moved the map
          if (isMapCentered()) {
            map.getView().animate({
              center: newPos,
              duration: ${MARKER_ANIMATION_DURATION_MS},
              easing: ol.easing.linear
            });
          }
          
          const markerIcon = markerEl.querySelector(".marker");
          const markerPulse = markerEl.querySelector(".marker-pulse");
          
          if (markerIcon && markerPulse) {
            const isActive = data.tracking && !data.isPaused;
            const markerColor = data.isPaused ? "${colors.textDisabled}" : "${colors.primary}";
            markerIcon.style.background = markerColor;
            markerPulse.style.borderColor = markerColor;
            
            markerPulse.style.display = isActive ? "block" : "none";
          }
            
          if (data.coords.accuracy && data.coords.accuracy > 0) {
            if (!accuracyFeature) {
              accuracyFeature = new ol.Feature();
              accuracyFeature.setStyle(accuracyStyle);
              accuracySource.addFeature(accuracyFeature);
            }

            const circle = new ol.geom.Circle(newPos, data.coords.accuracy);
            accuracyFeature.setGeometry(circle);
          }
        }
        
        if (data.action === "center_map") {
          const pos = ol.proj.fromLonLat([data.coords.longitude, data.coords.latitude]);
          map.getView().animate({ center: pos, zoom: ${DEFAULT_MAP_ZOOM}, duration: ${MAP_ANIMATION_DURATION_MS} });
        }

        if (data.action === "zoom_to_geofence") {
          const center = ol.proj.fromLonLat([data.lon, data.lat]);
          const circle = new ol.geom.Circle(center, data.radius);
          const extent = circle.getExtent();
          map.getView().fit(extent, {
            duration: 600,
            padding: [${GEOFENCE_ZOOM_PADDING}],
            maxZoom: ${MAX_MAP_ZOOM}
          });
        }
        
        if (data.action === "update_geofences") {
          drawGeofences(data.geofences);
        }
      }

      window.addEventListener("message", handleInternalMessage);
      document.addEventListener("message", handleInternalMessage)

      
      map.on("moveend", () => {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "CENTERED", value: isMapCentered() })
        );
      });

      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "MAP_READY" }));
    </script>
  </body>
</html>
`
  }, [colors, isDark, hasInitialCoords])

  if (!tracking) {
    return (
      <View style={[styles.stateContainer, { backgroundColor: colors.card, borderRadius: colors.borderRadius }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.border }]}>
          <Image source={icon} style={styles.icon} />
        </View>
        <Text style={[styles.stateTitle, { color: colors.text }]}>Tracking Disabled</Text>
        <Text style={[styles.stateSubtext, { color: colors.textSecondary }]}>Start tracking to see the map.</Text>
      </View>
    )
  }

  if (!isValidCoords(coords)) {
    return (
      <View style={[styles.stateContainer, { backgroundColor: colors.card, borderRadius: colors.borderRadius }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.stateTitle, styles.stateTitleSpaced, { color: colors.text }]}>Searching GPS...</Text>
        <Text style={[styles.stateSubtext, { color: colors.textSecondary }]}>Waiting for GPS signal.</Text>
      </View>
    )
  }

  return (
    <View style={[styles.container, { borderRadius: colors.borderRadius }]}>
      {html ? (
        <WebView
          ref={webviewRef}
          originWhitelist={["*"]}
          source={{
            html: html,
            baseUrl: "file:///android_asset/"
          }}
          style={styles.webview}
          scrollEnabled={false}
          startInLoadingState={false}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data)

              if (data.type === "MAP_READY") {
                setMapReady(true)

                // 1. Send Geofences immediately on ready
                if (geofences.length > 0) {
                  webviewRef.current?.postMessage(
                    JSON.stringify({
                      action: "update_geofences",
                      geofences
                    })
                  )
                }

                // 2. Send current position immediately on ready
                if (coords) {
                  webviewRef.current?.postMessage(
                    JSON.stringify({
                      action: "update_user_pos",
                      coords,
                      tracking,
                      isPaused: !!currentPauseZone
                    })
                  )
                }
              }

              if (data.type === "CENTERED") {
                setIsCentered(data.value)
              }
            } catch (err) {
              logger.error("WebView message error:", err)
            }
          }}
        />
      ) : (
        <View style={[styles.stateContainer, { backgroundColor: colors.card }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.stateTitle, styles.stateTitleSpaced, { color: colors.text }]}>Loading Map...</Text>
        </View>
      )}

      <MapCenterButton visible={!isCentered} onPress={handleCenterMe} />

      {isOffline && (
        <View style={[styles.offlineBanner, { backgroundColor: colors.card }]}>
          <WifiOff size={14} color={colors.textSecondary} />
          <Text style={[styles.offlineText, { color: colors.textSecondary }]}>Map tiles unavailable — no internet</Text>
        </View>
      )}

      {activeZoneName && (
        <View
          style={[
            styles.topInfoCard,
            {
              backgroundColor: colors.card,
              borderLeftColor: colors.warning
            }
          ]}
        >
          <Text style={[styles.infoTitle, { color: colors.text }]}>Paused in {activeZoneName}</Text>
          <Text style={[styles.infoSub, { color: colors.textSecondary }]}>Location not being recorded</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%", overflow: "hidden" },
  webview: { flex: 1 },
  stateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24
  },
  icon: { width: 64, height: 64 },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16
  },
  stateTitle: { fontSize: 18, ...fonts.bold, textAlign: "center" },
  stateTitleSpaced: { marginTop: 20 },
  stateSubtext: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20
  },
  topInfoCard: {
    position: "absolute",
    top: 20,
    left: 80,
    right: 20,
    padding: 16,
    borderRadius: 16,
    elevation: 8,
    shadowOpacity: 0.2,
    borderLeftWidth: 5,
    zIndex: 5
  },
  infoTitle: { fontSize: 16, ...fonts.bold, marginBottom: 2 },
  infoSub: { fontSize: 13 },
  offlineBanner: {
    position: "absolute",
    bottom: 90,
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
