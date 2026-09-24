/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import type { BackupManifest, PasswordStrengthResult } from "../services/BackupService"
import { formatDateWithYear } from "./geo"
import { formatBytes } from "./format"
import { t } from "../i18n/t"

/**
 * What a backup holds and what restoring one replaces, in the words the screen prints.
 *
 * Restore swaps the database file rather than deleting rows, so every sentence here names what goes
 * and whether it has gone yet. `restoreOutcome` is the one place that decides whether the swap
 * happened, because that answer decides whether the caller reloads the bundle.
 *
 * The app never sees a backup file after it writes one: it holds no persisted grant on the
 * destination, so `last_backup_at` records that a backup was made and nothing more. Every line here
 * is worded as an event for that reason, because a file the user has since moved or deleted would
 * make any claim that one exists a lie.
 */

const locations = (n: number) => t("backup.locations", { count: n, n: n.toLocaleString() })

const whenBackedUp = (ms: number | null): string | null =>
  ms && ms > 0 ? formatDateWithYear(Math.floor(ms / 1000)) : null

export interface BackupStateLine {
  label: string
  caption: string
  tone: "ok" | "none" | "empty"
}

/** The opening line: whether a backup was ever made, and what a new one would hold. */
export function backupState(
  lastBackupAtMs: number | null,
  stats: { total: number; databaseSizeMB: number }
): BackupStateLine {
  const caption = t("backup.caption", {
    locations: locations(stats.total),
    size: formatBytes(stats.databaseSizeMB * 1024 * 1024, { decimals: 0 })
  })
  const when = whenBackedUp(lastBackupAtMs)
  if (when) return { label: t("backup.last", { when }), caption, tone: "ok" }
  if (stats.total === 0) return { label: t("backup.never"), caption, tone: "empty" }
  return { label: t("backup.never"), caption, tone: "none" }
}

/** The Settings hub row. */
export function backupRowSub(lastBackupAtMs: number | null): string {
  const when = whenBackedUp(lastBackupAtMs)
  return when ? t("backup.row.last", { when }) : t("backup.row.never")
}

/** The line under the password field, from the score native computed rather than a second guess. */
export function passwordLine(
  strength: PasswordStrengthResult,
  failed: boolean
): { text: string; variant: "info" | "warning" } {
  if (failed) return { text: t("backup.password.checkFailed"), variant: "warning" }
  if (strength.score >= 2) return { text: t("backup.password.label", { label: strength.label }), variant: "info" }
  // Native's own label, so the reason can never disagree with the gate and no length lives in JS.
  const advice = strength.score === 0 ? t("backup.password.longer") : t("backup.password.longerOrLess")
  return {
    text: strength.label ? t("backup.password.labelAdvice", { label: strength.label, advice }) : advice,
    variant: "warning"
  }
}

/** Why Create backup is disabled, in the words of the rule that blocks it. */
export function submitBlockedReason(
  password: string,
  confirm: string,
  strength: PasswordStrengthResult
): string | null {
  if (password.length === 0) return t("backup.blocked.choose")
  if (strength.score < 2) return t("backup.blocked.weak")
  if (confirm.length === 0) return t("backup.blocked.confirm")
  if (password !== confirm) return t("backup.blocked.mismatch")
  return null
}

/** What a new archive would contain, stated at the top of the backup form. */
export function backupScopeLine(total: number): string {
  return t("backup.scope", { count: total, n: total.toLocaleString() })
}

/**
 * The client certificate's private key is generated in the Android keystore and cannot be read back
 * out, so no backup can carry it. Only said to someone who has one, since it is otherwise noise.
 */
export function backupExcludesLine(hasClientCert: boolean): string | null {
  if (!hasClientCert) return null
  return t("backup.excludesCert")
}

/** The archive is encrypted and there is no reset, which is the one thing worth saying twice. */
export const noRecoveryLine = () => t("backup.noRecovery")

export const backupWrittenLine = () => t("backup.written")

export const restoreIdleLine = () => t("backup.restoreIdle")

export const pickedNotOpenedCaption = () => t("backup.pickedNotOpened")

export const openFileLine = () => t("backup.openFile")

const madeOn = (manifest: BackupManifest) => {
  const seconds = Date.parse(manifest.createdAt) / 1000
  return Number.isFinite(seconds) ? formatDateWithYear(Math.floor(seconds)) : t("backup.unknownDate")
}

/** The opened archive, as a state line. */
export function archiveLine(manifest: BackupManifest): { label: string; caption: string } {
  return {
    label: t("backup.from", { date: madeOn(manifest) }),
    caption: t("backup.openedWith", { version: manifest.appVersion })
  }
}

/** At most one caveat, so restraint is a signature rather than a discipline. */
export function restoreCaveat(certConfigured: boolean): string | null {
  if (!certConfigured) return null
  return t("backup.restoreCaveat")
}

export interface ConfirmCopy {
  title: string
  message: string
  confirmText: string
}

/** Names the count it replaces and the date it replaces them with. */
export function restoreConfirm(total: number, manifest: BackupManifest): ConfirmCopy {
  return {
    title: t("backup.replace.title", { count: total, n: total.toLocaleString() }),
    message: t("backup.replace.message", { date: madeOn(manifest) }),
    confirmText: t("backup.replace.confirm")
  }
}

export type AlertTone = "success" | "warning" | "error"

export interface Outcome {
  kind: "restored" | "failed"
  title: string
  message: string
  variant: AlertTone
}

/**
 * The one place that decides whether the database was replaced, and therefore whether the caller
 * reloads the bundle. Every post-swap code answers "restored", however it ended.
 */
export function restoreOutcome(code: string | undefined, nativeMessage?: string): Outcome {
  switch (code) {
    case undefined:
      return {
        kind: "restored",
        title: t("backup.restored.title"),
        message: t("backup.restored.message"),
        variant: "success"
      }
    case "E_BACKUP_SECRETS_PARTIAL":
      return {
        kind: "restored",
        title: t("backup.restored.title"),
        message: t("backup.restored.secrets"),
        variant: "warning"
      }
    case "E_BACKUP_RESTORED_INCOMPLETE":
      return {
        kind: "restored",
        title: t("backup.restored.title"),
        message: t("backup.restored.incomplete"),
        variant: "warning"
      }
    default:
      return {
        kind: "failed",
        title: t("backup.restoreFailed"),
        message: restoreErrorMessage(code, nativeMessage),
        variant: "error"
      }
  }
}

/** Every pre-swap failure ends the same way, because on every one of them it is true. */
const unchanged = (sentence: string) => `${sentence} ${t("backup.unchanged")}`

export function restoreErrorMessage(code: string | undefined, nativeMessage?: string): string {
  switch (code) {
    case "E_BACKUP_WRONG_PASSWORD":
      return unchanged(t("backup.err.wrongPassword"))
    case "E_BACKUP_BAD_MAGIC":
    case "E_BACKUP_UNSUPPORTED_VERSION":
      return unchanged(t("backup.err.notBackup"))
    case "E_BACKUP_TRUNCATED":
      return unchanged(t("backup.err.truncated"))
    case "E_BACKUP_TAMPERED":
    case "E_BACKUP_INTEGRITY_FAIL":
      return unchanged(t("backup.err.tampered"))
    case "E_BACKUP_MIGRATION_FAILED":
      return unchanged(t("backup.err.migration"))
    case "E_BACKUP_UNSUPPORTED_SCHEMA":
      return unchanged(t("backup.err.newer"))
    case "E_BACKUP_MISSING_ENTRY":
      return unchanged(t("backup.err.missingEntry"))
    case "E_BACKUP_NO_SPACE":
      return unchanged(t("backup.err.noSpace"))
    case "E_BUSY":
      return t("backup.err.busy")
    case "E_PASSWORD_EMPTY":
      return t("backup.err.passwordEmpty")
    default:
      return unchanged(nativeMessage || t("backup.err.restoreGeneric"))
  }
}

export function backupErrorMessage(code: string | undefined, nativeMessage?: string): string {
  switch (code) {
    case "E_BUSY":
      return t("backup.err.busy")
    case "E_PASSWORD_EMPTY":
      return t("backup.blocked.choose")
    default:
      return nativeMessage ?? t("backup.err.writeGeneric")
  }
}
