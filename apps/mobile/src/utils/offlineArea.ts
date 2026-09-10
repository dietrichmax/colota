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
import { formatBytes } from "./format"
import { formatDateWithYear } from "./geo"

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

export const INTRO_LINE =
  "Frame an area on the map, name it and download it. The size is an estimate from the area alone: dense cities take more, open country less."

export const ROW_HINT = "Shows it on the map"

export function duplicateNameError(name: string, taken: readonly string[]): string | undefined {
  const trimmed = name.trim()
  return trimmed && taken.includes(trimmed) ? `An area named "${trimmed}" already exists.` : undefined
}

export function estimateSentence(estimate: Estimate): string {
  return estimate.large ? `At least ${estimate.label}.` : `${estimate.label} estimated.`
}

/** The line under Download area: why it is disabled, or what pressing it takes. */
export function downloadLine(estimate: Estimate | null, name: string): string {
  if (!estimate) return "Waiting for the map."
  const size = estimate.large ? `${estimateSentence(estimate)} Zoom in to download less.` : estimateSentence(estimate)
  return name.trim() ? size : `${size} Name the area to download it.`
}

export function progressCaption(status: OfflinePackStatus | null): string {
  if (!status) return "Starting…"
  const pct = `${Math.round(status.percentage)}%`
  return status.completedResourceSize > 0 ? `${pct} · ${formatBytes(status.completedResourceSize)} so far` : pct
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
  if (area.isActive) return { icon: Loader, tone: "active", sub: "Downloading…" }
  if (area.sizeBytes === null) return { icon: CircleAlert, tone: "attention", sub: "Could not read this area" }
  if (!area.isComplete) {
    return {
      icon: CircleAlert,
      tone: "attention",
      sub: area.sizeBytes > 0 ? `Incomplete · ${formatBytes(area.sizeBytes)}` : "Incomplete"
    }
  }
  const when = entry?.downloadedAt ? ` · ${formatDateWithYear(Math.floor(entry.downloadedAt / 1000))}` : ""
  const size = `${formatBytes(area.sizeBytes)}${when}`
  const stale = !!entry?.styleUrl && !!currentStyleUrl && entry.styleUrl !== currentStyleUrl
  if (stale) return { icon: TriangleAlert, tone: "attention", sub: `Map style changed · ${size}` }
  return { icon: Map, tone: "plain", sub: size }
}

export interface ConfirmCopy {
  title: string
  message: string
  confirmText: string
}

const CAP_SENTENCE = "The estimate stops counting at 100,000 tiles and the download does not."
const METERED_SENTENCE = "You are on mobile data, not WiFi."

function sizeClause(estimate: Estimate, metered: boolean): string {
  const size = estimate.large ? `${estimateSentence(estimate)} ${CAP_SENTENCE}` : estimateSentence(estimate)
  return metered ? `${size} ${METERED_SENTENCE}` : size
}

export function downloadConfirm(name: string, estimate: Estimate, metered: boolean): ConfirmCopy {
  return { title: `Download "${name}"?`, message: sizeClause(estimate, metered), confirmText: "Download" }
}

export function redownloadConfirm(name: string, estimate: Estimate, metered: boolean): ConfirmCopy {
  return {
    title: `Download "${name}" again?`,
    message: `Replaces its tiles with a fresh download. ${sizeClause(estimate, metered)}`,
    confirmText: "Download again"
  }
}

/** Names the bytes, and the ambient tile cache the last delete takes with it. */
export function deleteAreaConfirm(name: string, sizeBytes: number | null, isLast: boolean): ConfirmCopy {
  const what = sizeBytes
    ? `Removes ${formatBytes(sizeBytes)} of map tiles from this device.`
    : "Removes its map tiles from this device."
  const last = isLast ? " It is the last saved area, so the map's online tile cache is cleared too." : ""
  return { title: `Delete "${name}"?`, message: `${what}${last}`, confirmText: "Delete" }
}

export function storageMessage(estimate: Estimate, availableMB: number): string {
  const needed = estimate.large ? `At least ${estimate.label}` : estimate.label
  return `${needed} is needed and the device has ${availableMB.toFixed(1)} MB free.`
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
