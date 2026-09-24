/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { formatDateWithYear } from "./geo"
import { t } from "../i18n/t"

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

const count = (key: "data.locations" | "data.days" | "data.queuedLocations" | "data.syncedLocations", n: number) =>
  t(key, { count: n, n: n.toLocaleString() })

/** The sub under a delete row, or the message under a delete button: what this press would take. */
export function scopeSub(scope: "queued" | "synced", n: number): string {
  if (scope === "queued") {
    return n === 0 ? t("data.queued.none") : t("data.queued.some", { count: n, n: n.toLocaleString() })
  }
  return n === 0 ? t("data.synced.none") : t("data.synced.some", { count: n, n: n.toLocaleString() })
}

/**
 * The sub on the Delete older locations row. How many of them have no copy on the server is not here,
 * because that count reads every matching row and is only worth taking once, on the press, where
 * `deleteCopy` says it.
 */
export function olderSub(n: number, days: number, cutoffSeconds: number): string {
  if (n === 0) return t("data.older.none", { days: count("data.days", days) })
  return t("data.older.some", { locations: count("data.locations", n), date: formatDateWithYear(cutoffSeconds) })
}

export interface OlderArgs {
  days: number
  /** The boundary in Unix seconds, from the same native read that produced the count. */
  cutoffSeconds: number
  unsent: number
}

/** The confirmation for one delete. Every count comes from a read taken immediately before the dialog. */
export function deleteCopy(scope: DataScope, n: number, older?: OlderArgs): DeleteCopy {
  switch (scope) {
    case "queued":
      return {
        title: t("data.delete.queued.title", { locations: count("data.queuedLocations", n) }),
        message: t("data.delete.queued.message"),
        confirmText: t("common.delete")
      }
    case "synced":
      return {
        title: t("data.delete.synced.title", { locations: count("data.syncedLocations", n) }),
        message: t("data.delete.synced.message", { locations: count("data.locations", n) }),
        confirmText: t("common.delete")
      }
    case "older": {
      const { days = 0, cutoffSeconds = 0, unsent = 0 } = older ?? ({} as OlderArgs)
      const never = unsent === 0 ? "" : ` ${t("data.delete.never", { count: unsent, n: unsent.toLocaleString() })}`
      return {
        title: t("data.delete.older.title", { locations: count("data.locations", n), days: count("data.days", days) }),
        message: t("data.delete.older.message", { date: formatDateWithYear(cutoffSeconds), never }),
        confirmText: t("common.delete")
      }
    }
    case "all":
      return {
        title: t("data.delete.all.title", { locations: count("data.locations", n) }),
        message: t("data.delete.all.message"),
        confirmText: t("data.delete.all.confirm")
      }
  }
}
