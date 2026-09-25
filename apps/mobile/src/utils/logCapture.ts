/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import type { LucideIcon } from "lucide-react-native"
import { FileClock, FileText, FileX } from "lucide-react-native"
import type { LogLevel } from "./logger"
import type { MergedLogEntry } from "./logExport"
import { formatBytes } from "./format"
import { formatTimeIn } from "./geo"
import { t } from "../i18n/t"

/**
 * What a log capture is worth handing over, in the words the screen prints.
 *
 * The screen has one product, a file a maintainer can read, so every line here is worded against
 * that: what is being recorded, what leaves the device with it, and what a preview of it can and
 * cannot show. Nothing here reads the bridge or the theme, so the strings are testable without
 * rendering, which is the `dataScope.ts` and `backupState.ts` contract.
 */

export type LogFloor = "all" | "info" | "warn" | "error"

export const DEFAULT_LOG_FLOOR: LogFloor = "all"

/**
 * Names the contents rather than promising an absence. No log call in either tree writes a
 * latitude or longitude, but `NetworkManager` logs a rejected upload's response body, so a server
 * that echoes the payload it refused puts coordinates in the file through the back door. An
 * absolute "holds no coordinates" would be false exactly when it mattered.
 */
export const logContentsLine = () => t("log.contents")

export const captureHint = () => t("log.captureHint")

export interface CaptureState {
  icon: LucideIcon
  tone: "recording" | "idle"
  label: string
  caption: string
}

/**
 * Five states, because "off" over 8 MB of named-zone history is a different situation from "off"
 * over nothing, and a reporter who has just armed it needs to see that it took.
 */
export function describeCapture(enabled: boolean, bytes: number, startedAtMs: number): CaptureState {
  if (enabled) {
    if (bytes === 0) {
      return { icon: FileClock, tone: "recording", label: t("log.recording"), caption: t("log.nothingWritten") }
    }
    const size = formatBytes(bytes)
    const caption =
      startedAtMs > 0
        ? t("log.since", { size, time: formatTimeIn(Math.floor(startedAtMs / 1000), "24h", false) })
        : t("log.written", { size })
    return { icon: FileClock, tone: "recording", label: t("log.recording"), caption }
  }
  if (bytes > 0) {
    return {
      icon: FileText,
      tone: "idle",
      label: t("log.notRecording"),
      caption: t("log.kept", { size: formatBytes(bytes) })
    }
  }
  return { icon: FileX, tone: "idle", label: t("log.notRecording"), caption: t("log.noFile") }
}

/**
 * The reader shows the log file while recording is on and the system log otherwise, which the
 * bridge decides and nothing has ever said out loud.
 */
export function previewRowSub(enabled: boolean): string {
  return enabled ? t("log.preview.file") : t("log.preview.system")
}

/** The step that is missing from every bug report: leave it on while you reproduce the problem. */
export function nextStepLine(enabled: boolean): string {
  return enabled ? t("log.next.on") : t("log.next.off")
}

export function deleteSub(bytes: number, enabled: boolean): string {
  return t(enabled ? "log.delete.subCarries" : "log.delete.sub", { size: formatBytes(bytes) })
}

export function deleteConfirmMessage(bytes: number): string {
  return t("log.delete.confirm", { size: formatBytes(bytes) })
}

/**
 * One count, one place, outside the scroller, arithmetically true against the chip beside it.
 * Never called with no lines at all: the empty state owns that screen, head and count included.
 */
export function resultLine(shown: number, total: number, fromFile: boolean): string {
  const n = total.toLocaleString()
  if (shown === total) return t(fromFile ? "log.result.file" : "log.result.system", { count: total, n })
  return t(fromFile ? "log.resultOf.file" : "log.resultOf.system", { count: total, n, shown: shown.toLocaleString() })
}

const FLOOR_RANK: Record<LogFloor, number> = { all: 0, info: 1, warn: 2, error: 3 }
const LEVEL_RANK: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }

/** A floor, not a set: the counts are nested subsets, so they cannot disagree with each other. */
export function passesFloor(level: LogLevel, floor: LogFloor): boolean {
  return LEVEL_RANK[level] >= FLOOR_RANK[floor]
}

export function countByFloor(entries: readonly MergedLogEntry[]): Record<LogFloor, number> {
  const counts: Record<LogFloor, number> = { all: 0, info: 0, warn: 0, error: 0 }
  for (const entry of entries) {
    counts.all++
    if (passesFloor(entry.level, "info")) counts.info++
    if (passesFloor(entry.level, "warn")) counts.warn++
    if (passesFloor(entry.level, "error")) counts.error++
  }
  return counts
}

/**
 * The count rides on the chip so a reporter learns there are four errors without selecting Errors
 * to find out, which is changing state to read a fact.
 */
export function floorOptions(
  counts: Record<LogFloor, number>
): readonly { value: LogFloor; label: string; testID: string }[] {
  return [
    { value: "all", label: t("log.floor.all", { n: counts.all.toLocaleString() }), testID: "floor-all" },
    { value: "info", label: t("log.floor.info", { n: counts.info.toLocaleString() }), testID: "floor-info" },
    { value: "warn", label: t("log.floor.warn", { n: counts.warn.toLocaleString() }), testID: "floor-warn" },
    { value: "error", label: t("log.floor.error", { n: counts.error.toLocaleString() }), testID: "floor-error" }
  ]
}

/**
 * Forced to 24 hours whatever the Appearance clock says: the file this previews is written
 * 24-hour, and a mono column whose width changes by locale defeats the face it is set in.
 */
export function logTime(ms: number): string {
  if (!(ms > 0)) return "--:--:--"
  return formatTimeIn(Math.floor(ms / 1000), "24h", true)
}

export function levelLetter(level: LogLevel): string {
  return level.charAt(0)
}

export function levelWord(level: LogLevel): string {
  return t(`log.level.${level}`)
}

/** One node per line for TalkBack, rather than one node holding three thousand lines. */
export function rowLabel(entry: MergedLogEntry, stamp: string): string {
  return `${levelWord(entry.level)}, ${stamp}, ${entry.message}`
}
