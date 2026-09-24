/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import type { ImportPreview } from "../services/ImportService"
import { FILE_FORMATS, IMPORT_FORMAT_ORDER, fileFormatLabel } from "./fileFormats"
import { formatDateWithYear } from "./geo"
import { t } from "../i18n/t"

/**
 * What moving locations across this device's file boundary takes and leaves, in the words the
 * controls and their confirmations use.
 *
 * The wording is pinned to what the code does, not to the old labels: an import is INSERT-only with
 * no unique constraint, so it adds and never merges and cannot be undone one point at a time; its
 * duplicate count covers both the file and what is stored; and an export writes to the cache and
 * hands the file to another app rather than saving it. A test pins every sentence without rendering.
 */

type AutoExportState = {
  enabled: boolean
  running: boolean
  format: string
  interval: string
  uri: string | null
  lastError: string | null
  retentionCount: number
}

const formatLabel = (format: string) =>
  Object.prototype.hasOwnProperty.call(FILE_FORMATS, format)
    ? fileFormatLabel(format as keyof typeof FILE_FORMATS)
    : format.toUpperCase()

const counted = (
  key: "transfer.newLocations" | "transfer.duplicates" | "transfer.unusableRows" | "transfer.files",
  n: number
) => t(key, { count: n, n: n.toLocaleString() })

/** The formats a file can be read as, from the one table, with the legacy Timeline name folded in. */
export function readableFormats(): string {
  const labels = IMPORT_FORMAT_ORDER.map((format) => FILE_FORMATS[format].label)
  return [...new Set(labels)].join(", ")
}

/** The format dialog's message, and the result line when an export finds nothing. */
export function exportLine(total: number): string {
  if (total === 0) return t("transfer.nothingToExport")
  return t("transfer.exportAll", { count: total, n: total.toLocaleString() })
}

/** The sub on the Export all locations row. */
export function exportRowSub(total: number): string {
  return total === 0 ? t("transfer.nothingToExportRow") : t("transfer.everyLocation")
}

/** After a run. Nothing here claims the file was saved, because nothing saved it. */
export function exportResultLine(rowCount: number, format: string): string {
  return t("transfer.exported", { count: rowCount, n: rowCount.toLocaleString(), format: formatLabel(format) })
}

/** A share the system never started. Logged and swallowed before, so it read as a success. */
export function shareFailedLine(): string {
  return t("transfer.shareFailed")
}

/** The sub on the Import a file row. */
export function importRowSub(reading: boolean): string {
  return reading ? t("transfer.reading") : readableFormats()
}

/** The sub on the Back up first row in the staged preview. */
export function backupFirstSub(): string {
  return t("transfer.backupFirst")
}

/** The staged file, as a state line: the number that matters, then what it came from and when. */
export function previewHeadline(preview: ImportPreview): { label: string; caption: string } {
  const span =
    preview.dateRangeStartSec != null && preview.dateRangeEndSec != null
      ? ` · ${t("transfer.span", {
          from: formatDateWithYear(preview.dateRangeStartSec),
          to: formatDateWithYear(preview.dateRangeEndSec)
        })}`
      : ""
  return {
    label: counted("transfer.newLocations", preview.newRows),
    caption: `${formatLabel(preview.format)}${span}`
  }
}

/**
 * One line for everything the import will not take, and nothing at all when it takes everything.
 * Three permanent counts made the card a ledger of zeroes.
 */
export function skippedLine(preview: ImportPreview): string | undefined {
  const parts: string[] = []
  if (preview.duplicates > 0) parts.push(counted("transfer.duplicates", preview.duplicates))
  if (preview.invalid > 0) parts.push(counted("transfer.unusableRows", preview.invalid))
  if (parts.length === 0) return undefined
  const joined = parts.length === 2 ? t("transfer.and", { first: parts[0], second: parts[1] }) : parts[0]
  return t("transfer.skipping", { parts: joined })
}

/** The sub under the queue switch. One upload per row is the part that surprises people. */
export function queueHint(newRows: number): string {
  return t("transfer.queueHint", { count: newRows, n: newRows.toLocaleString() })
}

export function commitLabel(newRows: number, queued: boolean): string {
  return queued
    ? t("transfer.importQueue", { count: newRows, n: newRows.toLocaleString() })
    : t("transfer.importCount", { count: newRows, n: newRows.toLocaleString() })
}

export interface ConfirmCopy {
  title: string
  message: string
  confirmText: string
}

/**
 * The confirmation carries the reasoning the staged card no longer shows. It is read once, at the
 * moment it decides something, rather than standing on the screen while the user is still reading
 * the file they picked.
 */
export function commitConfirm(preview: ImportPreview, queued: boolean): ConfirmCopy {
  const rejected = preview.invalid > 0 ? ` ${t("transfer.confirm.rejected")}` : ""
  const shared = t("transfer.confirm.shared", { rejected })
  if (!queued) {
    return {
      title: t("transfer.confirm.title", { count: preview.newRows, n: preview.newRows.toLocaleString() }),
      message: t("transfer.confirm.synced", { shared }),
      confirmText: t("transfer.confirm.import")
    }
  }
  return {
    title: t("transfer.confirm.queueTitle", { count: preview.newRows, n: preview.newRows.toLocaleString() }),
    message: t("transfer.confirm.queued", { shared }),
    confirmText: t("transfer.confirm.importQueue")
  }
}

/** A parse that staged nothing. Three different reasons that all read as "nothing found" before. */
export function emptyPreviewCopy(preview: ImportPreview): string {
  if (preview.totalParsed === 0 && preview.invalid === 0) return t("transfer.empty.none")
  if (preview.totalParsed === 0)
    return t("transfer.empty.unusable", { count: preview.invalid, n: preview.invalid.toLocaleString() })
  return t("transfer.empty.duplicates", { count: preview.duplicates, n: preview.duplicates.toLocaleString() })
}

/** Native error codes, worded from what each one means rather than from a hand-kept list. */
export function importErrorMessage(code: string | undefined): string {
  switch (code) {
    case "E_IMPORT_UNSUPPORTED":
      // A CSV with a bad header is refused here, before any preview exists.
      return `${t("transfer.err.unsupported", { formats: readableFormats() })} ${t("transfer.err.unsupportedCsv")}`
    case "E_BUSY":
      return t("transfer.err.busy")
    case "E_IMPORT_NO_PENDING":
      return t("transfer.err.expired")
    case "E_IMPORT_SYNC_UNAVAILABLE":
      return t("transfer.err.noServer")
    default:
      return t("transfer.err.unreadable")
  }
}

const INTERVALS = ["daily", "weekly", "monthly"] as const
const isInterval = (value: string): value is (typeof INTERVALS)[number] =>
  (INTERVALS as readonly string[]).includes(value)

/** "Daily · GeoJSON · 3 files kept"; `clause` gives the interval its in-sentence form. */
function scheduleLine(status: AutoExportState, clause: boolean): string {
  const interval = isInterval(status.interval)
    ? t(clause ? `autoExport.interval.${status.interval}.clause` : `autoExport.interval.${status.interval}`)
    : status.interval
  const parts = [interval, formatLabel(status.format)]
  if (status.retentionCount > 0)
    parts.push(t("autoExport.sub.kept", { files: counted("transfer.files", status.retentionCount) }))
  if (status.lastError) parts.push(t("autoExport.sub.lastFailed"))
  return parts.join(" · ")
}

/** The Automatic export row, and the hub row that now carries its state. */
export function autoExportSub(status: AutoExportState | null): string {
  if (!status) return t("autoExport.sub.notSetUp")
  if (status.uri === null) return t("autoExport.sub.noFolder")
  if (!status.enabled) {
    return status.lastError ? t("autoExport.sub.stopped") : t("autoExport.sub.off")
  }
  if (status.running) return t("autoExport.sub.running")
  return scheduleLine(status, false)
}

/**
 * The Settings hub row. It reports the auto-export state when there is one, because that row left
 * the hub and its one real failure would otherwise be reachable only by opening two screens.
 */
export function transferRowSub(status: AutoExportState | null): string {
  if (status && status.uri !== null && status.enabled) {
    if (status.running) return t("transfer.row.autoRunning")
    return t("transfer.row.auto", { summary: scheduleLine(status, true) })
  }
  if (status?.lastError && !status.enabled) return t("transfer.row.autoStopped")
  return t("transfer.row.formats", { formats: readableFormats() })
}
