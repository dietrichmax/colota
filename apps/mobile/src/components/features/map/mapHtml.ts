/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { ThemeColors } from "../../../types/global"

/** Shared CSS for all OpenLayers WebView maps */
export function mapStyles(colors: ThemeColors, isDark: boolean): string {
  return `
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

    .ol-rotate {
      top: 10px;
      right: 10px;
      left: auto !important;
      background: transparent !important;
      padding: 0 !important;
      z-index: 100 !important;
    }

    .ol-rotate button {
      width: 44px !important;
      height: 44px !important;
      background: ${colors.card} !important;
      color: ${colors.text} !important;
      border-radius: ${colors.borderRadius}px !important;
      margin: 0 !important;
      font-size: 20px !important;
      font-weight: bold !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
      -webkit-tap-highlight-color: transparent !important;
      touch-action: manipulation !important;
    }

    .ol-rotate button:active {
      background: ${colors.primary} !important;
      color: white !important;
      transform: scale(0.92) !important;
    }

    .ol-rotate button:focus {
      outline: none !important;
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

    ${isDark ? ".ol-layer canvas { filter: brightness(0.6) contrast(1.2) saturate(0.8); }" : ""}
  `
}

/** JS helpers for maps with a user-position marker overlay.
 *  Expects `map` and `markerOverlay` to exist in scope. */
export function mapMarkerHelpers(): string {
  return `
    function isMapCentered() {
      var center = map.getView().getCenter();
      var marker = markerOverlay.getPosition();
      if (!center || !marker) return true;
      var dx = center[0] - marker[0];
      var dy = center[1] - marker[1];
      return Math.sqrt(dx * dx + dy * dy) < 20;
    }

    function animateMarker(newPos, duration) {
      duration = duration || 500;
      var startPos = markerOverlay.getPosition();
      if (!startPos) {
        markerOverlay.setPosition(newPos);
        return;
      }
      var startTime = Date.now();
      function step() {
        var elapsed = Date.now() - startTime;
        var progress = Math.min(elapsed / duration, 1);
        var easing = progress * (2 - progress);
        var currentPos = [
          startPos[0] + (newPos[0] - startPos[0]) * easing,
          startPos[1] + (newPos[1] - startPos[1]) * easing
        ];
        markerOverlay.setPosition(currentPos);
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }
  `
}
