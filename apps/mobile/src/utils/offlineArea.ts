/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import type { LucideIcon } from "lucide-react-native"
import { CircleAlert, Loader, Map, TriangleAlert } from "lucide-react-native"
import type {
  OfflineAreaBounds,
  OfflineAreaInfo,
  OfflinePackStatus
} from "../components/features/map/OfflinePackManager"
import { formatBytes, formatDecimal } from "./format"
import { formatDateWithYear } from "./geo"
import { t } from "../i18n/t"

/**
 * What an offline area holds and what a download takes, in the words the screen prints.
 *
 * Every row, caption and dialog is derived here so they cannot drift apart, and nothing reads the
 * bridge or the theme, so a test pins each sentence without rendering the screen.
 */

/** `[west, south, east, north]`, the order the map reports and the pack stores. */
export type Bounds = [number, number, number, number]

export interface Estimate {
  label: string
  bytes: number
  /** The estimator stopped counting at the tile cap, so the label is a floor and not a figure. */
  large: boolean
}

export const rowHint = () => t("offline.rowHint")

export function duplicateNameError(name: string, taken: readonly string[]): string | undefined {
  const trimmed = name.trim()
  return trimmed && taken.includes(trimmed) ? t("offline.duplicate", { name: trimmed }) : undefined
}

export function estimateSentence(estimate: Estimate): string {
  return estimate.large
    ? t("offline.atLeast", { size: estimate.label })
    : t("offline.estimated", { size: estimate.label })
}

/** The line under Download area: why it is disabled, or what pressing it takes. */
export function downloadLine(estimate: Estimate | null, name: string): string {
  if (!estimate) return t("offline.waiting")
  const size = estimate.large ? `${estimateSentence(estimate)} ${t("offline.zoomIn")}` : estimateSentence(estimate)
  return name.trim() ? size : `${size} ${t("offline.nameIt")}`
}

export function progressCaption(status: OfflinePackStatus | null): string {
  if (!status) return t("offline.starting")
  const pct = t("offline.downloadingPct", { pct: Math.round(status.percentage) })
  return status.completedResourceSize > 0
    ? `${pct} · ${t("offline.soFar", { size: formatBytes(status.completedResourceSize) })}`
    : pct
}

export type RowTone = "active" | "attention" | "plain"

export interface AreaRow {
  icon: LucideIcon
  tone: RowTone
  sub: string
}

/**
 * Five states in precedence order. A pack this screen is not attached to but native reports active
 * is another instance's download; a null size is a status read that failed, which is not the same
 * as an interrupted download.
 */
export function describeArea(
  area: OfflineAreaInfo,
  entry: OfflineAreaBounds | undefined,
  currentStyleUrl: string | null
): AreaRow {
  if (area.isActive) return { icon: Loader, tone: "active", sub: t("offline.downloading") }
  if (area.sizeBytes === null) return { icon: CircleAlert, tone: "attention", sub: t("offline.unreadable") }
  if (!area.isComplete) {
    return {
      icon: CircleAlert,
      tone: "attention",
      sub: area.sizeBytes > 0 ? `${t("offline.incomplete")} · ${formatBytes(area.sizeBytes)}` : t("offline.incomplete")
    }
  }
  const when = entry?.downloadedAt ? ` · ${formatDateWithYear(Math.floor(entry.downloadedAt / 1000))}` : ""
  const size = `${formatBytes(area.sizeBytes)}${when}`
  const stale = !!entry?.styleUrl && !!currentStyleUrl && entry.styleUrl !== currentStyleUrl
  if (stale) return { icon: TriangleAlert, tone: "attention", sub: `${t("offline.styleChanged")} · ${size}` }
  return { icon: Map, tone: "plain", sub: size }
}

export interface ConfirmCopy {
  title: string
  message: string
  confirmText: string
}

function sizeClause(estimate: Estimate, metered: boolean): string {
  const size = estimate.large ? `${estimateSentence(estimate)} ${t("offline.cap")}` : estimateSentence(estimate)
  return metered ? `${size} ${t("offline.metered")}` : size
}

export function downloadConfirm(name: string, estimate: Estimate, metered: boolean): ConfirmCopy {
  return {
    title: t("offline.download.title", { name }),
    message: sizeClause(estimate, metered),
    confirmText: t("offline.download.confirm")
  }
}

export function redownloadConfirm(name: string, estimate: Estimate, metered: boolean): ConfirmCopy {
  return {
    title: t("offline.redownload.title", { name }),
    message: `${t("offline.redownload.lead")} ${sizeClause(estimate, metered)}`,
    confirmText: t("offline.redownload.confirm")
  }
}

/** Names the bytes, and the ambient tile cache the last delete takes with it. */
export function deleteAreaConfirm(name: string, sizeBytes: number | null, isLast: boolean): ConfirmCopy {
  const what = sizeBytes ? t("offline.delete.size", { size: formatBytes(sizeBytes) }) : t("offline.delete.noSize")
  const last = isLast ? ` ${t("offline.delete.last")}` : ""
  return { title: t("offline.delete.title", { name }), message: `${what}${last}`, confirmText: t("common.delete") }
}

export function storageMessage(estimate: Estimate, availableMB: number): string {
  const free = formatDecimal(availableMB, 1)
  return estimate.large
    ? t("offline.storage.atLeast", { size: estimate.label, free })
    : t("offline.storage", { size: estimate.label, free })
}

export function cornersOf(bounds: Bounds): { ne: [number, number]; sw: [number, number] } {
  const [west, south, east, north] = bounds
  return { ne: [east, north], sw: [west, south] }
}

export function areaFeature(name: string, bounds: Bounds): GeoJSON.Feature {
  const [west, south, east, north] = bounds
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [west, north],
          [east, north],
          [east, south],
          [west, south],
          [west, north]
        ]
      ]
    },
    properties: { name }
  }
}

export function areasCollection(areas: readonly Pick<OfflineAreaInfo, "name" | "bounds">[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: areas.flatMap((area) => (area.bounds ? [areaFeature(area.name, area.bounds)] : []))
  }
}
