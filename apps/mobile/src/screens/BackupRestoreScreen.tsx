/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useEffect, useState } from "react"
import { Modal, ScrollView, View, Text, StyleSheet } from "react-native"
import type { RootScreenProps } from "../types/navigation"
import { useTheme } from "../hooks/useTheme"
import { Button, Card, Container, SectionTitle, TextField } from "../components"
import BackupService, {
  MIN_BACKUP_PASSWORD_LENGTH,
  MIN_BACKUP_PASSWORD_BITS,
  type PasswordStrengthResult
} from "../services/BackupService"
import { showAlert, showConfirm, showChoice } from "../services/modalService"
import { logger } from "../utils/logger"
import { fontSizes, fonts } from "../styles/typography"
import { radius } from "@colota/shared"
import type { ThemeColors } from "../types/global"
import { space } from "../constants"

type Props = RootScreenProps<"Backup & Restore">

const SEGMENT_COUNT = 4

function strengthColor(score: number, colors: ThemeColors): string {
  if (score <= 1) return colors.error
  if (score === 2) return colors.warning
  return colors.success
}

function restoreErrorMessage(e: unknown): string {
  const code = (e as { code?: string }).code
  switch (code) {
    case "E_BACKUP_WRONG_PASSWORD":
      return "Incorrect password, or the backup file is corrupted near the start."
    case "E_BACKUP_BAD_MAGIC":
      return "This file is not a Colota backup."
    case "E_BACKUP_UNSUPPORTED_SCHEMA":
      return "This backup was made with a newer version of Colota. Update the app first."
    case "E_BACKUP_UNSUPPORTED_VERSION":
    case "E_BACKUP_UNSUPPORTED_KDF":
      return "This backup was made with a different version of Colota."
    case "E_BACKUP_INTEGRITY_FAIL":
      return "The backup file is corrupted."
    case "E_BACKUP_TRUNCATED":
      return "The backup file is incomplete."
    case "E_BACKUP_TAMPERED":
      return "The backup file has been modified or is corrupted."
    case "E_BACKUP_MISSING_ENTRY":
      return "The backup file is missing required data."
    case "E_BACKUP_SECRETS_PARTIAL":
      return "Your data was restored, but stored credentials could not be applied. Re-enter them in Connection settings."
    case "E_BUSY":
      return "Another backup or restore is already in progress."
    default:
      return e instanceof Error ? e.message : "Unknown error"
  }
}

type PasswordFieldProps = {
  value: string
  onChangeText: (v: string) => void
  placeholder: string
  editable: boolean
  autoComplete: "password" | "new-password"
}

function PasswordField({ value, onChangeText, placeholder, editable, autoComplete }: PasswordFieldProps) {
  return (
    <TextField
      accessibilityLabel={placeholder}
      secure
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={autoComplete}
      disabled={!editable}
    />
  )
}

function PasswordPromptModal({
  visible,
  filename,
  busy,
  onSubmit,
  onCancel,
  colors
}: {
  visible: boolean
  filename: string
  busy: boolean
  onSubmit: (password: string) => void
  onCancel: () => void
  colors: ThemeColors
}) {
  const [pw, setPw] = useState("")

  useEffect(() => {
    if (!visible) {
      setPw("")
    }
  }, [visible])

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={busy ? undefined : onCancel}
    >
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Enter password</Text>
          <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            For {filename}
          </Text>
          <PasswordField
            value={pw}
            onChangeText={setPw}
            placeholder="Backup password"
            editable={!busy}
            autoComplete="password"
          />
          <View style={styles.modalButtonsRow}>
            <View style={styles.modalButton}>
              <Button title="Cancel" onPress={onCancel} disabled={busy} variant="secondary" />
            </View>
            <View style={styles.modalButton}>
              <Button
                title={busy ? "Restoring..." : "Restore"}
                onPress={() => pw && onSubmit(pw)}
                disabled={!pw || busy}
                loading={busy}
                variant="danger"
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

export function BackupRestoreScreen({}: Props) {
  const { colors } = useTheme()

  const [backupPassword, setBackupPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [busy, setBusy] = useState<"backup" | "restore" | null>(null)
  const [pendingRestore, setPendingRestore] = useState<{ uri: string; filename: string } | null>(null)

  const [strength, setStrength] = useState<PasswordStrengthResult>({ score: 0, label: "", bits: 0 })
  useEffect(() => {
    let cancelled = false
    BackupService.passwordStrength(backupPassword)
      .then((result) => {
        if (!cancelled) setStrength(result)
      })
      .catch((err) => {
        if (!cancelled) logger.warn("[BackupRestoreScreen] passwordStrength failed", err)
      })
    return () => {
      cancelled = true
    }
  }, [backupPassword])
  const passwordAcceptable = strength.bits >= MIN_BACKUP_PASSWORD_BITS
  const passwordsMatch = backupPassword === confirmPassword
  const showMismatch = confirmPassword.length > 0 && !passwordsMatch
  const canSubmitBackup = passwordAcceptable && passwordsMatch && backupPassword.length > 0

  const onCreateBackup = async () => {
    if (!canSubmitBackup) {
      showAlert("Password not ready", "Both passwords must match. Use a longer or more random password.", "warning")
      return
    }

    const acknowledged = await showConfirm({
      title: "No password recovery",
      message: "If you forget this password, the backup cannot be opened. Store it somewhere safe before continuing.",
      confirmText: "I understand",
      cancelText: "Cancel",
      destructive: true
    })
    if (!acknowledged) return

    const uri = await BackupService.pickBackupDestination()
    if (!uri) return

    setBusy("backup")
    try {
      await BackupService.createBackup(uri, backupPassword)
      setBackupPassword("")
      setConfirmPassword("")
      showAlert("Backup created", "Your encrypted backup has been written.", "success")
    } catch (e: unknown) {
      logger.error("[BackupRestoreScreen] backup failed", e)
      const message = e instanceof Error ? e.message : "Unknown error"
      showAlert("Backup failed", message, "error")
    } finally {
      setBusy(null)
    }
  }

  const onChooseBackupFile = async () => {
    const source = await BackupService.pickBackupSource()
    if (!source) return
    setPendingRestore({
      uri: source.uri,
      filename: source.displayName ?? "the selected backup"
    })
  }

  const onRestorePasswordCancel = () => {
    if (busy === "restore") return
    setPendingRestore(null)
  }

  const onRestorePasswordSubmit = async (password: string) => {
    if (!pendingRestore) return
    const { uri } = pendingRestore

    const acknowledged = await showConfirm({
      title: "Replace all data?",
      message: "Restoring will overwrite your current locations, settings and credentials. This cannot be undone.",
      confirmText: "Replace",
      cancelText: "Cancel",
      destructive: true
    })
    if (!acknowledged) return

    setBusy("restore")
    try {
      await BackupService.restoreBackup(uri, password)
      setPendingRestore(null)
      // Block on dismissal; applyRestore reloads the bridge and would wipe an unawaited alert.
      await showChoice({
        title: "Restore complete",
        message: "Your data has been restored. Tracking has been paused; re-enable it from the home screen.",
        variant: "success",
        buttons: [{ text: "Restart app", style: "primary" }]
      })
      await BackupService.applyRestore()
    } catch (e: unknown) {
      logger.error("[BackupRestoreScreen] restore failed", e)
      showAlert("Restore failed", restoreErrorMessage(e), "error")
      setPendingRestore(null)
    } finally {
      setBusy(null)
    }
  }

  const meterColor = strengthColor(strength.score, colors)

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <SectionTitle>Encrypted backup</SectionTitle>
          <Card>
            <Text style={[styles.intro, { color: colors.textSecondary }]}>
              Bundle your locations, settings and credentials into a single encrypted file you can store anywhere.
            </Text>

            <Text style={[styles.fieldLabel, { color: colors.text }]}>Password</Text>
            <PasswordField
              value={backupPassword}
              onChangeText={setBackupPassword}
              placeholder={`At least ${MIN_BACKUP_PASSWORD_LENGTH} characters`}
              editable={busy === null}
              autoComplete="new-password"
            />
            {backupPassword.length > 0 && (
              <View style={styles.strengthRow}>
                <View style={styles.strengthBar}>
                  {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.strengthSegment,
                        {
                          backgroundColor: i < strength.score ? meterColor : colors.borderLight
                        }
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.strengthLabel, { color: meterColor }]}>{strength.label}</Text>
              </View>
            )}

            <Text style={[styles.fieldLabel, { color: colors.text }]}>Confirm password</Text>
            <PasswordField
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Re-enter the same password"
              editable={busy === null}
              autoComplete="new-password"
            />
            {showMismatch && <Text style={[styles.errorText, { color: colors.error }]}>Passwords do not match.</Text>}

            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              A random password from a password manager or a long passphrase is safest. Common words and phrases are
              easy to crack. There is no recovery if forgotten.
            </Text>
            <Button
              title={busy === "backup" ? "Creating backup..." : "Create backup"}
              onPress={onCreateBackup}
              disabled={busy !== null || !canSubmitBackup}
              loading={busy === "backup"}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>Restore from backup</SectionTitle>
          <Card>
            <Text style={[styles.intro, { color: colors.textSecondary }]}>
              Replace all current data with a previous .colota backup file. You'll be asked for the backup password
              after choosing the file.
            </Text>
            <Button title="Choose backup file" onPress={onChooseBackupFile} disabled={busy !== null} variant="danger" />
          </Card>
        </View>
      </ScrollView>
      <PasswordPromptModal
        visible={pendingRestore !== null}
        filename={pendingRestore?.filename ?? ""}
        busy={busy === "restore"}
        onSubmit={onRestorePasswordSubmit}
        onCancel={onRestorePasswordCancel}
        colors={colors}
      />
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingBottom: 40
  },
  section: {
    marginTop: space.xl
  },
  intro: {
    marginBottom: space.md,
    fontSize: fontSizes.body,
    lineHeight: 20
  },
  fieldLabel: {
    fontSize: fontSizes.body,
    fontWeight: "500",
    marginBottom: space.sm
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.sm,
    marginBottom: space.sm
  },
  inputField: {
    flex: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: fontSizes.label
  },
  eyeButton: {
    paddingHorizontal: space.md,
    paddingVertical: space.md
  },
  strengthRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: space.md,
    gap: space.sm
  },
  strengthBar: {
    flex: 1,
    flexDirection: "row",
    gap: space.xs
  },
  strengthSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2
  },
  strengthLabel: {
    fontSize: fontSizes.caption,
    fontWeight: "600",
    minWidth: 60,
    textAlign: "right"
  },
  errorText: {
    fontSize: fontSizes.caption,
    marginTop: -4,
    marginBottom: space.sm
  },
  hint: {
    fontSize: fontSizes.caption,
    lineHeight: 18,
    marginTop: space.sm,
    marginBottom: space.lg
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: space.lg
  },
  modalCard: {
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1
  },
  modalTitle: {
    fontSize: fontSizes.label,
    ...fonts.semiBold,
    marginBottom: space.xs
  },
  modalSubtitle: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    marginBottom: space.lg
  },
  modalButtonsRow: {
    flexDirection: "row",
    gap: space.md,
    marginTop: space.xs
  },
  modalButton: {
    flex: 1
  }
})
