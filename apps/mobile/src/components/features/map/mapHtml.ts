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

    .ol-popup {
      position: absolute;
      background: ${colors.card};
      border: 1px solid ${colors.border};
      border-radius: ${colors.borderRadius}px;
      padding: 12px 14px;
      min-width: 160px;
      max-width: 220px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      bottom: 14px;
      left: -110px;
      width: 220px;
    }

    .ol-popup:after {
      content: '';
      position: absolute;
      bottom: -8px;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-top: 8px solid ${colors.card};
    }

    .ol-popup-closer {
      position: absolute;
      top: 4px;
      right: 8px;
      font-size: 18px;
      color: ${colors.textSecondary};
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
      line-height: 1;
    }

    .ol-popup-content {
      font-family: -apple-system, sans-serif;
      font-size: 12px;
      color: ${colors.text};
      line-height: 1.6;
    }

    .ol-popup-content .popup-time {
      font-weight: 600;
      font-size: 13px;
      margin-bottom: 4px;
    }

    .ol-popup-content .popup-row {
      display: flex;
      justify-content: space-between;
    }

    .ol-popup-content .popup-label {
      color: ${colors.textSecondary};
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 600;
    }

    .ol-popup-content .popup-value {
      font-weight: 500;
    }

    .speed-legend {
      position: absolute;
      bottom: 10px;
      left: 10px;
      background: ${colors.card};
      border: 1px solid ${colors.border};
      border-radius: ${colors.borderRadius}px;
      padding: 8px 10px;
      font-family: -apple-system, sans-serif;
      font-size: 11px;
      color: ${colors.text};
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      z-index: 100;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .speed-legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .speed-legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .speed-legend-label {
      color: ${colors.textSecondary};
      font-weight: 500;
    }

    ${isDark ? ".ol-layer canvas { filter: brightness(0.6) contrast(1.2) saturate(0.8); }" : ""}
  `
}

/** JS helpers for speed-colored track rendering.
 *  Provides SPEED_COLORS, parseHex, lerpColor, and getSpeedColor. */
export function mapSpeedColorHelpers(colors: ThemeColors): string {
  return `
    var SPEED_COLORS = {
      slow: "${colors.success}",
      medium: "${colors.warning}",
      fast: "${colors.error}"
    };

    function parseHex(hex) {
      hex = hex.replace("#", "");
      return [
        parseInt(hex.substring(0, 2), 16),
        parseInt(hex.substring(2, 4), 16),
        parseInt(hex.substring(4, 6), 16)
      ];
    }

    function lerpColor(c1, c2, t) {
      var a = parseHex(c1), b = parseHex(c2);
      var r = Math.round(a[0] + (b[0] - a[0]) * t);
      var g = Math.round(a[1] + (b[1] - a[1]) * t);
      var bl = Math.round(a[2] + (b[2] - a[2]) * t);
      return "rgb(" + r + "," + g + "," + bl + ")";
    }

    function getSpeedColor(speed) {
      if (speed <= 2) return SPEED_COLORS.slow;
      if (speed >= 8) return SPEED_COLORS.fast;
      if (speed <= 5) {
        var t = (speed - 2) / 3;
        return lerpColor(SPEED_COLORS.slow, SPEED_COLORS.medium, t);
      }
      var t2 = (speed - 5) / 3;
      return lerpColor(SPEED_COLORS.medium, SPEED_COLORS.fast, t2);
    }
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
