/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { formatDate } from "./geo"

/**
 * What each delete on Data management takes, in the words the control and its confirmation use.
 *
 * The wording is pinned to the SQL, not to the old labels: `clearSentHistory` is
 * `DELETE FROM locations WHERE sent = 1`, so synced days leave History and imported archives go
 * with them; `clearQueue` deletes the recordings, not their pending uploads; `deleteOlderThan`
 * ignores sync state; `clearAllLocations` also empties `boundary_overrides`, every manual trip
 * split. A test pins every sentence without rendering the screen.
 */

export type DataScope = "queued" | "synced" | "older" | "all"

export interface DeleteCopy {
  title: string
  message: string
  confirmText: string
}

const plural = (n: number, noun: string) => `${n.toLocaleString()} ${noun}${n === 1 ? "" : "s"}`

/** The sub under a delete row, or the message under a delete button: what this press would take. */
export function scopeSub(scope: "queued" | "synced", count: number): string {
  if (scope === "queued") {
    return count === 0
      ? "Nothing queued."
      : `${plural(count, "location")} waiting to upload. Nothing else holds a copy, and they leave History too.`
  }
  return count === 0
    ? "Nothing has been uploaded yet."
    : `${plural(count, "location")} already on your server. Imported locations count as synced.`
}

/**
 * The line under the age button: the boundary the count used. How many of them have no copy on the
 * server is not here, because that count reads every matching row and is only worth taking once, on
 * the press, where `deleteCopy` says it.
 */
export function olderSub(count: number, days: number, cutoffSeconds: number): string {
  if (count === 0) return `Nothing on this device is older than ${plural(days, "day")}.`
  return `Recorded before ${formatDate(cutoffSeconds)}.`
}

/** The line under Delete all: the two things it takes that no label has ever named. */
export function allSub(total: number): string {
  return `All ${plural(total, "location")} and every trip split and merge you made. Geofences, profiles and settings stay.`
}

export interface OlderArgs {
  days: number
  /** The boundary in Unix seconds, from the same native read that produced the count. */
  cutoffSeconds: number
  unsent: number
}

/** The confirmation for one delete. Every count comes from a read taken immediately before the dialog. */
export function deleteCopy(scope: DataScope, count: number, older?: OlderArgs): DeleteCopy {
  switch (scope) {
    case "queued":
      return {
        title: `Delete ${plural(count, "queued location")}?`,
        message:
          "These are the locations themselves, not their pending uploads. Once deleted, no copy survives anywhere and they leave History too. Points already handed to your server during a running sync may still arrive. This cannot be undone.",
        confirmText: "Delete"
      }
    case "synced":
      return {
        title: `Delete ${plural(count, "synced location")}?`,
        message: `Removes ${plural(count, "location")} from this device, not an upload record. Those days leave History, notes included, and locations you imported count as synced. Copies already on your server stay there. This cannot be undone.`,
        confirmText: "Delete"
      }
    case "older": {
      const { days = 0, cutoffSeconds = 0, unsent = 0 } = older ?? ({} as OlderArgs)
      const never =
        unsent === 0
          ? ""
          : ` ${unsent.toLocaleString()} of them have never been uploaded, so no copy of those survives.`
      return {
        title: `Delete ${plural(count, "location")} older than ${plural(days, "day")}?`,
        message: `Removes every location recorded before ${formatDate(cutoffSeconds)} from this device.${never} Those days leave History. Copies already on your server stay there. This cannot be undone.`,
        confirmText: "Delete"
      }
    }
    case "all":
      return {
        title: `Delete all ${plural(count, "location")}?`,
        message:
          "Removes every location on this device, its upload queue and every manual trip split and merge you made. History becomes empty. Your settings, geofences and profiles stay, and copies already on your server are not touched. This cannot be undone.",
        confirmText: "Delete all"
      }
  }
}
