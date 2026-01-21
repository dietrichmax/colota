/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, {
  useRef,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import {
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  DeviceEventEmitter,
  Platform,
} from "react-native";
import { WebView } from "react-native-webview";
import { LocationCoords } from "../../../types/global";
import { useTheme } from "../../../hooks/useTheme";
import NativeLocationService from "../../../services/NativeLocationService";
import { SvgXml } from "react-native-svg";
import RNFS from "react-native-fs";
import { loadOpenLayersAssets } from "../../../helpers/openlayersLoader"

type Props = {
  coords: LocationCoords | null;
  tracking: boolean;
  isPaused: boolean;
  activeZoneName: string | null;
};

export function DashboardMap({ coords, tracking, activeZoneName }: Props) {
  const webviewRef = useRef<WebView>(null);
  const { colors, mode } = useTheme();
  const isDark = mode === "dark";
  const [olCss, setOlCss] = useState("");
  const [olJs, setOlJs] = useState("");
  const [geofences, setGeofences] = useState<any[]>([]);
  const [isCentered, setIsCentered] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const initialCoords = useRef<LocationCoords | null>(null);
  const [hasInitialCoords, setHasInitialCoords] = useState(false);

  const [currentSilentZone, setCurrentSilentZone] = useState<string | null>(
    null
  );

  const isValidCoords = (c: LocationCoords | null): c is LocationCoords => {
    return c !== null && c.latitude !== 0 && c.longitude !== 0;
  };

  useEffect(() => {
    if (!initialCoords.current && coords) {
      initialCoords.current = coords;
      setHasInitialCoords(true);
    }
  }, [coords]);

  const centerIconXml = `
    <svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 72 72">
      <g transform="translate(0,72) scale(0.1,-0.1)" fill="${colors.text}">
        <path d="M340 622 c0 -25 -5 -29 -47 -40 -64 -18 -137 -91 -155 -155 -11 -42 -15 -47 -40 -47 -21 0 -28 -5 -28 -20 0 -15 7 -20 28 -20 25 0 29 -5 40 -47 18 -64 91 -137 155 -155 42 -11 47 -15 47 -40 0 -21 5 -28 20 -28 15 0 20 7 20 28 0 25 5 29 47 40 64 18 137 91 155 155 11 42 15 47 40 47 21 0 28 5 28 20 0 15 -7 20 -28 20 -25 0 -29 5 -40 47 -18 65 -91 137 -155 154 -42 10 -47 14 -47 40 0 22 -5 29 -20 29 -15 0 -20 -7 -20 -28z m88 -87 c77 -33 115 -90 116 -177 1 -47 -4 -64 -29 -100 -34 -49 -102 -87 -155 -88 -52 0 -120 38 -155 88 -50 72 -38 179 27 239 54 50 130 65 196 38z"/>
      </g>
    </svg>
  `;

  const loadGeofences = useCallback(async () => {
    try {
      const data = await NativeLocationService.getGeofences();
      setGeofences(data);
    } catch (err) {
      console.error("[GeofenceScreen] Failed to load geofences:", err);
    }
  }, []);

  useEffect(() => {
    loadGeofences();
  }, [loadGeofences]);

  // Check for silent zone
  useEffect(() => {
    const checkSilentZone = async () => {
      try {
        const zoneName = await NativeLocationService.checkCurrentSilentZone();
        setCurrentSilentZone(zoneName);
      } catch (err) {
        console.error("[GeofenceScreen] Failed to check silent zone:", err);
      }
    };

    checkSilentZone();
    const listener = DeviceEventEmitter.addListener("geofenceUpdated", () => {
      checkSilentZone();
      loadGeofences(); // Reload geofences when they're updated
    });
    return () => listener.remove();
  }, [loadGeofences]);

  // Update user position
  useEffect(() => {
    if (webviewRef.current && mapReady && coords) {
      webviewRef.current.postMessage(
        JSON.stringify({
          action: "update_user_pos",
          coords,
          tracking,
          isPaused: !!currentSilentZone,
        })
      );
    }
    console.log("Map is ready, sending coords", coords);
  }, [coords, mapReady, tracking, currentSilentZone]);

  /*const onMessage = useCallback(async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === "MAP_READY") setMapReady(true);
      if (data.type === "CENTERED") setIsCentered(data.value);

  }, [loadGeofences]);*/

  // Update geofences
  useEffect(() => {
    if (webviewRef.current && mapReady) {
      webviewRef.current.postMessage(
        JSON.stringify({
          action: "update_geofences",
          geofences,
        })
      );
    }
  }, [geofences, mapReady]);

  const handleCenterMe = useCallback(() => {
    if (coords) {
      webviewRef.current?.postMessage(
        JSON.stringify({ action: "center_map", coords })
      );
    }
  }, [coords]);

  useEffect(() => {
  loadOpenLayersAssets().then(({ css, js }) => {
    setOlCss(css);
    setOlJs(js);
  });
}, []);

  const html = useMemo(() => {
    if (!hasInitialCoords || !initialCoords.current || !olCss || !olJs)
      return "";

    const lon = initialCoords.current.longitude;
    const lat = initialCoords.current.latitude;

    return `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
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
        position: relative;
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
        background: ${
          isDark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.95)"
        } !important;
        border-radius: 6px !important;
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

      ${
        isDark
          ? ".ol-layer canvas { filter: brightness(0.6) contrast(1.2) saturate(0.8); }"
          : ""
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="openlayers/ol.js"></script>
    <script>
      const vectorSource = new ol.source.Vector();

      const map = new ol.Map({
        target: "map",
        layers: [
          new ol.layer.Tile({ source: new ol.source.OSM() }),
          new ol.layer.Vector({ source: vectorSource }),
        ],
        view: new ol.View({
          center: ol.proj.fromLonLat([${lon}, ${lat}]),
          zoom: 17,
        }),
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

      function isMapCentered() {
        const center = map.getView().getCenter();
        const marker = markerOverlay.getPosition();
        if (!center || !marker) return true;
        const dx = center[0] - marker[0];
        const dy = center[1] - marker[1];
        return Math.sqrt(dx * dx + dy * dy) < 20;
      }

      
      function drawGeofences(geofences) {
        vectorSource.clear();
        geofences.forEach(zone => {
          const center = ol.proj.fromLonLat([zone.lon, zone.lat]);
          const circle = new ol.geom.Circle(center, zone.radius);
          const feature = new ol.Feature(circle);

          feature.setStyle(
            new ol.style.Style({
              stroke: new ol.style.Stroke({
                color: zone.pauseTracking ? "${colors.warning}" : "${
      colors.info
    }",
                width: 2,
                lineDash: zone.pauseTracking ? null : [5, 5]
              }),
              fill: new ol.style.Fill({
                color: zone.pauseTracking ? "${colors.warning}4D" : "${
      colors.info
    }1A"
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
                  color: zone.pauseTracking ? "${colors.warning}" : "${
      colors.info
    }"
                }),
                stroke: new ol.style.Stroke({ color: "#fff", width: 3 }),
                offsetY: -25
              }),
            })
          );

          vectorSource.addFeature(feature);
          vectorSource.addFeature(label);
        });
      }

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
          
          animateMarker(newPos, 500);
          map.getView().animate({ center: newPos, duration: 500, easing: ol.easing.linear });
          
          const markerIcon = markerEl.querySelector(".marker");
          const markerPulse = markerEl.querySelector(".marker-pulse");
          
          if (markerIcon && markerPulse) {
            const isActive = data.tracking && !data.isPaused;
            const markerColor = data.isPaused ? "${colors.textDisabled}" : "${
      colors.primary
    }";
            markerIcon.style.background = markerColor;
            markerPulse.style.borderColor = markerColor;
            
            markerPulse.style.display = isActive ? "block" : "none";
          }
        }
        
        if (data.action === "center_map") {
          const pos = ol.proj.fromLonLat([data.coords.longitude, data.coords.latitude]);
          map.getView().animate({ center: pos, zoom: 16, duration: 400 });
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
`;
  }, [olCss, olJs, colors, isDark, hasInitialCoords]);

  if (!tracking) {
    return (
      <View
        style={[
          styles.stateContainer,
          { backgroundColor: colors.card, borderRadius: colors.borderRadius },
        ]}
      >
        <View style={[styles.iconCircle, { backgroundColor: colors.border }]}>
          <SvgXml
            xml={centerIconXml}
            width="52"
            height="52"
            color={colors.primary}
            fill={colors.primary}
          />
        </View>
        <Text style={[styles.stateTitle, { color: colors.text }]}>
          Tracking Disabled
        </Text>
        <Text style={[styles.stateSubtext, { color: colors.textSecondary }]}>
          Start tracking to see your position and zones.
        </Text>
      </View>
    );
  }

  if (!isValidCoords(coords)) {
    return (
      <View
        style={[
          styles.stateContainer,
          { backgroundColor: colors.card, borderRadius: colors.borderRadius },
        ]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          style={[
            styles.stateTitle,
            styles.stateTitleSpaced,
            { color: colors.text },
          ]}
        >
          Searching GPS...
        </Text>
        <Text style={[styles.stateSubtext, { color: colors.textSecondary }]}>
          Waiting for valid location signal.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { borderRadius: colors.borderRadius }]}>
      {html ? (
        <WebView
          ref={webviewRef}
          originWhitelist={["*"]}
          source={{
            html: html,
            baseUrl:
              Platform.OS === "android"
                ? "file:///android_asset/"
                : RNFS.MainBundlePath + "/",
          }}
          style={styles.webview}
          scrollEnabled={false}
          startInLoadingState={false}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);

              if (data.type === "MAP_READY") {
                setMapReady(true);

                // 1. Send Geofences immediately on ready
                if (geofences.length > 0) {
                  webviewRef.current?.postMessage(
                    JSON.stringify({
                      action: "update_geofences",
                      geofences,
                    })
                  );
                }

                // 2. Send current position immediately on ready
                if (coords) {
                  webviewRef.current?.postMessage(
                    JSON.stringify({
                      action: "update_user_pos",
                      coords,
                      tracking,
                      isPaused: !!currentSilentZone,
                    })
                  );
                }
              }

              if (data.type === "CENTERED") {
                setIsCentered(data.value);
              }
            } catch (err) {
              console.error("WebView message error:", err);
            }
          }}
        />
      ) : (
        <View style={[styles.stateContainer, { backgroundColor: colors.card }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            style={[
              styles.stateTitle,
              styles.stateTitleSpaced,
              { color: colors.text },
            ]}
          >
            Loading Map...
          </Text>
        </View>
      )}

      {!isCentered && (
        <TouchableOpacity
          style={[
            styles.centerButton,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          onPress={handleCenterMe}
        >
          <SvgXml xml={centerIconXml} width="28" height="28" />
        </TouchableOpacity>
      )}

      {activeZoneName && (
        <View
          style={[
            styles.topInfoCard,
            {
              backgroundColor: colors.card,
              borderLeftColor: colors.warning,
            },
          ]}
        >
          <Text style={[styles.infoTitle, { color: colors.text }]}>
            Paused in {activeZoneName}
          </Text>
          <Text style={[styles.infoSub, { color: colors.textSecondary }]}>
            Location not being recorded
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%", overflow: "hidden" },
  webview: { flex: 1 },
  stateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  stateTitle: { fontSize: 18, fontWeight: "bold", textAlign: "center" },
  stateTitleSpaced: {
    marginTop: 20,
  },
  stateSubtext: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  centerButton: {
    position: "absolute",
    bottom: 30,
    right: 10,
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    borderWidth: 1,
  },
  topInfoCard: {
    position: "absolute",
    top: 20,
    left: 80,
    right: 20,
    padding: 16,
    borderRadius: 16,
    elevation: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    borderLeftWidth: 5,
    zIndex: 5,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 2,
  },
  infoSub: {
    fontSize: 13,
  },
});
