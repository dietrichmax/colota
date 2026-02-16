/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useRef, useEffect, useMemo, useState, useCallback } from "react"
import { View, StyleSheet, Text } from "react-native"
import { WebView } from "react-native-webview"
import { MapPin } from "lucide-react-native"
import { ThemeColors } from "../../../types/global"
import { fonts } from "../../../styles/typography"
import { MapCenterButton } from "../map/MapCenterButton"
import { mapStyles } from "../map/mapHtml"

interface TrackLocation {
  latitude: number
  longitude: number
  timestamp?: number
  accuracy?: number
  speed?: number
  altitude?: number
}

interface Props {
  locations: TrackLocation[]
  selectedPoint: { latitude: number; longitude: number } | null
  colors: ThemeColors
  isDark: boolean
}

export function TrackMap({ locations, selectedPoint, colors, isDark }: Props) {
  const webviewRef = useRef<WebView>(null)
  const [mapReady, setMapReady] = useState(false)
  const [isCentered, setIsCentered] = useState(true)

  // Send locations to the map when they change or map becomes ready
  useEffect(() => {
    if (webviewRef.current && mapReady && locations.length > 0) {
      webviewRef.current.postMessage(
        JSON.stringify({
          action: "update_track",
          locations: locations.map((l) => ({
            lon: l.longitude,
            lat: l.latitude
          }))
        })
      )
    }
  }, [locations, mapReady])

  // Handle zoom to selected point from table tap
  useEffect(() => {
    if (webviewRef.current && mapReady && selectedPoint) {
      webviewRef.current.postMessage(
        JSON.stringify({
          action: "zoom_to_point",
          lon: selectedPoint.longitude,
          lat: selectedPoint.latitude
        })
      )
    }
  }, [selectedPoint, mapReady])

  const handleCenterTrack = useCallback(() => {
    webviewRef.current?.postMessage(JSON.stringify({ action: "fit_track" }))
  }, [])

  const html = useMemo(() => {
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
      const trackSource = new ol.source.Vector();
      const markerSource = new ol.source.Vector();
      const highlightSource = new ol.source.Vector();

      const map = new ol.Map({
        target: "map",
        layers: [
          new ol.layer.Tile({ source: new ol.source.OSM() }),
          new ol.layer.Vector({
            source: trackSource,
            style: new ol.style.Style({
              stroke: new ol.style.Stroke({
                color: "${colors.primary}",
                width: 3
              })
            })
          }),
          new ol.layer.Vector({ source: markerSource }),
          new ol.layer.Vector({ source: highlightSource })
        ],
        view: new ol.View({
          center: ol.proj.fromLonLat([0, 0]),
          zoom: 2
        })
      });

      let currentExtent = null;

      function updateTrack(locations) {
        trackSource.clear();
        markerSource.clear();

        if (!locations || locations.length === 0) return;

        // Build polyline
        const coords = locations.map(l => ol.proj.fromLonLat([l.lon, l.lat]));
        const line = new ol.geom.LineString(coords);
        trackSource.addFeature(new ol.Feature(line));

        // Start marker (green)
        const startFeature = new ol.Feature(new ol.geom.Point(coords[0]));
        startFeature.setStyle(new ol.style.Style({
          image: new ol.style.Circle({
            radius: 8,
            fill: new ol.style.Fill({ color: "#22c55e" }),
            stroke: new ol.style.Stroke({ color: "#fff", width: 2 })
          })
        }));
        markerSource.addFeature(startFeature);

        // End marker (red) — only if more than one point
        if (coords.length > 1) {
          const endFeature = new ol.Feature(new ol.geom.Point(coords[coords.length - 1]));
          endFeature.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
              radius: 8,
              fill: new ol.style.Fill({ color: "#ef4444" }),
              stroke: new ol.style.Stroke({ color: "#fff", width: 2 })
            })
          }));
          markerSource.addFeature(endFeature);
        }

        // Fit map to track extent
        currentExtent = line.getExtent();
        fitTrack();
      }

      function fitTrack() {
        if (currentExtent) {
          map.getView().fit(currentExtent, {
            duration: 400,
            padding: [60, 60, 60, 60],
            maxZoom: 18
          });
        }
      }

      function zoomToPoint(lon, lat) {
        highlightSource.clear();

        const pos = ol.proj.fromLonLat([lon, lat]);

        // Add highlight marker
        const highlight = new ol.Feature(new ol.geom.Point(pos));
        highlight.setStyle(new ol.style.Style({
          image: new ol.style.Circle({
            radius: 12,
            fill: new ol.style.Fill({ color: "${colors.primary}44" }),
            stroke: new ol.style.Stroke({ color: "${colors.primary}", width: 2 })
          })
        }));
        highlightSource.addFeature(highlight);

        map.getView().animate({
          center: pos,
          zoom: 17,
          duration: 500
        });
      }

      function handleInternalMessage(e) {
        let data;
        try {
          data = JSON.parse(e.data);
        } catch(err) {
          return;
        }

        if (data.action === "update_track") {
          updateTrack(data.locations);
        }

        if (data.action === "zoom_to_point") {
          zoomToPoint(data.lon, data.lat);
        }

        if (data.action === "fit_track") {
          fitTrack();
        }
      }

      window.addEventListener("message", handleInternalMessage);
      document.addEventListener("message", handleInternalMessage);

      map.on("moveend", () => {
        var centered = true;
        if (currentExtent) {
          var viewExtent = map.getView().calculateExtent(map.getSize());
          centered = ol.extent.containsExtent(viewExtent, currentExtent);
        }
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "CENTERED", value: centered })
        );
      });

      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "MAP_READY" }));
    </script>
  </body>
</html>
`
  }, [colors, isDark])

  if (locations.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.card, borderRadius: colors.borderRadius }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.border }]}>
          <MapPin size={32} color={colors.textSecondary} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No Locations</Text>
        <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>No tracked locations for this day.</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
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

              // Send track data immediately on ready
              if (locations.length > 0) {
                webviewRef.current?.postMessage(
                  JSON.stringify({
                    action: "update_track",
                    locations: locations.map((l) => ({
                      lon: l.longitude,
                      lat: l.latitude
                    }))
                  })
                )
              }
            }

            if (data.type === "CENTERED") {
              setIsCentered(data.value)
            }
          } catch {
            // Ignore parse errors
          }
        }}
      />

      <MapCenterButton visible={!isCentered} onPress={handleCenterTrack} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden"
  },
  webview: {
    flex: 1
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16
  },
  emptyTitle: {
    fontSize: 18,
    ...fonts.bold,
    textAlign: "center"
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20
  }
})
