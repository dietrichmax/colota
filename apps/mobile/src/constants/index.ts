/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import type { ProfileConditionType } from "../types/global"
import { Zap, Car, ArrowUp, ArrowDown, Pause } from "lucide-react-native"

// Timing
export const AUTOSAVE_DEBOUNCE_MS = 1500
export const STATS_REFRESH_IDLE = 30_000
export const STATS_REFRESH_FAST = 3_000
export const SERVER_TIMEOUT = 5_000
export const CONNECTION_TEST_TIMEOUT = 10_000
export const SERVER_CHECK_INTERVAL = 5 * 60 * 1000
export const SAVE_SUCCESS_DISPLAY_MS = 2000
export const TEST_RESULT_DISPLAY_MS = 5_000
export const SERVICE_RESTART_DELAY_MS = 500
export const RESTART_DEBOUNCE_MS = 100

// Touch targets
export const HIT_SLOP_SM = { top: 6, right: 6, bottom: 6, left: 6 } as const
export const HIT_SLOP_MD = { top: 8, right: 8, bottom: 8, left: 8 } as const
export const HIT_SLOP_LG = { top: 12, right: 12, bottom: 12, left: 12 } as const

// Map
export const DEFAULT_MAP_ZOOM = 17
export const WORLD_MAP_ZOOM = 2
export const MAX_MAP_ZOOM = 18
export const GEOFENCE_ZOOM_PADDING = [80, 80, 80, 80] as const
export const MAP_ANIMATION_DURATION_MS = 400
export const MIN_STATS_INTERVAL_MS = 2000

// Profiles
export const MS_TO_KMH = 3.6

export const PROFILE_CONDITIONS: {
  type: ProfileConditionType
  label: string
  listLabel: string
  icon: typeof Zap
  description: string
}[] = [
  { type: "charging", label: "Charging", listLabel: "When charging", icon: Zap, description: "Phone is plugged in" },
  {
    type: "android_auto",
    label: "Car Mode",
    listLabel: "Android Auto / Car mode",
    icon: Car,
    description: "Android Auto connected"
  },
  {
    type: "speed_above",
    label: "Speed Above",
    listLabel: "Speed above",
    icon: ArrowUp,
    description: "Moving faster than threshold"
  },
  {
    type: "speed_below",
    label: "Speed Below",
    listLabel: "Speed below",
    icon: ArrowDown,
    description: "Moving slower than threshold"
  },
  {
    type: "stationary",
    label: "Stationary",
    listLabel: "When stationary",
    icon: Pause,
    description: "Not moving for ~60 seconds"
  }
]

// Sync Interval
export const SYNC_INTERVAL_PRESETS: readonly number[] = [0, 60, 300, 900]

export const SYNC_INTERVAL_LABELS: Record<number, string> = {
  0: "Instant",
  60: "1 min",
  300: "5 min",
  900: "15 min"
}

// Thresholds
export const HIGH_QUEUE_THRESHOLD = 50
export const CRITICAL_QUEUE_THRESHOLD = 100

// Map style
export const MAP_STYLE_URL_LIGHT = "https://maps.mxd.codes/styles/bright/style.json"
export const MAP_STYLE_URL_DARK = "https://maps.mxd.codes/styles/dark/style.json"

// URLs
export const REPO_URL = "https://github.com/dietrichmax/colota"
export const ISSUES_URL = `${REPO_URL}/issues`
export const PRIVACY_POLICY_URL = "https://colota.app/privacy-policy"
export const TILE_SERVER_DOCS_URL = "https://colota.app/docs/guides/tile-server"
