/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { formatBytes } from "./format"
import { t } from "../i18n/t"
import type { OfflineAreaInfo } from "../components/features/map/OfflinePackManager"

/** "3 areas · 118.4 MB", or the count alone when no pack reports a readable size. */
export function offlineMapsRowSub(areas: OfflineAreaInfo[]): string {
  if (areas.length === 0) return t("settings.offlineMaps.none")
  const bytes = areas.reduce((sum, area) => sum + (area.sizeBytes ?? 0), 0)
  const count = t("settings.offlineMaps.areas", { count: areas.length, n: areas.length.toLocaleString() })
  return bytes > 0 ? `${count} · ${formatBytes(bytes)}` : count
}

/** "File logging on · 2.4 MB". */
export function loggingRowSub(enabled: boolean, bytes: number): string {
  if (enabled) return t("settings.logging.on", { size: formatBytes(bytes) })
  // Switching off deletes nothing, so a bare "off" would imply the file went with it.
  return bytes > 0 ? t("settings.logging.offKept", { size: formatBytes(bytes) }) : t("settings.logging.off")
}

/** Formatted exactly as the ledger it opens, so the row and the screen cannot disagree. */
export function dataRowSub(total: number, databaseSizeMB: number): string {
  if (total === 0) return t("settings.data.none")
  return t("settings.data.locations", {
    count: total,
    n: total.toLocaleString(),
    size: formatBytes(databaseSizeMB * 1024 * 1024, { decimals: 0 })
  })
}

/** The flavor as `versionLine` and `buildLine` print it. */
export function getVariantLabel(flavor: string): string {
  switch (flavor) {
    case "foss":
      return "FOSS"
    case "gms":
      return "Google Play"
    default:
      return flavor || t("common.unknown")
  }
}

/** "1.16.0 · Google Play": the hub's About row, under the word Version. */
export function versionLine(config: { VERSION_NAME: string; FLAVOR: string } | null): string {
  if (!config) return t("common.unknown")
  return `${config.VERSION_NAME} · ${getVariantLabel(config.FLAVOR)}`
}

/** "1.16.0 (48) · Google Play": a versionName has shipped under two codes, so About prints the code. */
export function buildLine(config: { VERSION_NAME: string; VERSION_CODE: number; FLAVOR: string } | null): string {
  if (!config) return t("common.unknown")
  return `${config.VERSION_NAME} (${config.VERSION_CODE}) · ${getVariantLabel(config.FLAVOR)}`
}
