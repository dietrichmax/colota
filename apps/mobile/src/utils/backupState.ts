/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import type { BackupManifest, PasswordStrengthResult } from "../services/BackupService"
import { formatDateWithYear } from "./geo"

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

const plural = (n: number, noun: string) => `${n.toLocaleString()} ${noun}${n === 1 ? "" : "s"}`

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
  const caption = `Database: ${plural(stats.total, "location")}, ${stats.databaseSizeMB.toFixed(2)} MB`
  const when = whenBackedUp(lastBackupAtMs)
  if (when) return { label: `You last backed up ${when}`, caption, tone: "ok" }
  if (stats.total === 0) return { label: "You have never backed up", caption, tone: "empty" }
  return { label: "You have never backed up", caption, tone: "none" }
}

/** The Settings hub row. */
export function backupRowSub(lastBackupAtMs: number | null): string {
  const when = whenBackedUp(lastBackupAtMs)
  return when ? `Last backed up ${when}` : "Never backed up"
}

/** The line under the password field, from the score native computed rather than a second guess. */
export function passwordLine(
  strength: PasswordStrengthResult,
  failed: boolean
): { text: string; variant: "info" | "warning" } {
  if (failed) return { text: "Could not check this password. Try again.", variant: "warning" }
  if (strength.score >= 2) return { text: `${strength.label}. ${Math.round(strength.bits)} bits.`, variant: "info" }
  // Native's own label, so the reason can never disagree with the gate and no length lives in JS.
  const advice = strength.score === 0 ? "Make it longer." : "Make it longer or less predictable."
  return { text: strength.label ? `${strength.label}. ${advice}` : advice, variant: "warning" }
}

/** Why Create backup is disabled, in the words of the rule that blocks it. */
export function submitBlockedReason(
  password: string,
  confirm: string,
  strength: PasswordStrengthResult
): string | null {
  if (password.length === 0) return "Choose a password first."
  if (strength.score < 2) return "This password is too easy to guess."
  if (confirm.length === 0) return "Type the password a second time."
  if (password !== confirm) return "The two passwords do not match."
  return null
}

/** What a new archive would contain. Stated once, where the button that writes it lives. */
export function backupScopeLine(total: number, hasClientCert: boolean): string {
  const cert = hasClientCert ? ", your stored credentials and your client certificate" : " and your stored credentials"
  return `Writes ${plural(total, "location")}, your geofences, profiles, settings${cert} to a file you pick.`
}

/** The archive is encrypted and there is no reset, which is the one thing worth saying twice. */
export const NO_RECOVERY_LINE = "Nobody can open this file without the password, and there is no way to reset it."

export const BACKUP_WRITTEN_LINE = "Backup written. Keep it somewhere you can reach without this phone."

export const RESTORE_IDLE_LINE = "Replaces everything on this device. Nothing is merged."

export const PICKED_NOT_OPENED_CAPTION = "Not opened yet."

export const OPEN_FILE_LINE = "Checks the password and reads what the file holds. Nothing on this device changes."

export const PASSWORD_HINT_LINE = "Several unrelated words work better than one short, clever one."

/** The opened archive, as a state line. */
export function archiveLine(manifest: BackupManifest): { label: string; caption: string } {
  const seconds = Date.parse(manifest.createdAt) / 1000
  const made = Number.isFinite(seconds) ? formatDateWithYear(Math.floor(seconds)) : "an unknown date"
  return {
    label: `Backup from ${made}`,
    caption: `Colota ${manifest.appVersion} · opened with your password`
  }
}

/** At most one caveat, so restraint is a signature rather than a discipline. */
export function restoreCaveat(certConfigured: boolean, manifest: BackupManifest): string | null {
  if (certConfigured && manifest.appBuild > 0) {
    return "Your client certificate is not in this backup and will be removed. Add it again afterwards."
  }
  return null
}

export interface ConfirmCopy {
  title: string
  message: string
  confirmText: string
}

/** Names the count it replaces and the date it replaces them with. */
export function restoreConfirm(total: number, manifest: BackupManifest): ConfirmCopy {
  const seconds = Date.parse(manifest.createdAt) / 1000
  const made = Number.isFinite(seconds) ? formatDateWithYear(Math.floor(seconds)) : "an unknown date"
  return {
    title: `Replace all ${plural(total, "location")}?`,
    message: `Replaces everything on this device with the backup from ${made}: locations, geofences, tracking profiles, trip splits, settings, the upload queue and your stored server credentials. Nothing is merged and nothing is kept. Recording stops and stays off until you turn it back on. The file and the password have already been checked, so your data is replaced in one step at the end, and that step cannot be undone.`,
    confirmText: "Replace"
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
        title: "Your data is restored",
        message: "Recording is off. Turn it back on when you are ready.",
        variant: "success"
      }
    case "E_BACKUP_SECRETS_PARTIAL":
      return {
        kind: "restored",
        title: "Your data is restored",
        message:
          "Your server credentials could not be applied. Enter them again on Connection. Recording is off until you turn it back on.",
        variant: "warning"
      }
    case "E_BACKUP_RESTORED_INCOMPLETE":
      return {
        kind: "restored",
        title: "Your data is restored",
        message:
          "Something failed after the swap, so some settings may not have been applied. Check Connection and Tracking. Recording is off until you turn it back on.",
        variant: "warning"
      }
    default:
      return {
        kind: "failed",
        title: "Restore failed",
        message: restoreErrorMessage(code, nativeMessage),
        variant: "error"
      }
  }
}

/** Every pre-swap failure ends the same way, because on every one of them it is true. */
const UNCHANGED = "Nothing on this device was changed."

export function restoreErrorMessage(code: string | undefined, nativeMessage?: string): string {
  switch (code) {
    case "E_BACKUP_WRONG_PASSWORD":
      return `That password did not open this file. ${UNCHANGED}`
    case "E_BACKUP_BAD_MAGIC":
    case "E_BACKUP_UNSUPPORTED_VERSION":
      return `This is not a Colota backup. ${UNCHANGED}`
    case "E_BACKUP_TRUNCATED":
      return `This file is incomplete, so it was probably never finished being written. ${UNCHANGED}`
    case "E_BACKUP_TAMPERED":
    case "E_BACKUP_INTEGRITY_FAIL":
      return `This file is damaged and cannot be trusted. ${UNCHANGED}`
    case "E_BACKUP_MIGRATION_FAILED":
      return `The file is intact but this version of Colota could not read its database. ${UNCHANGED}`
    case "E_BACKUP_UNSUPPORTED_SCHEMA":
      return `This backup was made by a newer version of Colota. Update the app first. ${UNCHANGED}`
    case "E_BACKUP_MISSING_ENTRY":
      return `This file is missing part of a backup. ${UNCHANGED}`
    case "E_BACKUP_NO_SPACE":
      return `There is not enough free space to unpack this backup. ${UNCHANGED}`
    case "E_BUSY":
      return "Another backup or restore is already running."
    case "E_PASSWORD_EMPTY":
      return "Type the backup's password first."
    default:
      return nativeMessage ? `${nativeMessage} ${UNCHANGED}` : `The backup could not be restored. ${UNCHANGED}`
  }
}

export function backupErrorMessage(code: string | undefined, nativeMessage?: string): string {
  switch (code) {
    case "E_BUSY":
      return "Another backup or restore is already running."
    case "E_PASSWORD_EMPTY":
      return "Choose a password first."
    default:
      return nativeMessage ?? "The backup could not be written. Try a different location."
  }
}
