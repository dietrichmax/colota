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
import { mapStyles, mapSpeedColorHelpers } from "../map/mapHtml"
import { getSpeedUnit } from "../../../utils/geo"

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
  const isMounted = useRef(true)
  const [mapReady, setMapReady] = useState(false)
  const [isCentered, setIsCentered] = useState(true)

  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, [])

  // Send locations to the map when they change or map becomes ready
  useEffect(() => {
    if (webviewRef.current && mapReady && locations.length > 0) {
      webviewRef.current.postMessage(
        JSON.stringify({
          action: "update_track",
          locations: locations.map((l) => ({
            lon: l.longitude,
            lat: l.latitude,
            speed: l.speed ?? 0,
            timestamp: l.timestamp ?? 0,
            accuracy: l.accuracy ?? 0,
            altitude: l.altitude ?? 0
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
    const { factor: speedFactor, unit: speedUnit } = getSpeedUnit()
    const slowLabel = `&lt; ${Math.round(2 * speedFactor)} ${speedUnit}`
    const midLabel = `${Math.round(2 * speedFactor)}–${Math.round(8 * speedFactor)} ${speedUnit}`
    const fastLabel = `&gt; ${Math.round(8 * speedFactor)} ${speedUnit}`

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
    <div id="popup" class="ol-popup">
      <button id="popup-closer" class="ol-popup-closer">&times;</button>
      <div id="popup-content" class="ol-popup-content"></div>
    </div>
    <div class="speed-legend">
      <div class="speed-legend-item">
        <div class="speed-legend-dot" style="background:${colors.success}"></div>
        <span class="speed-legend-label">${slowLabel}</span>
      </div>
      <div class="speed-legend-item">
        <div class="speed-legend-dot" style="background:${colors.warning}"></div>
        <span class="speed-legend-label">${midLabel}</span>
      </div>
      <div class="speed-legend-item">
        <div class="speed-legend-dot" style="background:${colors.error}"></div>
        <span class="speed-legend-label">${fastLabel}</span>
      </div>
    </div>
    <script src="openlayers/ol.js"></script>
    <script>
      ${mapSpeedColorHelpers(colors)}

      var SPEED_FACTOR = ${speedFactor};
      var SPEED_UNIT = "${speedUnit}";

      var trackSource = new ol.source.Vector();
      var pointSource = new ol.source.Vector();
      var markerSource = new ol.source.Vector();
      var highlightSource = new ol.source.Vector();

      var popupEl = document.getElementById("popup");
      var popupContent = document.getElementById("popup-content");
      var popupCloser = document.getElementById("popup-closer");

      var popupOverlay = new ol.Overlay({
        element: popupEl,
        autoPan: true,
        autoPanAnimation: { duration: 250 }
      });

      var map = new ol.Map({
        target: "map",
        overlays: [popupOverlay],
        layers: [
          new ol.layer.Tile({ source: new ol.source.OSM() }),
          new ol.layer.Vector({ source: trackSource }),
          new ol.layer.Vector({ source: pointSource }),
          new ol.layer.Vector({ source: markerSource }),
          new ol.layer.Vector({ source: highlightSource })
        ],
        view: new ol.View({
          center: ol.proj.fromLonLat([0, 0]),
          zoom: 2
        })
      });

      popupCloser.onclick = function() {
        popupOverlay.setPosition(undefined);
        return false;
      };

      var currentExtent = null;

      function updateTrack(locations) {
        trackSource.clear();
        pointSource.clear();
        markerSource.clear();
        popupOverlay.setPosition(undefined);

        if (!locations || locations.length === 0) return;

        var allCoords = locations.map(function(l) {
          return ol.proj.fromLonLat([l.lon, l.lat]);
        });

        // Speed-colored segments
        for (var i = 1; i < locations.length; i++) {
          var avgSpeed = (locations[i - 1].speed + locations[i].speed) / 2;
          var segCoords = [allCoords[i - 1], allCoords[i]];
          var seg = new ol.Feature(new ol.geom.LineString(segCoords));
          seg.setStyle(new ol.style.Style({
            stroke: new ol.style.Stroke({
              color: getSpeedColor(avgSpeed),
              width: 3
            })
          }));
          trackSource.addFeature(seg);
        }

        // Point markers with stored properties
        for (var j = 0; j < locations.length; j++) {
          var loc = locations[j];
          var pt = new ol.Feature(new ol.geom.Point(allCoords[j]));
          pt.set("_speed", loc.speed);
          pt.set("_timestamp", loc.timestamp);
          pt.set("_accuracy", loc.accuracy);
          pt.set("_altitude", loc.altitude);
          pt.set("_type", "track_point");
          var ptColor = getSpeedColor(loc.speed);
          pt.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
              radius: 4,
              fill: new ol.style.Fill({ color: ptColor + "66" }),
              stroke: new ol.style.Stroke({ color: ptColor, width: 1.5 })
            })
          }));
          pointSource.addFeature(pt);
        }

        // Start marker (green)
        var startFeature = new ol.Feature(new ol.geom.Point(allCoords[0]));
        startFeature.setStyle(new ol.style.Style({
          image: new ol.style.Circle({
            radius: 8,
            fill: new ol.style.Fill({ color: SPEED_COLORS.slow }),
            stroke: new ol.style.Stroke({ color: "#fff", width: 2 })
          })
        }));
        markerSource.addFeature(startFeature);

        // End marker (red)
        if (allCoords.length > 1) {
          var endFeature = new ol.Feature(new ol.geom.Point(allCoords[allCoords.length - 1]));
          endFeature.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
              radius: 8,
              fill: new ol.style.Fill({ color: SPEED_COLORS.fast }),
              stroke: new ol.style.Stroke({ color: "#fff", width: 2 })
            })
          }));
          markerSource.addFeature(endFeature);
        }

        // Fit map to track extent
        var fullLine = new ol.geom.LineString(allCoords);
        currentExtent = fullLine.getExtent();
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

        var pos = ol.proj.fromLonLat([lon, lat]);

        var highlight = new ol.Feature(new ol.geom.Point(pos));
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

      // Popup on point tap
      map.on("singleclick", function(evt) {
        var found = false;
        map.forEachFeatureAtPixel(evt.pixel, function(feature) {
          if (found) return;
          if (feature.get("_type") !== "track_point") return;
          found = true;

          var ts = feature.get("_timestamp");
          var speed = feature.get("_speed");
          var accuracy = feature.get("_accuracy");
          var altitude = feature.get("_altitude");

          var timeStr = ts ? new Date(ts * 1000).toLocaleTimeString() : "—";
          var speedStr = speed != null ? (speed * SPEED_FACTOR).toFixed(1) + " " + SPEED_UNIT : "—";
          var accStr = accuracy != null ? "\\u00B1" + accuracy.toFixed(0) + "m" : "—";
          var altStr = altitude != null ? altitude.toFixed(0) + "m" : "—";

          popupContent.innerHTML =
            '<div class="popup-time">' + timeStr + '</div>' +
            '<div class="popup-row"><span class="popup-label">Speed</span><span class="popup-value">' + speedStr + '</span></div>' +
            '<div class="popup-row"><span class="popup-label">Accuracy</span><span class="popup-value">' + accStr + '</span></div>' +
            '<div class="popup-row"><span class="popup-label">Altitude</span><span class="popup-value">' + altStr + '</span></div>';

          popupOverlay.setPosition(feature.getGeometry().getCoordinates());
        }, { hitTolerance: 10 });

        if (!found) {
          popupOverlay.setPosition(undefined);
        }
      });

      function handleInternalMessage(e) {
        var data;
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

      map.on("moveend", function() {
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
          if (!isMounted.current) return
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
                      lat: l.latitude,
                      speed: l.speed ?? 0,
                      timestamp: l.timestamp ?? 0,
                      accuracy: l.accuracy ?? 0,
                      altitude: l.altitude ?? 0
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
