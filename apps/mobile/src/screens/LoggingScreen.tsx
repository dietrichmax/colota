/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useRef, useState } from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { FileSearch, Save, Trash2 } from "lucide-react-native"
import {
  Button,
  Card,
  Container,
  Divider,
  FieldMessage,
  ListItem,
  SectionTitle,
  SettingRow,
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
  CAPTURE_HINT,
  deleteConfirmMessage,
  deleteSub,
  describeCapture,
  LOG_CONTENTS_LINE,
  nextStepLine,
  previewRowSub
} from "../utils/logCapture"
import { fonts, fontSizes, lineHeights } from "../styles/typography"
import { LOG_SIZE_SETTLE_MS, space } from "../constants"
import type { ScreenProps } from "../types/global"

type Busy = "save" | "delete" | null

const INTRO = "Start recording, reproduce the problem, then save the log file and attach it to your report."

export function LoggingScreen({ navigation }: ScreenProps) {
  const { colors } = useTheme()
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
        showAlert("Could not change logging", "The setting was not saved. Try again.", "error")
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
    if (!(await showConfirm({ title: "Save the log file?", message: LOG_CONTENTS_LINE, confirmText: "Choose folder" })))
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
        showAlert("Log saved", "The file is in the folder you chose. Attach it to your report.", "success")
      } else {
        showAlert("Nothing to save", "There are no recorded log entries yet.", "info")
      }
    } catch (err) {
      logger.error("[LoggingScreen] save failed:", err)
      showAlert("Could not save the log", err instanceof Error ? err.message : "Pick a different folder.", "error")
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }, [startedAt])

  const handleDelete = useCallback(async () => {
    if (busyRef.current) return
    if (
      !(await showConfirm({
        title: "Delete the log file?",
        message: deleteConfirmMessage(bytes),
        confirmText: "Delete",
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
      showAlert("Could not delete the log", "The file is still there. Try again.", "error")
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }, [bytes, read])

  const state = describeCapture(enabled, bytes, startedAt)

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>{INTRO}</Text>

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
                <SettingRow label="Record a log file" hint={CAPTURE_HINT}>
                  <Toggle
                    accessibilityLabel="Record a log file"
                    value={enabled}
                    onValueChange={handleToggle}
                    testID="file-logging-toggle"
                  />
                </SettingRow>
                <Divider tight />
                <ListItem
                  icon={FileSearch}
                  label="Read the log"
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
                <SectionTitle>The log file</SectionTitle>
                <View>
                  <Button
                    icon={Save}
                    title="Save log file…"
                    testID="save-log-btn"
                    loading={busy === "save"}
                    disabled={busy !== null}
                    onPress={handleSave}
                  />
                  <FieldMessage variant="warning">{LOG_CONTENTS_LINE}</FieldMessage>
                </View>
                <View>
                  <Button
                    icon={Trash2}
                    variant="danger"
                    title="Delete the log file"
                    testID="delete-log-btn"
                    loading={busy === "delete"}
                    disabled={busy !== null}
                    onPress={handleDelete}
                  />
                  <FieldMessage>{deleteSub(bytes, enabled)}</FieldMessage>
                </View>
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
  intro: {
    fontSize: fontSizes.body,
    ...fonts.regular,
    lineHeight: lineHeights.body,
    marginBottom: space.lg
  },
  section: {
    marginBottom: space.xl
  }
})
