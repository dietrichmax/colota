/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useRef, useState } from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { Archive, ArchiveX, Download, FileLock, Upload } from "lucide-react-native"
import {
  Button,
  Card,
  Container,
  Divider,
  FieldMessage,
  LoadingOverlay,
  SectionTitle,
  StateLine,
  TextField
} from "../components"
import { useTheme } from "../hooks/useTheme"
import BackupService, { type BackupManifest, type PasswordStrengthResult } from "../services/BackupService"
import NativeLocationService from "../services/NativeLocationService"
import { showChoice, showConfirm } from "../services/modalService"
import { logger } from "../utils/logger"
import {
  archiveLine,
  backupErrorMessage,
  backupScopeLine,
  backupState,
  BACKUP_WRITTEN_LINE,
  NO_RECOVERY_LINE,
  OPEN_FILE_LINE,
  passwordLine,
  PASSWORD_HINT_LINE,
  PICKED_NOT_OPENED_CAPTION,
  restoreCaveat,
  restoreConfirm,
  restoreErrorMessage,
  RESTORE_IDLE_LINE,
  restoreOutcome,
  submitBlockedReason
} from "../utils/backupState"
import { fonts, fontSizes, lineHeights } from "../styles/typography"
import { space } from "../constants"
import type { ScreenProps } from "../types/global"

type Busy = "backup" | "open" | "restore" | null
type Picked = { uri: string; displayName: string }
type Message = { text: string; tone?: "warning" | "error" }

const EMPTY_STRENGTH: PasswordStrengthResult = { score: 0, label: "", bits: 0 }
const EMPTY_STATS = { total: 0, databaseSizeMB: 0 }

export function BackupRestoreScreen({}: ScreenProps) {
  const { colors } = useTheme()

  const [stats, setStats] = useState(EMPTY_STATS)
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null)
  const [hasClientCert, setHasClientCert] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [strength, setStrength] = useState<PasswordStrengthResult>(EMPTY_STRENGTH)
  const [strengthFailed, setStrengthFailed] = useState(false)
  const [backupMessage, setBackupMessage] = useState<Message | null>(null)

  const [picked, setPicked] = useState<Picked | null>(null)
  const [restorePassword, setRestorePassword] = useState("")
  const [manifest, setManifest] = useState<BackupManifest | null>(null)
  const [restoreMessage, setRestoreMessage] = useState<Message | null>(null)
  const [busy, setBusy] = useState<Busy>(null)

  // A ref, not the state, because two presses inside one render both read the same state value.
  const busyRef = useRef(false)

  const read = useCallback(async () => {
    const [statsResult, lastResult, certResult] = await Promise.allSettled([
      NativeLocationService.getStats(),
      NativeLocationService.getSetting("last_backup_at"),
      NativeLocationService.getClientCertInfo()
    ])
    if (statsResult.status === "fulfilled") {
      setStats({ total: statsResult.value.total, databaseSizeMB: statsResult.value.databaseSizeMB })
      setLoaded(true)
    }
    if (lastResult.status === "fulfilled") setLastBackupAt(Number(lastResult.value ?? 0) || null)
    if (certResult.status === "fulfilled") setHasClientCert(certResult.value !== null)
  }, [])

  useFocusEffect(
    useCallback(() => {
      read()
    }, [read])
  )

  const scoreDraft = useCallback(async (next: string) => {
    setPassword(next)
    try {
      setStrength(await BackupService.passwordStrength(next))
      setStrengthFailed(false)
    } catch (err) {
      logger.warn("[BackupRestoreScreen] passwordStrength failed", err)
      setStrengthFailed(true)
    }
  }, [])

  const blocked = submitBlockedReason(password, confirm, strength)

  const onCreateBackup = useCallback(async () => {
    if (busyRef.current || blocked) return
    if (
      !(await showConfirm({
        title: "You cannot reset this password",
        message: `${NO_RECOVERY_LINE} Store it somewhere you can reach without this phone.`,
        confirmText: "I have stored it",
        destructive: false
      }))
    ) {
      return
    }

    const uri = await BackupService.pickBackupDestination()
    if (!uri) return

    busyRef.current = true
    setBusy("backup")
    setBackupMessage(null)
    try {
      await BackupService.createBackup(uri, password)
      const now = Date.now()
      await NativeLocationService.saveSetting("last_backup_at", String(now)).catch(() => {})
      setLastBackupAt(now)
      setPassword("")
      setConfirm("")
      setStrength(EMPTY_STRENGTH)
      setBackupMessage({ text: BACKUP_WRITTEN_LINE })
    } catch (e) {
      logger.error("[BackupRestoreScreen] backup failed", e)
      const err = e as { code?: string; message?: string }
      setBackupMessage({ text: backupErrorMessage(err.code, err.message), tone: "error" })
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }, [blocked, password])

  const onChooseFile = useCallback(async () => {
    if (busyRef.current) return
    const source = await BackupService.pickBackupSource()
    if (!source) return
    setPicked({ uri: source.uri, displayName: source.displayName ?? "the file you chose" })
    setManifest(null)
    setRestorePassword("")
    setRestoreMessage(null)
  }, [])

  const onOpenFile = useCallback(async () => {
    if (busyRef.current || !picked) return
    busyRef.current = true
    setBusy("open")
    setRestoreMessage(null)
    try {
      setManifest(await BackupService.describeBackup(picked.uri, restorePassword))
    } catch (e) {
      logger.error("[BackupRestoreScreen] describeBackup failed", e)
      const err = e as { code?: string; message?: string }
      setRestoreMessage({ text: restoreErrorMessage(err.code, err.message), tone: "error" })
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }, [picked, restorePassword])

  const onRestore = useCallback(async () => {
    if (busyRef.current || !picked || !manifest) return
    busyRef.current = true
    setBusy("restore")
    let outcome
    try {
      const fresh = await NativeLocationService.getStats()
      if (!(await showConfirm({ ...restoreConfirm(fresh.total, manifest), destructive: true }))) return
      await BackupService.restoreBackup(picked.uri, restorePassword)
      outcome = restoreOutcome(undefined)
    } catch (e) {
      logger.error("[BackupRestoreScreen] restore failed", e)
      const err = e as { code?: string; message?: string }
      outcome = restoreOutcome(err.code, err.message)
    } finally {
      busyRef.current = false
      setBusy(null)
    }

    if (!outcome) return
    if (outcome.kind === "failed") {
      setRestoreMessage({ text: outcome.message, tone: "error" })
      return
    }
    // Blocking: applyRestore reloads the bridge and would tear down an unawaited dialog.
    await showChoice({
      title: outcome.title,
      message: outcome.message,
      variant: outcome.variant === "warning" ? "warning" : "success",
      buttons: [{ text: "Restart app", style: "primary" }]
    })
    // The row lives in the settings table, so it arrived from inside the archive and is one backup stale.
    const madeAt = Date.parse(manifest.createdAt)
    if (Number.isFinite(madeAt)) {
      await NativeLocationService.saveSetting("last_backup_at", String(madeAt)).catch(() => {})
    }
    await BackupService.applyRestore()
  }, [picked, manifest, restorePassword])

  const opening = backupState(lastBackupAt, stats)
  const caveat = manifest ? restoreCaveat(hasClientCert, manifest) : null
  const pwLine = passwordLine(strength, strengthFailed)

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          One encrypted file holding everything this device has recorded and everything it is set up to do.
        </Text>

        {loaded && (
          <Card rows style={styles.section}>
            <StateLine
              icon={opening.tone === "ok" ? Archive : ArchiveX}
              iconColor={
                opening.tone === "ok" ? colors.primary : opening.tone === "none" ? colors.warning : colors.textSecondary
              }
              label={opening.label}
              caption={opening.caption}
              testID="backup-state"
            />
          </Card>
        )}

        <View style={styles.section}>
          <SectionTitle>Make a backup</SectionTitle>
          <Card>
            <View style={styles.fields}>
              <View>
                <TextField
                  label="Password"
                  secure
                  testID="backup-password"
                  value={password}
                  onChangeText={scoreDraft}
                  autoCapitalize="none"
                  autoCorrect={false}
                  disabled={busy !== null}
                />
                <FieldMessage variant={password.length > 0 ? pwLine.variant : "info"}>
                  {password.length > 0 ? pwLine.text : PASSWORD_HINT_LINE}
                </FieldMessage>
              </View>
              <View>
                <TextField
                  label="Confirm password"
                  secure
                  testID="backup-password-confirm"
                  value={confirm}
                  onChangeText={setConfirm}
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={confirm.length > 0 && confirm !== password ? "The two passwords do not match." : undefined}
                  disabled={busy !== null}
                />
                {!(confirm.length > 0 && confirm !== password) && <FieldMessage>{NO_RECOVERY_LINE}</FieldMessage>}
              </View>
            </View>
          </Card>
          <Button
            variant="primary"
            icon={Upload}
            title="Create backup"
            testID="create-backup-btn"
            loading={busy === "backup"}
            disabled={busy !== null || blocked !== null}
            onPress={onCreateBackup}
          />
          <FieldMessage variant={backupMessage?.tone === "error" ? "error" : "info"}>
            {backupMessage?.text ?? blocked ?? backupScopeLine(stats.total, hasClientCert)}
          </FieldMessage>
        </View>

        <View style={styles.section}>
          <SectionTitle>Restore from a backup</SectionTitle>

          {!picked && (
            <View>
              <Button
                variant="secondary"
                icon={Download}
                title="Choose a backup file"
                testID="choose-backup-btn"
                disabled={busy !== null}
                onPress={onChooseFile}
              />
              <FieldMessage>{RESTORE_IDLE_LINE}</FieldMessage>
            </View>
          )}

          {picked && !manifest && (
            <>
              <Card>
                <StateLine
                  icon={FileLock}
                  iconColor={colors.textSecondary}
                  label={picked.displayName}
                  caption={PICKED_NOT_OPENED_CAPTION}
                  testID="picked-file"
                />
                <Divider tight />
                <View style={styles.pickedField}>
                  <TextField
                    label="Backup password"
                    secure
                    testID="restore-password"
                    value={restorePassword}
                    onChangeText={setRestorePassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    error={restoreMessage?.tone === "error" ? restoreMessage.text : undefined}
                    disabled={busy !== null}
                  />
                </View>
              </Card>
              <Button
                variant="secondary"
                title="Open this file"
                testID="open-backup-btn"
                loading={busy === "open"}
                disabled={busy !== null || restorePassword.length === 0}
                onPress={onOpenFile}
              />
              <Button
                variant="ghost"
                title="Choose a different file"
                testID="repick-backup-btn"
                onPress={onChooseFile}
              />
              <FieldMessage>{OPEN_FILE_LINE}</FieldMessage>
            </>
          )}

          {picked && manifest && (
            <>
              <Card rows>
                <StateLine
                  icon={Archive}
                  iconColor={colors.primary}
                  label={archiveLine(manifest).label}
                  caption={archiveLine(manifest).caption}
                  testID="archive-state"
                />
              </Card>
              {caveat && <FieldMessage variant="warning">{caveat}</FieldMessage>}
              <Button
                variant="danger"
                title="Replace all data"
                testID="restore-btn"
                loading={busy === "restore"}
                disabled={busy !== null}
                onPress={onRestore}
              />
              <Button
                variant="ghost"
                title="Choose a different file"
                testID="repick-backup-btn"
                onPress={onChooseFile}
              />
              {restoreMessage?.tone === "error" && <FieldMessage variant="error">{restoreMessage.text}</FieldMessage>}
            </>
          )}
        </View>
      </ScrollView>

      <LoadingOverlay
        visible={busy === "backup" || busy === "open" || busy === "restore"}
        title={busy === "backup" ? "Writing the backup" : busy === "open" ? "Opening the backup" : "Restoring"}
        message={busy === "restore" ? "Keep Colota open until this finishes." : ""}
      />
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl
  },
  intro: {
    fontSize: fontSizes.body,
    ...fonts.regular,
    lineHeight: lineHeights.body,
    marginBottom: space.lg
  },
  section: {
    marginBottom: space.xl
  },
  fields: {
    gap: space.lg
  },
  pickedField: {
    paddingTop: space.lg
  }
})
