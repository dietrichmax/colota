/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useRef, useState } from "react"
import { ScrollView, StyleSheet, View } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { FileSearch, FileText, FileX, Trash2, Upload } from "lucide-react-native"
import {
  Card,
  Container,
  Divider,
  FieldMessage,
  ListItem,
  SectionTitle,
  SettingRow,
  SpinningLoader,
  StateLine,
  Toggle
} from "../components"
import { useTheme } from "../hooks/useTheme"
import { useTimeout } from "../hooks/useTimeout"
import NativeLocationService from "../services/NativeLocationService"
import { showAlert, showConfirm } from "../services/modalService"
import { logger } from "../utils/logger"
import { buildAppLog, buildExportHeader } from "../utils/logExport"
import {
  captureHint,
  deleteConfirmMessage,
  deleteSub,
  describeCapture,
  logContentsLine,
  nextStepLine,
  previewRowSub
} from "../utils/logCapture"
import { LOG_SIZE_SETTLE_MS, space } from "../constants"
import type { ScreenProps } from "../types/global"
import { useTranslation } from "../i18n/useTranslation"
// Handlers use the non-hook t, so no callback list carries it.
import { t as translate } from "../i18n/t"

type Busy = "save" | "delete" | null

export function LoggingScreen({ navigation }: ScreenProps) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const settle = useTimeout()

  const [enabled, setEnabled] = useState(false)
  const [bytes, setBytes] = useState(0)
  const [startedAt, setStartedAt] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)

  // A ref, not the state, because two presses inside one render both read the same state value.
  const busyRef = useRef(false)

  const read = useCallback(async () => {
    const [enabledResult, sizeResult, startedResult] = await Promise.allSettled([
      NativeLocationService.getSetting("debugFileLoggingEnabled", "false"),
      NativeLocationService.getFileLogSize(),
      NativeLocationService.getSetting("debugFileLoggingStartedAt", "")
    ])
    if (enabledResult.status === "fulfilled") setEnabled(enabledResult.value === "true")
    if (sizeResult.status === "fulfilled") setBytes(sizeResult.value)
    if (startedResult.status === "fulfilled") setStartedAt(Number(startedResult.value ?? 0) || 0)
    setLoaded(true)
  }, [])

  useFocusEffect(
    useCallback(() => {
      read()
    }, [read])
  )

  const handleToggle = useCallback(
    async (value: boolean) => {
      setEnabled(value)
      try {
        await NativeLocationService.setFileLoggingEnabled(value)
      } catch (err) {
        logger.error("[LoggingScreen] setFileLoggingEnabled failed:", err)
        setEnabled(!value)
        showAlert(translate("logging.changeFailed.title"), translate("logging.changeFailed.message"), "error")
        return
      }
      // Native stamps the start and the first lines land off-thread, so read once it settles.
      settle.set(() => {
        read()
      }, LOG_SIZE_SETTLE_MS)
    },
    [read, settle]
  )

  const handleSave = useCallback(async () => {
    if (busyRef.current) return
    if (
      !(await showConfirm({
        title: translate("logging.save.title"),
        message: logContentsLine(),
        confirmText: translate("logging.save.confirm")
      }))
    )
      return

    const treeUri = await NativeLocationService.pickExportDirectory()
    if (!treeUri) return

    busyRef.current = true
    setBusy("save")
    try {
      const buildConfig = NativeLocationService.getBuildConfig()
      let deviceInfo = null
      try {
        const info = await NativeLocationService.getDeviceInfo()
        deviceInfo = { ...info, apiLevel: String(info.apiLevel) }
      } catch {
        // The header names what it can; a missing device block must not fail the save.
      }
      const header = buildExportHeader(buildConfig, deviceInfo, startedAt, Date.now())
      const written = await NativeLocationService.exportFileLogToUri(treeUri, header, buildAppLog())
      if (written) {
        showAlert(translate("logging.saved.title"), translate("logging.saved.message"), "success")
      } else {
        showAlert(translate("logging.nothing.title"), translate("logging.nothing.message"), "info")
      }
    } catch (err) {
      logger.error("[LoggingScreen] save failed:", err)
      showAlert(
        translate("logging.saveFailed.title"),
        err instanceof Error ? err.message : translate("logging.saveFailed.message"),
        "error"
      )
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }, [startedAt])

  const handleDelete = useCallback(async () => {
    if (busyRef.current) return
    if (
      !(await showConfirm({
        title: translate("logging.delete.title"),
        message: deleteConfirmMessage(bytes),
        confirmText: translate("common.delete"),
        destructive: true
      }))
    ) {
      return
    }
    busyRef.current = true
    setBusy("delete")
    try {
      await NativeLocationService.clearFileLog()
      await read()
    } catch (err) {
      logger.error("[LoggingScreen] clearFileLog failed:", err)
      showAlert(translate("logging.deleteFailed.title"), translate("logging.deleteFailed.message"), "error")
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }, [bytes, read])

  const state = describeCapture(enabled, bytes, startedAt)

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {!loaded ? null : (
          <>
            <View style={styles.section}>
              <Card rows>
                <StateLine
                  icon={state.icon}
                  iconColor={state.tone === "recording" ? colors.primary : colors.textSecondary}
                  label={state.label}
                  caption={state.caption}
                  testID="capture-state"
                />
                <Divider tight />
                <SettingRow label={t("logging.record")} hint={captureHint()}>
                  <Toggle
                    accessibilityLabel={t("logging.record")}
                    value={enabled}
                    onValueChange={handleToggle}
                    testID="file-logging-toggle"
                  />
                </SettingRow>
                <Divider tight />
                <ListItem
                  icon={FileSearch}
                  label={t("logging.read")}
                  sub={previewRowSub(enabled)}
                  subLines={2}
                  onPress={() => navigation.navigate("Log Preview")}
                  testID="nav-log-preview"
                />
              </Card>
              {bytes === 0 ? <FieldMessage>{nextStepLine(enabled)}</FieldMessage> : null}
            </View>

            {bytes > 0 ? (
              <View style={styles.section}>
                <SectionTitle>{t("logging.section.file")}</SectionTitle>
                <Card rows>
                  <ListItem
                    testID="save-log-row"
                    icon={FileText}
                    trailingIcon={busy === "save" ? SpinningLoader : Upload}
                    label={t("logging.saveRow")}
                    sub={busy === "save" ? t("logging.saving") : t("logging.saveRow.sub")}
                    accessibilityHint={t("logging.saveRow.hint")}
                    disabled={busy === "save" ? false : busy !== null}
                    onPress={handleSave}
                  />
                  <Divider tight inset />
                  <ListItem
                    testID="delete-log-row"
                    icon={FileX}
                    trailingIcon={busy === "delete" ? SpinningLoader : Trash2}
                    label={t("logging.deleteRow")}
                    sub={busy === "delete" ? t("logging.deleting") : deleteSub(bytes, enabled)}
                    subLines={2}
                    accessibilityHint={t("data.confirmThenDelete")}
                    disabled={busy === "delete" ? false : busy !== null}
                    onPress={handleDelete}
                  />
                </Card>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.xxl
  },
  section: {
    marginBottom: space.xl
  }
})
