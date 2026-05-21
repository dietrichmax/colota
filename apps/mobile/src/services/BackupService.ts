/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { NativeModules } from "react-native"

const { BackupServiceModule } = NativeModules

export const MIN_BACKUP_PASSWORD_LENGTH = 12
export const MIN_BACKUP_PASSWORD_BITS = 50

type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4

export type PasswordStrengthResult = {
  score: PasswordStrengthScore
  label: string
  bits: number
}

export type BackupSource = {
  uri: string
  displayName: string | null
}

function passwordToCodes(password: string): number[] {
  const codes = new Array<number>(password.length)
  for (let i = 0; i < password.length; i++) codes[i] = password.charCodeAt(i)
  return codes
}

class BackupService {
  private static ensureModule(): void {
    if (!BackupServiceModule) {
      throw new Error("[BackupService] BackupServiceModule not available. Check native linking.")
    }
  }

  static async passwordStrength(password: string): Promise<PasswordStrengthResult> {
    BackupService.ensureModule()
    const codes = passwordToCodes(password)
    try {
      return await BackupServiceModule.passwordStrength(codes)
    } finally {
      codes.fill(0)
    }
  }

  static async pickBackupDestination(): Promise<string | null> {
    BackupService.ensureModule()
    return BackupServiceModule.pickBackupDestination()
  }

  static async pickBackupSource(): Promise<BackupSource | null> {
    BackupService.ensureModule()
    return BackupServiceModule.pickBackupSource()
  }

  // Pass password as UTF-16 code units so the Kotlin side never constructs a
  // non-wipeable JVM String. The JS string itself remains uncleanable; this
  // only narrows the lifetime of the password on the native heap.
  static async createBackup(uri: string, password: string): Promise<void> {
    BackupService.ensureModule()
    const codes = passwordToCodes(password)
    try {
      await BackupServiceModule.createBackup(uri, codes)
    } finally {
      codes.fill(0)
    }
  }

  static async restoreBackup(uri: string, password: string): Promise<void> {
    BackupService.ensureModule()
    const codes = passwordToCodes(password)
    try {
      await BackupServiceModule.restoreBackup(uri, codes)
    } finally {
      codes.fill(0)
    }
  }

  // RN reload so all modules re-read state from the restored DB.
  static async applyRestore(): Promise<void> {
    BackupService.ensureModule()
    await BackupServiceModule.applyRestore()
  }
}

export default BackupService
