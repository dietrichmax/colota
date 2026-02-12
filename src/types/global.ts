/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

// ============================================================================
// NAVIGATION & UI
// ============================================================================

export interface ScreenProps {
  navigation: any;
}

export type ThemeMode = "light" | "dark";

export interface ThemeColors {
  // Primary colors
  primary: string;
  primaryDark: string;
  primaryLight: string;

  // Secondary colors
  secondary: string;
  secondaryDark: string;
  secondaryLight: string;

  // Semantic colors
  success: string;
  successDark: string;
  successLight: string;
  warning: string;
  warningDark: string;
  warningLight: string;
  error: string;
  errorDark: string;
  errorLight: string;
  info: string;
  infoDark: string;
  infoLight: string;

  // Surfaces & backgrounds
  background: string;
  backgroundElevated: string;
  card: string;
  cardElevated: string;
  surface: string;

  // Text colors
  text: string;
  textSecondary: string;
  textLight: string;
  textDisabled: string;

  // Borders & dividers
  border: string;
  borderLight: string;
  divider: string;

  // Interactive elements
  placeholder: string;
  link: string;
  linkVisited: string;

  // Utility
  overlay: string;
  shadow: string;
  transparent: string;
  borderRadius: number;
}

// ============================================================================
// LOCATION DATA
// ============================================================================

export interface LocationCoords {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  speed?: number;
  bearing?: number;
  battery?: number;
  battery_status?: number;
  timestamp?: number;
}

export interface Geofence {
  id?: number;
  name: string;
  lat: number;
  lon: number;
  radius: number;
  enabled: boolean;
  pauseTracking: boolean;
  createdAt?: number;
}

/**
 * Result interface for location tracking hook
 */
export interface LocationTrackingResult {
  coords: LocationCoords | null;
  tracking: boolean;
  startTracking: (overrideSettings?: Settings) => Promise<void>;
  stopTracking: () => void;
  restartTracking: (newSettings?: Settings) => Promise<void>;
  reconnect: () => void;
  settings: Settings;
}

// ============================================================================
// API CONFIGURATION
// ============================================================================

export type ServerStatus = "connected" | "error" | "notConfigured";

export interface ServerConnectionProps {
  endpoint: string | null;
  navigation: any;
}

export interface FieldMap {
  lat: string;
  lon: string;
  acc: string;
  alt?: string;
  vel?: string;
  batt?: string;
  bs?: string;
  tst?: string;
  bear?: string;
}

export const DEFAULT_FIELD_MAP: FieldMap = {
  lat: "lat",
  lon: "lon",
  acc: "acc",
  alt: "alt",
  vel: "vel",
  batt: "batt",
  bs: "bs",
  tst: "tst",
  bear: "bear",
} as const;

// ============================================================================
// PRESETS
// ============================================================================

export type BatteryImpact = "Low" | "Medium" | "High";

export interface TrackingPresetConfig {
  interval: number;
  distance: number;
  syncInterval: number;
  retryInterval: number;
  label: string;
  emoji: string;
  description: string;
  batteryImpact: BatteryImpact;
}

export const TRACKING_PRESETS = {
  instant: {
    interval: 5,
    distance: 0,
    syncInterval: 0,
    retryInterval: 30,
    label: "Instant",
    emoji: "⚡",
    description: "Track every 5s • Send instantly",
    batteryImpact: "High",
  },
  balanced: {
    interval: 30,
    distance: 1,
    syncInterval: 300,
    retryInterval: 300,
    label: "Balanced",
    emoji: "⚖️",
    description: "Track every 30s • Batch 5 min",
    batteryImpact: "Medium",
  },
  powersaver: {
    interval: 60,
    distance: 2,
    syncInterval: 900,
    retryInterval: 900,
    label: "Power Saver",
    emoji: "🔋",
    description: "Track every 60s • Batch 15 min",
    batteryImpact: "Low",
  },
} as const satisfies Record<string, TrackingPresetConfig>;

export type SelectablePreset = keyof typeof TRACKING_PRESETS;
export type SyncPreset = SelectablePreset | "custom";

// ============================================================================
// SETTINGS
// ============================================================================

export interface Settings {
  // Tracking (GPS)
  interval: number;
  distance: number;
  filterInaccurateLocations: boolean;
  accuracyThreshold: number;

  // Endpoint & Mapping
  endpoint: string;
  fieldMap: FieldMap;

  // Sync & Upload
  syncInterval: number;
  retryInterval: number;
  maxRetries: number;
  isOfflineMode: boolean;

  // UI State
  syncPreset: SyncPreset;
}

export const DEFAULT_SETTINGS: Settings = {
  interval: TRACKING_PRESETS.instant.interval,
  distance: TRACKING_PRESETS.instant.distance,
  endpoint: "",
  fieldMap: DEFAULT_FIELD_MAP,
  syncInterval: TRACKING_PRESETS.instant.syncInterval,
  retryInterval: TRACKING_PRESETS.instant.retryInterval,
  filterInaccurateLocations: false,
  accuracyThreshold: 50,
  syncPreset: "instant",
  maxRetries: 5,
  isOfflineMode: false,
} as const;

// ============================================================================
// AUTHENTICATION
// ============================================================================

export type AuthType = "none" | "basic" | "bearer";

export interface AuthConfig {
  authType: AuthType;
  username: string;
  password: string;
  bearerToken: string;
  endpoint: string;
  customHeaders: Record<string, string>;
}

export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  authType: "none",
  username: "",
  password: "",
  bearerToken: "",
  endpoint: "",
  customHeaders: {},
};

// ============================================================================
// DATABASE
// ============================================================================

export interface DatabaseStats {
  queued: number;
  sent: number;
  total: number;
  today: number;
  databaseSizeMB: number;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export const isValidCoords = (coords: unknown): coords is LocationCoords => {
  if (typeof coords !== "object" || coords === null) return false;

  const c = coords as Partial<LocationCoords>;
  return (
    typeof c.latitude === "number" &&
    typeof c.longitude === "number" &&
    !isNaN(c.latitude) &&
    !isNaN(c.longitude)
  );
};

export const isValidSettings = (settings: unknown): settings is Settings => {
  if (typeof settings !== "object" || settings === null) return false;

  const s = settings as Partial<Settings>;
  return (
    typeof s.interval === "number" &&
    typeof s.endpoint === "string" &&
    typeof s.syncInterval === "number" &&
    typeof s.syncPreset === "string" &&
    s.interval >= 0 &&
    s.syncInterval >= 0
  );
};

export const isValidFieldMap = (fieldMap: unknown): fieldMap is FieldMap => {
  if (typeof fieldMap !== "object" || fieldMap === null) return false;

  const f = fieldMap as Partial<FieldMap>;
  return (
    typeof f.lat === "string" &&
    typeof f.lon === "string" &&
    typeof f.acc === "string" &&
    f.lat.length > 0 &&
    f.lon.length > 0 &&
    f.acc.length > 0
  );
};
