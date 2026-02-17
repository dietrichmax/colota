/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

// Timing
export const AUTOSAVE_DEBOUNCE_MS = 1500
export const STATS_REFRESH_IDLE = 30_000
export const STATS_REFRESH_FAST = 3_000
export const SERVER_TIMEOUT = 5_000
export const SERVER_CHECK_INTERVAL = 5 * 60 * 1000
export const SAVE_SUCCESS_DISPLAY_MS = 2000

// Map
export const DEFAULT_MAP_ZOOM = 17
export const WORLD_MAP_ZOOM = 2
export const MAX_MAP_ZOOM = 18
export const GEOFENCE_ZOOM_PADDING = [80, 80, 80, 80] as const
export const MARKER_ANIMATION_DURATION_MS = 500
export const MAP_ANIMATION_DURATION_MS = 400
export const MIN_STATS_INTERVAL_MS = 2000

// Thresholds
export const HIGH_QUEUE_THRESHOLD = 50
export const CRITICAL_QUEUE_THRESHOLD = 100

// URLs
export const REPO_URL = "https://github.com/dietrichmax/colota"
export const ISSUES_URL = `${REPO_URL}/issues`
export const PRIVACY_POLICY_URL = "https://colota.app/privacy-policy"
