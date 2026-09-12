/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { formatBytes, plural } from "./format"
import type { OfflineAreaInfo } from "../components/features/map/OfflinePackManager"

/**
 * The subs the Settings hub computes, as pure strings. Every one is a stored value, an on-disk
 * fact or the nouns inside the screen it opens, so a unit test pins the wording without rendering
 * the hub and a new file format cannot drift the row that lists them.
 */

/** "3 areas · 118.4 MB", or the count alone when no pack reports a readable size. */
export function offlineMapsRowSub(areas: OfflineAreaInfo[]): string {
  if (areas.length === 0) return "No saved areas"
  const bytes = areas.reduce((sum, area) => sum + (area.sizeBytes ?? 0), 0)
  const count = plural(areas.length, "area")
  return bytes > 0 ? `${count} · ${formatBytes(bytes)}` : count
}

/** "File logging on · 2.4 MB". The size only means something while the log is being written. */
export function loggingRowSub(enabled: boolean, bytes: number): string {
  if (enabled) return `File logging on · ${formatBytes(bytes)}`
  // Switching off stops writing and deletes nothing, so a bare "off" over megabytes of named-zone
  // history implies the data has gone.
  return bytes > 0 ? `File logging off · ${formatBytes(bytes)} kept` : "File logging off"
}

/** Formatted exactly as the ledger it opens, so the row and the screen cannot disagree. */
export function dataRowSub(total: number, databaseSizeMB: number): string {
  if (total === 0) return "No locations recorded"
  return `${total.toLocaleString()} locations · ${databaseSizeMB.toFixed(2)} MB`
}

/** The build a user is running, as `versionLine` and `buildLine` name it after the version. */
export function getVariantLabel(flavor: string): string {
  switch (flavor) {
    case "foss":
      return "FOSS"
    case "gms":
      return "Google Play"
    default:
      return flavor || "Unknown"
  }
}

/** "1.16.0 · Google Play": the hub's About row, under the word Version. */
export function versionLine(config: { VERSION_NAME: string; FLAVOR: string } | null): string {
  if (!config) return "Unknown"
  return `${config.VERSION_NAME} · ${getVariantLabel(config.FLAVOR)}`
}

/**
 * "1.16.0 (48) · Google Play": the About screen's line, the row's with the version code, which the
 * changelog files, Play's crash reports and F-Droid are keyed by; a versionName has shipped under two codes.
 */
export function buildLine(config: { VERSION_NAME: string; VERSION_CODE: number; FLAVOR: string } | null): string {
  if (!config) return "Unknown"
  return `${config.VERSION_NAME} (${config.VERSION_CODE}) · ${getVariantLabel(config.FLAVOR)}`
}
