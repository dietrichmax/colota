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
  return enabled ? `File logging on · ${formatBytes(bytes)}` : "File logging off"
}

/** Formatted exactly as the ledger it opens, so the row and the screen cannot disagree. */
export function dataRowSub(total: number, databaseSizeMB: number): string {
  if (total === 0) return "No locations recorded"
  return `${total.toLocaleString()} locations · ${databaseSizeMB.toFixed(2)} MB`
}

/** The build a user is running, in the words the About screen's Variant row prints. */
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
