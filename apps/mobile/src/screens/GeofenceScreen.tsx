/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Switch, DeviceEventEmitter } from "react-native"
import { WebView } from "react-native-webview"
import { useTheme } from "../hooks/useTheme"
import NativeLocationService from "../services/NativeLocationService"
import { showAlert, showConfirm } from "../services/modalService"
import { Geofence, ScreenProps } from "../types/global"
import { useTracking } from "../contexts/TrackingProvider"
import { fonts } from "../styles/typography"
import { X, WifiOff } from "lucide-react-native"
import { Container, SectionTitle, Card } from "../components"
import { useFocusEffect } from "@react-navigation/native"
import { STATS_REFRESH_IDLE } from "../constants"
import { MapCenterButton } from "../components/features/map/MapCenterButton"
import { logger } from "../utils/logger"

export function GeofenceScreen({}: ScreenProps) {
  const { coords, tracking } = useTracking()
  const { colors, mode } = useTheme()
  const isDark = mode === "dark"

  const [geofences, setGeofences] = useState<Geofence[]>([])
  const [newName, setNewName] = useState("")
  const [newRadius, setNewRadius] = useState("50")
  const [placingGeofence, setPlacingGeofence] = useState(false)
  const [isCentered, setIsCentered] = useState(true)
  const [mapReady, setMapReady] = useState(false)
  const [hasInitialCoords, setHasInitialCoords] = useState(false)
  const [currentPauseZone, setCurrentPauseZone] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)

  const webviewRef = useRef<WebView>(null)
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

  // Set initial map center: use live coords, fall back to last known from DB, then default
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

  // Load geofences
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

  // Check for pause zone
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

  const onMessage = useCallback(
    async (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data)

        if (data.type === "MAP_READY") setMapReady(true)
        if (data.type === "CENTERED") setIsCentered(data.value)

        if (data.action === "map_click") {
          try {
            await NativeLocationService.createGeofence({
              name: newName,
              lat: data.latitude,
              lon: data.longitude,
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
        }
      } catch (err) {
        logger.error("[GeofenceScreen] Message error:", err)
      }
    },
    [newName, newRadius, loadGeofences]
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
    webviewRef.current?.postMessage(JSON.stringify({ action: "place_geofence", radius }))
  }, [newName, newRadius])

  const handleCenterMe = useCallback(() => {
    if (coords) {
      webviewRef.current?.postMessage(JSON.stringify({ action: "center_map", coords }))
    }
  }, [coords])

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
    if (!webviewRef.current) return

    webviewRef.current.postMessage(
      JSON.stringify({
        action: "zoom_to_geofence",
        lat: item.lat,
        lon: item.lon,
        radius: item.radius
      })
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

  const html = useMemo(() => {
    if (!hasInitialCoords || !initialCenter.current) return ""

    const lon = initialCenter.current.longitude
    const lat = initialCenter.current.latitude
    const hasRealCoords = lat !== 0 || lon !== 0
    const initialZoom = hasRealCoords ? 17 : 2

    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="openlayers/ol.css">
  <style>
    html, body, #map {
      margin: 0;
      padding: 0;
      height: 100%;
      width: 100%;
      background: ${colors.background};
    }

    .ol-zoom {
      right: auto !important;
      left: 10px;
      top: 10px;
      background: transparent !important;
      padding: 0 !important;
      z-index: 100 !important;
    }

    .ol-zoom button {
      width: 44px !important;
      height: 44px !important;
      background: ${colors.card} !important;
      color: ${colors.text} !important;
      border-radius: ${colors.borderRadius}px !important;
      margin: 8px 0 !important;
      font-size: 20px !important;
      font-weight: bold !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
      -webkit-tap-highlight-color: transparent !important;
      touch-action: manipulation !important;
    }

    .ol-zoom button:active {
      background: ${colors.primary} !important;
      color: white !important;
      transform: scale(0.92) !important;
    }

    .ol-zoom button:focus {
      outline: none !important;
    }

    .marker {
      width: 24px;
      height: 24px;
      background: ${colors.primary};
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      position: relative;
      z-index: 2;
    }

    .marker-pulse {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 20px;
      height: 20px;
      border: 3px solid ${colors.primary};
      border-radius: 50%;
      animation: pulse 2s infinite;
      pointer-events: none;
      z-index: 1;
      transform-origin: center center;
    }

    @keyframes pulse {
      0% {
        transform: translate(-50%, -50%) scale(1);
        opacity: 0.8;
      }
      100% {
        transform: translate(-50%, -50%) scale(4);
        opacity: 0;
      }
    }

    .ol-attribution {
      background: ${isDark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.95)"} !important;
      border-radius: ${colors.borderRadius}px !important;
      padding: 4px 8px !important;
      font-size: 11px !important;
      -webkit-font-smoothing: antialiased !important;
      -moz-osx-font-smoothing: grayscale !important;
    }

    .ol-attribution ul {
      color: ${colors.textSecondary} !important;
      text-shadow: none !important;
    }

    .ol-attribution a {
      color: ${colors.primary} !important;
      text-decoration: none !important;
    }

    ${isDark ? ".ol-layer canvas { filter: brightness(0.6) contrast(1.2) saturate(0.8); }" : ""}
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="openlayers/ol.js"></script>
  <script>
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
        zoom: ${initialZoom},
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
    markerEl.style.display = "none";

    const markerOverlay = new ol.Overlay({
      element: markerEl,
      positioning: "center-center",
      stopEvent: false
    });
    map.addOverlay(markerOverlay);

    function isMapCentered() {
      const center = map.getView().getCenter();
      const marker = markerOverlay.getPosition();
      if (!center || !marker) return true;
      const dx = center[0] - marker[0];
      const dy = center[1] - marker[1];
      return Math.sqrt(dx * dx + dy * dy) < 20;
    }

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

    let placing = false;

    function animateMarker(newPos, duration = 500) {
      const startPos = markerOverlay.getPosition();
      if (!startPos) {
        markerOverlay.setPosition(newPos);
        return;
      }
      const startTime = Date.now();
      function step() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easing = progress * (2 - progress);
        const currentPos = [
          startPos[0] + (newPos[0] - startPos[0]) * easing,
          startPos[1] + (newPos[1] - startPos[1]) * easing
        ];
        markerOverlay.setPosition(currentPos);
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
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

        markerEl.style.display = data.tracking ? "block" : "none";
        if (data.tracking) {
          markerOverlay.setPosition(newPos);
          animateMarker(newPos, 500);
          // Only auto-center if user has not manually moved the map
          if (isMapCentered()) {
            map.getView().animate({
              center: newPos,
              duration: 500,
              easing: ol.easing.linear
            });
          }
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
        map.getView().animate({ center: pos, zoom: 17, duration: 400 });
      }

      if (data.action === "zoom_to_geofence") {
        const center = ol.proj.fromLonLat([data.lon, data.lat]);
        const circle = new ol.geom.Circle(center, data.radius);
        const extent = circle.getExtent();
        map.getView().fit(extent, {
          duration: 600,
          padding: [80, 80, 80, 80],
          maxZoom: 18
        });
      }
      
      if (data.action === "place_geofence") {
        placing = true;
      }
      
      if (data.action === "update_geofences") {
        drawGeofences(data.geofences);
      }
    }

    window.addEventListener("message", handleInternalMessage);
    document.addEventListener("message", handleInternalMessage);

    map.on("singleclick", e => {
      if (!placing) return;
      placing = false;
      const ll = ol.proj.toLonLat(e.coordinate);
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ action: "map_click", latitude: ll[1], longitude: ll[0] })
      );
    });

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

  const renderItem = useCallback(
    ({ item }: { item: Geofence }) => (
      <Card style={styles.card}>
        <View style={styles.row}>
          <TouchableOpacity style={styles.info} onPress={() => handleZoomToGeofence(item)} activeOpacity={0.7}>
            <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
            <Text style={[styles.radius, { color: colors.textSecondary }]}>{item.radius}m radius</Text>
          </TouchableOpacity>

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

            <TouchableOpacity
              onPress={() => handleDelete(item)}
              style={[styles.deleteBtn, { backgroundColor: colors.error + "15" }]}
              activeOpacity={0.7}
            >
              <X size={16} color={colors.error} />
            </TouchableOpacity>
          </View>
        </View>
      </Card>
    ),
    [colors, handleDelete, togglePause, handleZoomToGeofence]
  )

  return (
    <Container>
      <View style={[styles.map, { borderRadius: colors.borderRadius }]}>
        <WebView
          ref={webviewRef}
          originWhitelist={["*"]}
          source={{
            html: html,
            baseUrl: "file:///android_asset/"
          }}
          style={styles.webview}
          scrollEnabled={false}
          onMessage={onMessage}
        />

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

                <TouchableOpacity
                  style={[styles.placeBtn, { backgroundColor: colors.primary }]}
                  onPress={startPlacingGeofence}
                  disabled={placingGeofence}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.placeBtnText, { color: colors.textOnPrimary }]}>
                    {placingGeofence ? "Tap Map to Place..." : "Place Geofence"}
                  </Text>
                </TouchableOpacity>
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
                Create a geofence to pause tracking in specific areas
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
  webview: { flex: 1 },
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
    left: 66,
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
