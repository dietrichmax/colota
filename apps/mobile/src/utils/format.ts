/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

/** Formats a byte count as B / KB / MB. */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Clamps `value` to the inclusive range [min, max]. */
export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

/** Zero-pads a non-negative integer to width 2 (e.g. 7 -> "07"). */
export const pad2 = (n: number): string => n.toString().padStart(2, "0")

/** Locale-independent YYYY-MM-DD. Empty epoch -> "Never". */
export const formatExportDate = (epochSeconds: number): string => {
  if (epochSeconds === 0) return "Never"
  const d = new Date(epochSeconds * 1000)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Locale-independent YYYY-MM-DD HH:mm (24h). Empty epoch -> "Never". */
export const formatExportDateTime = (epochSeconds: number): string => {
  if (epochSeconds === 0) return "Never"
  const d = new Date(epochSeconds * 1000)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
