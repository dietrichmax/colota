/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useEffect, useRef, useState } from "react"
import { DeviceEventEmitter, ScrollView, StyleSheet, View } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { Archive, CalendarRange, Clock, Download, FileText, HardDrive, MapPin, Upload } from "lucide-react-native"
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
  SpinningLoader,
  StateLine,
  StatRow,
  Toggle
} from "../components"
import { useTheme } from "../hooks/useTheme"
import NativeLocationService from "../services/NativeLocationService"
import ImportService, { type ImportPreview } from "../services/ImportService"
import { showAlert, showConfirm } from "../services/modalService"
import { logger } from "../utils/logger"
import { formatBytes } from "../utils/format"
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
  exportRowSub,
  importErrorMessage,
  importRowSub,
  previewHeadline,
  queueHint,
  SHARE_FAILED_LINE,
  skippedLine
} from "../utils/locationTransfer"
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
  const busyRef = useRef<Busy>(null)
  // Released on unmount, not on blur, so opening Backup & Restore from the preview keeps the staged file.
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
      return () => sub.remove()
    }, [read])
  )

  useEffect(
    () => () => {
      if (stagedRef.current || busyRef.current === "parse") ImportService.cancelImport().catch(() => {})
    },
    []
  )

  const dropStaged = useCallback(() => {
    stagedRef.current = false
    setPreview(null)
    setQueued(false)
  }, [])

  const discard = useCallback(() => {
    dropStaged()
    setImportMessage(null)
    ImportService.cancelImport().catch(() => {})
  }, [dropStaged])

  const handleExport = useCallback(async (format: ExportFormat) => {
    setFormatOpen(false)
    if (busyRef.current !== null) return
    busyRef.current = "export"
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
      busyRef.current = null
      setBusy(null)
    }
  }, [])

  const handleChooseFile = useCallback(async () => {
    if (busyRef.current !== null) return
    let source: { uri: string } | null = null
    try {
      source = await ImportService.pickImportSource()
    } catch (err) {
      logger.error("[ExportImportScreen] pickImportSource failed:", err)
      showAlert("Could not open the picker", "The system file picker did not open.", "error")
      return
    }
    if (!source || busyRef.current !== null) return

    busyRef.current = "parse"
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
      busyRef.current = null
      setBusy(null)
    }
  }, [])

  const handleCommit = useCallback(async () => {
    if (busyRef.current !== null || !preview) return
    if (!(await showConfirm({ ...commitConfirm(preview, queued), destructive: false }))) return

    busyRef.current = "commit"
    setBusy("commit")
    try {
      const inserted = await ImportService.commitImport(queued)
      dropStaged()
      setImportMessage({ text: `Imported ${inserted.toLocaleString()} locations.` })
      await read()
    } catch (err) {
      logger.error("[ExportImportScreen] Commit failed:", err)
      const code = (err as { code?: string }).code
      // The native stash expired, so the staged card can only fail again.
      if (code === "E_IMPORT_NO_PENDING") dropStaged()
      setImportMessage({ text: importErrorMessage(code), failed: true })
    } finally {
      busyRef.current = null
      setBusy(null)
    }
  }, [preview, queued, read, dropStaged])

  const skipped = preview ? skippedLine(preview) : undefined
  const headline = preview ? previewHeadline(preview) : null
  const PreviewIcon = preview ? FILE_FORMATS[preview.format].icon : MapPin

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
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
              value={loaded ? formatBytes(stats.databaseSizeMB * 1024 * 1024, { decimals: 0 }) : "…"}
              testID="stat-size"
            />
          </Card>
        </View>

        <View style={styles.section}>
          <SectionTitle>Export</SectionTitle>
          <Card rows>
            {/* Before the first stats read the total is 0, which would read as nothing to export. */}
            <ListItem
              testID="export-all-row"
              icon={MapPin}
              trailingIcon={Upload}
              label="Export all locations"
              sub={loaded ? exportRowSub(stats.total) : undefined}
              accessibilityHint="Picks a format, then hands the file to another app"
              disabled={busy !== null || stats.total === 0}
              onPress={() => setFormatOpen(true)}
            />
            <Divider tight inset />
            <ListItem
              testID="nav-location-history"
              icon={CalendarRange}
              label="Export a day or a trip"
              sub="From History"
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
          {exportMessage ? (
            <FieldMessage variant={exportMessage.failed ? "error" : "info"}>{exportMessage.text}</FieldMessage>
          ) : null}
        </View>

        <View style={styles.section}>
          <SectionTitle>Import</SectionTitle>
          {preview && headline ? (
            <>
              <Card rows>
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
                <Divider tight />
                <ListItem
                  testID="nav-backup-restore"
                  icon={Archive}
                  label="Back up first"
                  sub={backupFirstSub()}
                  subLines={2}
                  onPress={() => navigation.navigate("Backup & Restore")}
                />
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
            <Card rows>
              <ListItem
                testID="import-file-row"
                icon={FileText}
                trailingIcon={busy === "parse" ? SpinningLoader : Download}
                label="Import a file"
                sub={importRowSub(busy === "parse")}
                subLines={2}
                accessibilityHint="Opens the file picker"
                disabled={busy === "parse" ? false : busy !== null}
                onPress={handleChooseFile}
              />
            </Card>
          )}
          {importMessage ? (
            <FieldMessage variant={importMessage.failed ? "warning" : "info"}>{importMessage.text}</FieldMessage>
          ) : null}
        </View>
      </ScrollView>

      <ExportFormatDialog
        visible={formatOpen}
        title="Export format"
        message={exportLine(stats.total)}
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
  section: {
    marginBottom: space.xl
  }
})
