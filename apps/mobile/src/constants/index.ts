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
export const SAVE_SUCCESS_DISPLAY_MS = 2000
export const TEST_RESULT_DISPLAY_MS = 5_000
export const SERVICE_RESTART_DELAY_MS = 500
export const RESTART_DEBOUNCE_MS = 100
export const SETTINGS_READ_ATTEMPTS = 3
export const SETTINGS_READ_RETRY_DELAY_MS = 150

// Spacing scale. Every padding, margin and gap reads from here; designSystemGuard fails a literal.
// The grid is 4dp from xs up. xxs is the one sub-grid step and has one job: the gap between a
// label and its own caption, which is type pairing rather than layout.
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const

// Sizes are not spacing: these are the painted or touchable extents of a control.
export const size = {
  touch: 48,
  row: 56,
  chip: 32,
  iconButton: 32,
  iconColumn: 40,
  numericField: 88,
  /** The disc behind an empty screen's glyph. */
  emptyIcon: 64,
  icon: { sm: 16, md: 20, lg: 24 }
} as const

/**
 * Material's pressed state layer: 10 percent of the element's own content colour, concatenated
 * onto a hex token. Android draws it as a ripple from the touch point, which an opacity fade
 * of the whole element is not.
 */
export const STATE_LAYER_ALPHA = "1A"

export const HIT_SLOP_SM = { top: 6, right: 6, bottom: 6, left: 6 } as const
export const HIT_SLOP_MD = { top: 8, right: 8, bottom: 8, left: 8 } as const
export const HIT_SLOP_LG = { top: 12, right: 12, bottom: 12, left: 12 } as const

// Map
/**
 * Material's elevation levels, named for the job rather than the number: 0, 1, 3 and 6 are levels
 * 0 to 3. The app had 0, 1, 4, 5, 6 and 8, and 4 and 5 are not levels at all.
 */
export const elevation = {
  /** Sits on the ground: the tab bar. */
  flat: 0,
  /** An elevated card, lifted off the ground but not over anything. */
  raised: 1,
  /** A control or badge floating over content, usually the map. */
  floating: 3,
  /** A dialog, a popup or a toast, over everything. */
  overlay: 6
} as const

export const DEFAULT_MAP_ZOOM = 15
export const WORLD_MAP_ZOOM = 2
export const MAX_MAP_ZOOM = 18
export const GEOFENCE_ZOOM_PADDING = [80, 80, 80, 80] as const
export const MAP_ANIMATION_DURATION_MS = 400
export const MIN_STATS_INTERVAL_MS = 2000

// Profiles
export const MS_TO_KMH = 3.6

// Doze batches motion sensors past this; longer Stationary intervals risk missed trip starts.
export const STATIONARY_MAX_INTERVAL_SECONDS = 60

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

// Per-condition default switch delays (seconds). Stationary enters via a stillness window
// (activation) and exits instantly via the hardware motion sensor (deactivation 0); every
// other condition is the inverse. Single source of truth for both the editor and import.
export function defaultProfileDelays(conditionType: ProfileConditionType): {
  activationDelay: number
  deactivationDelay: number
} {
  return conditionType === "stationary"
    ? { activationDelay: 60, deactivationDelay: 0 }
    : { activationDelay: 0, deactivationDelay: 60 }
}

// Sync Interval
export const SYNC_INTERVAL_PRESETS: readonly number[] = [0, 60, 300, 900]

export const SYNC_INTERVAL_LABELS: Record<number, string> = {
  0: "Instant",
  60: "1 min",
  300: "5 min",
  900: "15 min"
}

// Overland batch envelope (Dawarich + batch mode, Overland template)
export const OVERLAND_BATCH_MIN = 1
export const OVERLAND_BATCH_MAX = 500

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
export const RELEASES_URL = "https://colota.app/releases"
export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright"
/** market:// opens the Play app straight on the listing; the https form is the fallback. */
export const PLAY_STORE_MARKET_URL = "market://details?id=com.Colota"
export const PLAY_STORE_WEB_URL = "https://play.google.com/store/apps/details?id=com.Colota"
