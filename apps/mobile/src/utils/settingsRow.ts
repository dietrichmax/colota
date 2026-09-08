/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { FILE_FORMATS, IMPORT_FORMAT_ORDER } from "./fileFormats"
import { formatBytes } from "./format"
import type { OfflineAreaInfo } from "../components/features/map/OfflinePackManager"

/**
 * The subs the Settings hub computes, as pure strings. Every one is a stored value, an on-disk
 * fact or the nouns inside the screen it opens, so a unit test pins the wording without rendering
 * the hub and a new file format cannot drift the row that lists them.
 */

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`

/** "3 areas · 118.4 MB", or the count alone when no pack reports a readable size. */
export function offlineMapsRowSub(areas: OfflineAreaInfo[]): string {
  if (areas.length === 0) return "No saved areas"
  const bytes = areas.reduce((sum, area) => sum + (area.sizeBytes ?? 0), 0)
  const count = plural(areas.length, "area")
  return bytes > 0 ? `${count} · ${formatBytes(bytes)}` : count
}

type AutoExportStatus = { enabled: boolean; interval: string; format: string; lastError: string | null }

/** "Weekly · GeoJSON", plus the failure clause while the last run left an error. */
export function autoExportRowSub(status: AutoExportStatus | null): string {
  if (!status?.enabled) return "Off"
  const interval = status.interval.charAt(0).toUpperCase() + status.interval.slice(1)
  const format = FILE_FORMATS[status.format as keyof typeof FILE_FORMATS]?.label ?? status.format.toUpperCase()
  return `${interval} · ${format}${status.lastError ? " · last export failed" : ""}`
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

/** The formats the Import screen offers, in its own order; the legacy Timeline parser folds into its sibling. */
export function importFormatsSub(): string {
  const labels = IMPORT_FORMAT_ORDER.map((format) => FILE_FORMATS[format].label.replace(" (legacy)", ""))
  return [...new Set(labels)].join(", ")
}

/** The formats the Export screen offers, from the same table. */
export function exportFormatsSub(): string {
  return IMPORT_FORMAT_ORDER.filter((format) => FILE_FORMATS[format].exportable)
    .map((format) => FILE_FORMATS[format].label)
    .join(", ")
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
