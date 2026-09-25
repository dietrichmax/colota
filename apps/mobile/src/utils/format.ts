/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { t } from "../i18n/t"

/** A fixed number of decimals in the device locale's separator, ungrouped. */
export const formatDecimal = (n: number, decimals: number, locale?: string): string =>
  n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false })

/** B, KB, MB or GB in the device locale's decimal separator, ungrouped, with one decimal unless `decimals` says otherwise. */
export const formatBytes = (
  bytes: number,
  { decimals = 1, locale }: { decimals?: number; locale?: string } = {}
): string => {
  const scaled = (n: number) => formatDecimal(n, decimals, locale)
  if (bytes < 1024) return `${Math.round(bytes)} ${t("unit.B")}`
  if (bytes < 1024 ** 2) return `${scaled(bytes / 1024)} ${t("unit.KB")}`
  if (bytes < 1024 ** 3) return `${scaled(bytes / 1024 ** 2)} ${t("unit.MB")}`
  return `${scaled(bytes / 1024 ** 3)} ${t("unit.GB")}`
}

/**
 * Formats a point count for the fixed-width stat columns, which fit about six glyphs
 * at their 24px value size. Abbreviates above that (123456 -> "123K", 2000000 -> "2.0M").
 */
export const formatCount = (count: number): string => {
  if (count < 100_000) return count.toLocaleString()
  if (count < 1_000_000) return `${Math.floor(count / 1_000)}${t("unit.thousand")}`
  return `${formatDecimal(count / 1_000_000, 1)}${t("unit.million")}`
}

/** Clamps `value` to the inclusive range [min, max]. */
export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

/** Zero-pads a non-negative integer to width 2 (e.g. 7 -> "07"). */
export const pad2 = (n: number): string => n.toString().padStart(2, "0")

/** Locale-independent YYYY-MM-DD HH:mm (24h). Empty epoch -> "Never". */
export const formatExportDateTime = (epochSeconds: number): string => {
  if (epochSeconds === 0) return t("common.never")
  const d = new Date(epochSeconds * 1000)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
