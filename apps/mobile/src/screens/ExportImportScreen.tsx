/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useRef, useState } from "react"
import { DeviceEventEmitter, ScrollView, StyleSheet, Text, View } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { Archive, CalendarRange, Clock, Download, HardDrive, MapPin, Upload } from "lucide-react-native"
import {
  Button,
  Card,
  Container,
  Divider,
  ExportFormatDialog,
  FieldMessage,
  ListItem,
  LoadingOverlay,
  SectionTitle,
  SettingRow,
  StateLine,
  StatRow,
  Toggle
} from "../components"
import { useTheme } from "../hooks/useTheme"
import NativeLocationService from "../services/NativeLocationService"
import ImportService, { type ImportPreview } from "../services/ImportService"
import { showAlert, showConfirm } from "../services/modalService"
import { logger } from "../utils/logger"
import { type ExportFormat } from "../utils/exportConverters"
import { FILE_FORMATS } from "../utils/fileFormats"
import {
  autoExportSub,
  backupFirstSub,
  commitConfirm,
  commitLabel,
  emptyPreviewCopy,
  exportLine,
  exportResultLine,
  importErrorMessage,
  importSourceLine,
  previewHeadline,
  queueHint,
  SHARE_FAILED_LINE,
  skippedLine
} from "../utils/locationTransfer"
import { fonts, fontSizes, lineHeights } from "../styles/typography"
import { space } from "../constants"
import type { ScreenProps } from "../types/global"

type AutoExportStatus = Awaited<ReturnType<typeof NativeLocationService.getAutoExportStatus>>
type Busy = "export" | "parse" | "commit" | null
type Message = { text: string; failed?: boolean }

const EMPTY = { total: 0, databaseSizeMB: 0 }

export function ExportImportScreen({ navigation }: ScreenProps) {
  const { colors } = useTheme()

  const [stats, setStats] = useState(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [autoExport, setAutoExport] = useState<AutoExportStatus | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [exportMessage, setExportMessage] = useState<Message | null>(null)
  const [importMessage, setImportMessage] = useState<Message | null>(null)
  const [formatOpen, setFormatOpen] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [queued, setQueued] = useState(false)

  // A ref, not the state, because two presses inside one render both read the same state value.
  const busyRef = useRef(false)
  // The staged file lives in a native stash on a 15 minute timer. Leaving the screen frees it now.
  const stagedRef = useRef(false)

  const read = useCallback(async () => {
    const [statsResult, autoResult] = await Promise.allSettled([
      NativeLocationService.getStats(),
      NativeLocationService.getAutoExportStatus()
    ])
    if (statsResult.status === "fulfilled") {
      setStats({ total: statsResult.value.total, databaseSizeMB: statsResult.value.databaseSizeMB })
      setLoaded(true)
    } else {
      logger.error("[ExportImportScreen] Failed to read stats:", statsResult.reason)
    }
    if (autoResult.status === "fulfilled") setAutoExport(autoResult.value)
  }, [])

  useFocusEffect(
    useCallback(() => {
      read()
      const sub = DeviceEventEmitter.addListener("onLocationUpdate", read)
      return () => {
        sub.remove()
        if (stagedRef.current) {
          stagedRef.current = false
          ImportService.cancelImport().catch(() => {})
        }
      }
    }, [read])
  )

  const discard = useCallback(() => {
    stagedRef.current = false
    setPreview(null)
    setQueued(false)
    ImportService.cancelImport().catch(() => {})
  }, [])

  const handleExport = useCallback(async (format: ExportFormat) => {
    setFormatOpen(false)
    if (busyRef.current) return
    busyRef.current = true
    setBusy("export")
    setExportMessage(null)
    try {
      const result = await NativeLocationService.exportToFile(format)
      if (!result) {
        setExportMessage({ text: exportLine(0) })
        return
      }
      // Dismissed before the share sheet, which would otherwise sit over this overlay.
      setBusy(null)
      try {
        await NativeLocationService.shareFile(result.filePath, result.mimeType, `Colota export`)
        setExportMessage({ text: exportResultLine(result.rowCount, format) })
      } catch (shareError) {
        logger.warn("[ExportImportScreen] Share failed:", shareError)
        setExportMessage({ text: SHARE_FAILED_LINE, failed: true })
      }
    } catch (err) {
      logger.error("[ExportImportScreen] Export failed:", err)
      showAlert("Export failed", "The file could not be written. Try again in a moment.", "error")
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }, [])

  const handleChooseFile = useCallback(async () => {
    if (busyRef.current) return
    let source: { uri: string } | null = null
    try {
      source = await ImportService.pickImportSource()
    } catch (err) {
      logger.error("[ExportImportScreen] pickImportSource failed:", err)
      showAlert("Could not open the picker", "The system file picker did not open.", "error")
      return
    }
    if (!source) return

    busyRef.current = true
    setBusy("parse")
    setImportMessage(null)
    try {
      const staged = await ImportService.importLocationsFromFile(source.uri)
      if (staged.newRows === 0) {
        await ImportService.cancelImport().catch(() => {})
        setImportMessage({ text: emptyPreviewCopy(staged), failed: true })
        return
      }
      stagedRef.current = true
      setQueued(false)
      setPreview(staged)
    } catch (err) {
      logger.error("[ExportImportScreen] Parse failed:", err)
      setImportMessage({ text: importErrorMessage((err as { code?: string }).code), failed: true })
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }, [])

  const handleCommit = useCallback(async () => {
    if (busyRef.current || !preview) return
    if (!(await showConfirm({ ...commitConfirm(preview, queued), destructive: false }))) return

    busyRef.current = true
    setBusy("commit")
    try {
      const inserted = await ImportService.commitImport(queued)
      stagedRef.current = false
      setPreview(null)
      setQueued(false)
      setImportMessage({ text: `Imported ${inserted.toLocaleString()} locations.` })
      await read()
    } catch (err) {
      logger.error("[ExportImportScreen] Commit failed:", err)
      setImportMessage({ text: importErrorMessage((err as { code?: string }).code), failed: true })
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }, [preview, queued, read])

  const skipped = preview ? skippedLine(preview) : undefined
  const headline = preview ? previewHeadline(preview) : null
  const PreviewIcon = preview ? FILE_FORMATS[preview.format].icon : MapPin

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          What leaves this device as a file, and what comes back in from one.
        </Text>

        <View style={styles.section}>
          <SectionTitle>On this device</SectionTitle>
          <Card rows>
            <StatRow
              icon={MapPin}
              label="Locations"
              value={loaded ? stats.total.toLocaleString() : "…"}
              testID="stat-locations"
            />
            <Divider tight inset />
            <StatRow
              icon={HardDrive}
              label="Database size"
              value={loaded ? `${stats.databaseSizeMB.toFixed(2)} MB` : "…"}
              testID="stat-size"
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>Send to a file</SectionTitle>
          <View>
            <Button
              variant="secondary"
              icon={Upload}
              title="Export all locations"
              testID="export-all-btn"
              loading={busy === "export"}
              disabled={busy !== null || stats.total === 0}
              onPress={() => setFormatOpen(true)}
            />
            {/* Nothing definitive until the first read lands, or the line claims an empty database
                for as long as the count takes. */}
            {exportMessage || loaded ? (
              <FieldMessage variant={exportMessage?.failed ? "error" : "info"}>
                {exportMessage?.text ?? exportLine(stats.total)}
              </FieldMessage>
            ) : null}
          </View>

          <Card rows style={styles.afterButton}>
            <ListItem
              testID="nav-location-history"
              icon={CalendarRange}
              label="Export a day or a trip"
              sub="History exports one day, or the trips you pick."
              subLines={2}
              onPress={() => navigation.navigate("Location History")}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-auto-export"
              icon={Clock}
              label="Automatic export"
              sub={autoExportSub(autoExport)}
              subLines={2}
              onPress={() => navigation.navigate("Auto-Export")}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>Bring in from a file</SectionTitle>
          <Card rows>
            <ListItem
              testID="nav-backup-restore"
              icon={Archive}
              label="Back up first"
              sub={backupFirstSub()}
              subLines={2}
              onPress={() => navigation.navigate("Backup & Restore")}
            />
          </Card>

          {preview && headline ? (
            <>
              <Card rows style={styles.afterButton}>
                <StateLine
                  icon={PreviewIcon}
                  iconColor={colors.primary}
                  label={headline.label}
                  caption={headline.caption}
                  testID="preview-state"
                />
                {preview.canQueueForSync && (
                  <>
                    <Divider tight />
                    <SettingRow label="Also queue for upload" hint={queueHint(preview.newRows)}>
                      <Toggle
                        value={queued}
                        onValueChange={setQueued}
                        accessibilityLabel="Also queue for upload"
                        testID="queue-toggle"
                      />
                    </SettingRow>
                  </>
                )}
              </Card>
              {skipped ? <FieldMessage>{skipped}</FieldMessage> : null}
              <Button
                variant="primary"
                icon={Download}
                title={commitLabel(preview.newRows, queued)}
                testID="import-commit-btn"
                loading={busy === "commit"}
                disabled={busy !== null}
                onPress={handleCommit}
              />
              <Button variant="ghost" title="Discard" testID="import-discard-btn" onPress={discard} />
            </>
          ) : (
            <View>
              <Button
                variant="secondary"
                icon={Download}
                title="Choose a file"
                testID="import-file-btn"
                loading={busy === "parse"}
                disabled={busy !== null}
                onPress={handleChooseFile}
              />
              <FieldMessage variant={importMessage?.failed ? "warning" : "info"}>
                {importMessage?.text ?? importSourceLine()}
              </FieldMessage>
            </View>
          )}
        </View>
      </ScrollView>

      <ExportFormatDialog
        visible={formatOpen}
        title="Export format"
        message={`All ${stats.total.toLocaleString()} locations, oldest first.`}
        onSelect={handleExport}
        onRequestClose={() => setFormatOpen(false)}
      />
      <LoadingOverlay
        visible={busy === "export" || busy === "commit"}
        title={busy === "export" ? "Exporting" : "Importing"}
        message={
          busy === "commit" && preview
            ? `${preview.newRows.toLocaleString()} locations. Recording waits until this finishes.`
            : `${stats.total.toLocaleString()} locations.`
        }
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
  afterButton: {
    marginTop: space.md
  }
})
