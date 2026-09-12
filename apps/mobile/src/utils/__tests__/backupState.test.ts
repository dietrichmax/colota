import type { BackupManifest, PasswordStrengthResult } from "../../services/BackupService"
import { formatDateWithYear } from "../geo"
import {
  archiveLine,
  backupErrorMessage,
  backupExcludesLine,
  backupRowSub,
  backupScopeLine,
  backupState,
  passwordLine,
  restoreCaveat,
  restoreConfirm,
  restoreErrorMessage,
  restoreOutcome,
  submitBlockedReason
} from "../backupState"

const MADE_AT = "2026-09-03T09:15:00Z"
const MADE_SECONDS = Math.floor(Date.parse(MADE_AT) / 1000)

const manifest = (over: Partial<BackupManifest> = {}): BackupManifest => ({
  createdAt: MADE_AT,
  appVersion: "1.16.0",
  appBuild: 48,
  schemaDb: 7,
  ...over
})

const strength = (score: number, bits: number, label = "Strong"): PasswordStrengthResult =>
  ({ score, bits, label }) as PasswordStrengthResult

describe("backupState", () => {
  it("says when the last backup was, and what a new one would hold", () => {
    const line = backupState(Date.parse(MADE_AT), { total: 12481, databaseSizeMB: 8.42 })
    expect(line.label).toBe(`You last backed up ${formatDateWithYear(MADE_SECONDS)}`)
    expect(line.caption).toBe("Database: 12,481 locations, 8.42 MB")
    expect(line.tone).toBe("ok")
  })

  // The tone separates a device with data and no backup from a device with nothing to lose.
  it("warns only when there is something to lose", () => {
    expect(backupState(null, { total: 12481, databaseSizeMB: 8.42 }).tone).toBe("none")
    expect(backupState(null, { total: 0, databaseSizeMB: 0.02 }).tone).toBe("empty")
  })

  it("treats a zero timestamp as never, since that is what an unset row reads as", () => {
    expect(backupState(0, { total: 5, databaseSizeMB: 1 }).label).toBe("You have never backed up")
    expect(backupRowSub(0)).toBe("Never backed up")
    expect(backupRowSub(Date.parse(MADE_AT))).toBe(`Last backed up ${formatDateWithYear(MADE_SECONDS)}`)
  })

  /**
   * The app holds no grant on the destination, so it cannot see whether the file is still there.
   * Every line states what the user did, never that a backup exists, or deleting the file makes it
   * a lie.
   */
  it("states the act of backing up, never that a file exists", () => {
    const line = backupState(Date.parse(MADE_AT), { total: 12481, databaseSizeMB: 8.42 })
    for (const text of [line.label, backupRowSub(Date.parse(MADE_AT)), backupRowSub(0)]) {
      expect(text).toMatch(/backed up/)
    }
  })
})

describe("submitBlockedReason", () => {
  // The old placeholder stated a length while the gate was entropy, so the button died silently.
  it("names the rule that is actually blocking, in order", () => {
    expect(submitBlockedReason("", "", strength(0, 0))).toBe("Choose a password first.")
    expect(submitBlockedReason("short", "", strength(1, 20))).toBe("This password is too easy to guess.")
    expect(submitBlockedReason("correct horse battery", "", strength(3, 62))).toBe("Type the password a second time.")
    expect(submitBlockedReason("correct horse battery", "typo", strength(3, 62))).toBe(
      "The two passwords do not match."
    )
  })

  it("returns nothing once the password can be submitted", () => {
    expect(submitBlockedReason("correct horse battery", "correct horse battery", strength(3, 62))).toBeNull()
  })

  // The gate is the native score, so the line and the button cannot disagree.
  it("gates on the same score the line reports", () => {
    expect(submitBlockedReason("x", "x", strength(2, 50))).toBeNull()
    expect(passwordLine(strength(2, 50), false).variant).toBe("info")
    expect(submitBlockedReason("x", "x", strength(1, 49))).not.toBeNull()
    expect(passwordLine(strength(1, 49), false).variant).toBe("warning")
  })
})

describe("passwordLine", () => {
  it("says so when the check itself failed, rather than calling the password weak", () => {
    expect(passwordLine(strength(0, 0), true).text).toBe("Could not check this password. Try again.")
  })

  /**
   * Native scores the password and JS prints its label, so the twelve-character minimum lives in
   * one place. A number copied into JS would go stale the day the native rule moves.
   */
  it("prints the verdict native computed, and the advice that fits it", () => {
    expect(passwordLine(strength(0, 0, "Too short"), false).text).toBe("Too short. Make it longer.")
    expect(passwordLine(strength(1, 38, "Weak"), false).text).toBe("Weak. Make it longer or less predictable.")
    expect(passwordLine(strength(2, 55, "OK"), false).text).toBe("OK. 55 bits.")
  })
})

describe("backupScopeLine and backupExcludesLine", () => {
  /**
   * BACKED_UP_KEYS carries the auth config and the mTLS server CA. The client certificate's private
   * key is generated in the Android keystore and cannot be read back, so no archive holds it and the
   * scope line must never claim one does.
   */
  it("never claims the client certificate is written", () => {
    expect(backupScopeLine(12481)).not.toContain("certificate")
    expect(backupScopeLine(12481)).toContain("stored server credentials")
  })

  it("says the certificate is excluded, and only to someone who has one", () => {
    expect(backupExcludesLine(true)).toContain("not included")
    expect(backupExcludesLine(false)).toBeNull()
  })
})

describe("archiveLine and restoreConfirm", () => {
  it("names the date the archive was made and the count it would replace", () => {
    expect(archiveLine(manifest()).label).toBe(`Backup from ${formatDateWithYear(MADE_SECONDS)}`)
    expect(archiveLine(manifest()).caption).toBe("Colota 1.16.0 · opened with your password")

    const copy = restoreConfirm(12481, manifest())
    expect(copy.title).toBe("Replace all 12,481 locations?")
    expect(copy.message).toContain(formatDateWithYear(MADE_SECONDS))
    expect(copy.confirmText).toBe("Replace")
  })

  // The shipped dialog named three of six tables and no count at all.
  it("names every table the swap takes", () => {
    const { message } = restoreConfirm(1, manifest())
    for (const noun of ["locations", "geofences", "tracking profiles", "trip splits", "settings", "upload queue"]) {
      expect(message).toContain(noun)
    }
    expect(message).toContain("cannot be undone")
  })

  it("survives an unreadable date instead of printing NaN", () => {
    expect(archiveLine(manifest({ createdAt: "not a date" })).label).toBe("Backup from an unknown date")
  })
})

describe("restoreCaveat", () => {
  // One string or none, so restraint is a signature rather than a discipline.
  it("returns at most one caveat", () => {
    expect(restoreCaveat(true)).toContain("client certificate")
    expect(restoreCaveat(false)).toBeNull()
  })

  /**
   * deleteAndroidKeyStoreClientCert has one caller, the Remove button in MtlsSection. Nothing in the
   * restore path touches the keystore, so a caveat promising removal would be false.
   */
  it("does not claim a restore removes the certificate", () => {
    expect(restoreCaveat(true)).not.toMatch(/remov|delet/i)
    expect(restoreCaveat(true)).toContain("stays as it is")
  })
})

describe("restoreOutcome", () => {
  /**
   * This is the decision that matters most: the caller reloads the bundle on "restored" and does
   * not on "failed". A post-swap failure reported as failed leaves every screen reading a database
   * that no longer exists.
   */
  it("calls every post-swap code restored, however it ended", () => {
    expect(restoreOutcome(undefined).kind).toBe("restored")
    expect(restoreOutcome("E_BACKUP_SECRETS_PARTIAL").kind).toBe("restored")
    expect(restoreOutcome("E_BACKUP_RESTORED_INCOMPLETE").kind).toBe("restored")
  })

  it("calls every pre-swap code failed", () => {
    for (const code of [
      "E_BACKUP_WRONG_PASSWORD",
      "E_BACKUP_BAD_MAGIC",
      "E_BACKUP_TRUNCATED",
      "E_BACKUP_MIGRATION_FAILED",
      "E_BACKUP_NO_SPACE",
      "E_BUSY"
    ]) {
      expect(restoreOutcome(code).kind).toBe("failed")
    }
  })

  it("opens every restored outcome the same way and says recording is off", () => {
    for (const code of [undefined, "E_BACKUP_SECRETS_PARTIAL", "E_BACKUP_RESTORED_INCOMPLETE"]) {
      const outcome = restoreOutcome(code)
      expect(outcome.title).toBe("Your data is restored")
      expect(outcome.message.toLowerCase()).toContain("recording is off")
    }
  })
})

describe("restoreErrorMessage", () => {
  // Every pre-swap failure is provably one where nothing was replaced, so every one says so.
  it("ends every pre-swap failure with the same promise", () => {
    for (const code of [
      "E_BACKUP_WRONG_PASSWORD",
      "E_BACKUP_BAD_MAGIC",
      "E_BACKUP_TRUNCATED",
      "E_BACKUP_TAMPERED",
      "E_BACKUP_MIGRATION_FAILED",
      "E_BACKUP_UNSUPPORTED_SCHEMA",
      "E_BACKUP_MISSING_ENTRY",
      "E_BACKUP_NO_SPACE",
      undefined
    ]) {
      expect(restoreErrorMessage(code)).toContain("Nothing on this device was changed.")
    }
  })

  // The file is intact and this app's migration failed, which is not the same as corruption.
  it("tells a migration failure apart from a damaged file", () => {
    expect(restoreErrorMessage("E_BACKUP_MIGRATION_FAILED")).not.toContain("damaged")
    expect(restoreErrorMessage("E_BACKUP_INTEGRITY_FAIL")).toContain("damaged")
  })

  it("has a sentence for a truncated archive, which is what a half-written file reads as", () => {
    expect(restoreErrorMessage("E_BACKUP_TRUNCATED")).toContain("never finished being written")
  })
})

describe("backupErrorMessage", () => {
  it("claims only the scope the lock has", () => {
    expect(backupErrorMessage("E_BUSY")).toBe("Another backup or restore is already running.")
  })

  it("falls back to what native said, since the backup path's messages are user-safe", () => {
    expect(backupErrorMessage(undefined, "Could not write to the file you chose.")).toBe(
      "Could not write to the file you chose."
    )
  })
})
