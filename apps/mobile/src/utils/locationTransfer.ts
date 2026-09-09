/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import type { ImportPreview } from "../services/ImportService"
import { FILE_FORMATS, IMPORT_FORMAT_ORDER } from "./fileFormats"
import { plural } from "./format"
import { formatDateWithYear } from "./geo"

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

const formatLabel = (format: string) => FILE_FORMATS[format as keyof typeof FILE_FORMATS]?.label ?? format.toUpperCase()

/** The formats a file can be read as, from the one table, with the legacy Timeline name folded in. */
export function readableFormats(): string {
  const labels = IMPORT_FORMAT_ORDER.map((format) => FILE_FORMATS[format].label.replace(" (legacy)", ""))
  return [...new Set(labels)].join(", ")
}

/** The line under the export button: the scope, and what happens to the file. */
export function exportLine(total: number): string {
  if (total === 0) return "Nothing to export yet."
  return `All ${plural(total, "location")} in one file, oldest first. The file goes to the app you pick and is not kept here.`
}

/** After a run. Nothing here claims the file was saved, because nothing saved it. */
export function exportResultLine(rowCount: number, format: string): string {
  return `Exported ${plural(rowCount, "location")} as ${formatLabel(format)} and handed the file over.`
}

/** A share the system never started. Logged and swallowed before, so it read as a success. */
export const SHARE_FAILED_LINE = "The file was written but no app took it. Try again and pick a different app."

/** The line under Choose a file. There is no format control, because the parser decides. */
export function importSourceLine(): string {
  return `Reads ${readableFormats()}. The format is read from the file, so there is nothing to choose. ${FILE_FORMATS.csv.importHint}`
}

/** The sub on the row above the import verb. The only route back is a whole-database restore. */
export function backupFirstSub(): string {
  return "An import cannot be undone. A backup is the only way back."
}

/** The staged file, as a state line: the number that matters, then what it came from and when. */
export function previewHeadline(preview: ImportPreview): { label: string; caption: string } {
  const span =
    preview.dateRangeStartSec != null && preview.dateRangeEndSec != null
      ? ` · ${formatDateWithYear(preview.dateRangeStartSec)} to ${formatDateWithYear(preview.dateRangeEndSec)}`
      : ""
  return {
    label: `${plural(preview.newRows, "new location")}`,
    caption: `${formatLabel(preview.format)}${span}`
  }
}

/**
 * One line for everything the import will not take, and nothing at all when it takes everything.
 * Three permanent counts made the card a ledger of zeroes.
 */
export function skippedLine(preview: ImportPreview): string | undefined {
  const parts: string[] = []
  if (preview.duplicates > 0) parts.push(plural(preview.duplicates, "duplicate"))
  if (preview.invalid > 0) parts.push(plural(preview.invalid, "unusable row"))
  if (parts.length === 0) return undefined
  return `Skipping ${parts.join(" and ")}.`
}

/** The sub under the queue switch. One upload per row is the part that surprises people. */
export function queueHint(newRows: number): string {
  return `Sends ${plural(newRows, "location")} to your server too.`
}

export function commitLabel(newRows: number, queued: boolean): string {
  return queued ? `Import and queue ${newRows.toLocaleString()}` : `Import ${plural(newRows, "location")}`
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
  const rejected = preview.invalid > 0 ? " A rejected row had no usable time or coordinates." : ""
  const shared = `Nothing already stored is changed or removed. Duplicates are counted inside the file and against what is stored, and a duplicate is skipped rather than merged.${rejected} Recording pauses while these are written, and an import cannot be undone one point at a time.`
  if (!queued) {
    return {
      title: `Import ${plural(preview.newRows, "location")}?`,
      message: `${shared} They are marked as already uploaded, so Delete synced locations in Data management would take them too.`,
      confirmText: "Import"
    }
  }
  return {
    title: `Import and queue ${preview.newRows.toLocaleString()} locations?`,
    message: `${shared} Every one becomes an upload to your server, and Colota cannot recall what your server has already taken.`,
    confirmText: "Import and queue"
  }
}

/** A parse that staged nothing. Three different reasons that all read as "nothing found" before. */
export function emptyPreviewCopy(preview: ImportPreview): string {
  if (preview.totalParsed === 0 && preview.invalid === 0) return "No locations were found in this file."
  if (preview.totalParsed === 0) {
    return `No usable locations. ${preview.invalid.toLocaleString()} rows had no usable time or coordinates.`
  }
  return `Nothing new. ${preview.duplicates.toLocaleString()} points were skipped as duplicates, counted both inside the file and against what is already stored.`
}

/** Native error codes, worded from what each one means rather than from a hand-kept list. */
export function importErrorMessage(code: string | undefined): string {
  switch (code) {
    case "E_IMPORT_UNSUPPORTED":
      return `Colota did not recognise this file. It reads ${readableFormats()}, and it refuses an XML file that declares a DOCTYPE.`
    case "E_BUSY":
      return "Another import is already running."
    case "E_IMPORT_NO_PENDING":
      return "The file you picked expired. Choose it again."
    case "E_IMPORT_SYNC_UNAVAILABLE":
      return "There is no server to queue to. Import without queueing, or set one up on Connection first."
    default:
      return "The file could not be read."
  }
}

/** The Automatic export row, and the hub row that now carries its state. */
export function autoExportSub(status: AutoExportState | null): string {
  if (!status) return "Not set up yet"
  if (status.uri === null) return "No folder chosen"
  if (!status.enabled) {
    return status.lastError ? "Stopped, folder access lost" : "Off"
  }
  if (status.running) return "Export running"
  const interval = status.interval.charAt(0).toUpperCase() + status.interval.slice(1)
  const kept = status.retentionCount > 0 ? ` · ${plural(status.retentionCount, "file")} kept` : ""
  return `${interval} · ${formatLabel(status.format)}${kept}${status.lastError ? " · last export failed" : ""}`
}

/**
 * The Settings hub row. It reports the auto-export state when there is one, because that row left
 * the hub and its one real failure would otherwise be reachable only by opening two screens.
 */
export function transferRowSub(status: AutoExportState | null): string {
  if (status && status.uri !== null && status.enabled) {
    // Only the first word is lowered. Lowering the whole line would print "geojson".
    const state = autoExportSub(status)
    return `Auto-export ${state.charAt(0).toLowerCase()}${state.slice(1)}`
  }
  if (status?.lastError && !status.enabled) return "Auto-export stopped, folder access lost"
  return `${readableFormats()} in, and out`
}
