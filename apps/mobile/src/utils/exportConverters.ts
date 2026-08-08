/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { type LucideIcon } from "lucide-react-native"
import { FILE_FORMATS, IMPORT_FORMAT_ORDER } from "./fileFormats"

// Trip-aware serialization lives natively in ExportConverters.kt (convertTrips,
// reached via NativeLocationService.exportTripsToFile). This module now only
// holds the UI-facing export-format metadata.

export type ExportFormat = "csv" | "geojson" | "gpx" | "kml"

export const EXPORT_FORMAT_KEYS: ExportFormat[] = IMPORT_FORMAT_ORDER.filter(
  (k) => FILE_FORMATS[k].exportable
) as ExportFormat[]

export interface ExportFormatConfig {
  label: string
  subtitle: string
  description: string
  icon: LucideIcon
  extension: string
  mimeType: string
}

export const EXPORT_FORMATS: Record<ExportFormat, ExportFormatConfig> = EXPORT_FORMAT_KEYS.reduce(
  (acc, key) => {
    const f = FILE_FORMATS[key]
    acc[key] = {
      label: f.label,
      subtitle: f.subtitle!,
      description: f.description,
      icon: f.icon,
      extension: f.extension,
      mimeType: f.mimeType!
    }
    return acc
  },
  {} as Record<ExportFormat, ExportFormatConfig>
)

// Mirrors ExportConverters.renderExportFilename so the settings screen can preview a name without
// a bridge call per keystroke. Native is authoritative; both suites assert the same expectations.

export const FILENAME_MARKER = "colota_export"
export const DEFAULT_FILENAME_TEMPLATE = "colota_export_{date}_{time}"

const MAX_TEMPLATE_LENGTH = 100
const MAX_DEVICE_LENGTH = 32
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|{}]/g

/**
 * The marker lets cleanup tell Colota's files from the user's; {date} and {time} keep each export
 * uniquely named and chronologically sortable.
 */
export function isValidFilenameTemplate(template: string): boolean {
  return (
    template.length <= MAX_TEMPLATE_LENGTH &&
    template.includes(FILENAME_MARKER) &&
    template.includes("{date}") &&
    template.includes("{time}")
  )
}

/** Control characters go by code point so this file stays ASCII. */
function stripIllegal(value: string): string {
  let kept = ""
  for (const char of value) {
    const cp = char.codePointAt(0)!
    if (cp >= 0x20 && cp !== 0x7f) kept += char
  }
  return kept.replace(ILLEGAL_FILENAME_CHARS, "")
}

export const FILENAME_TOKENS = ["date", "time", "device"] as const
export type FilenameToken = (typeof FILENAME_TOKENS)[number]

/**
 * What each placeholder expands to. The settings hint renders these rather than fixed samples, so
 * it cannot drift from the name that actually gets written.
 */
export function filenameTokenValues(deviceModel: string, now: Date = new Date()): Record<FilenameToken, string> {
  // Hand-padded: the native renderer pins Locale.US, so toLocaleDateString would show a name
  // that never gets written on a non-Gregorian or non-Latin-digit locale.
  const pad = (value: number) => String(value).padStart(2, "0")
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}${pad(now.getMinutes())}`,
    device: stripIllegal(deviceModel.replace(/\s+/g, "")).slice(0, MAX_DEVICE_LENGTH)
  }
}

export function renderFilenamePreview(
  template: string,
  format: ExportFormat,
  deviceModel: string,
  now: Date = new Date()
): string {
  const { date, time, device } = filenameTokenValues(deviceModel, now)

  const base = stripIllegal(
    template
      .replace(/\{device\}/g, device)
      .replace(/\{date\}/g, date)
      .replace(/\{time\}/g, time)
  )
    .replace(/^[.\s]+/, "")
    .replace(/[.\s]+$/, "")

  return base + EXPORT_FORMATS[format].extension
}
