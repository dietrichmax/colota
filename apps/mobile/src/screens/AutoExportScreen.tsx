/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useCallback, useEffect } from "react"
import { useFocusEffect } from "@react-navigation/native"
import { ActivityIndicator, Text, StyleSheet, View, ScrollView, Pressable, DeviceEventEmitter } from "react-native"
import { FolderOpen, CircleCheckBig, Share2, TriangleAlert } from "lucide-react-native"
import {
  Button,
  Card,
  ChipGroup,
  Container,
  Divider,
  FloatingSaveIndicator,
  ExportFormatDialog,
  ListItem,
  NumericInput,
  RadioRow,
  SectionTitle,
  SettingRow,
  TimePicker,
  Toggle,
  TextField
} from "../components"
import { useTheme } from "../hooks/useTheme"

import { ScreenProps } from "../types/global"
import NativeLocationService from "../services/NativeLocationService"
import {
  ExportFormat,
  EXPORT_FORMATS,
  DEFAULT_FILENAME_TEMPLATE,
  FILENAME_TOKENS,
  filenameTokenValues,
  isValidFilenameTemplate,
  renderFilenamePreview
} from "../utils/exportConverters"
import { fontSizes, fonts, lineHeights } from "../styles/typography"
import { FILE_FORMATS } from "../utils/fileFormats"
import { logger } from "../utils/logger"
import { formatExportDateTime, formatBytes } from "../utils/format"
import { showAlert } from "../services/modalService"
import { size, space, STATE_LAYER_ALPHA } from "../constants"
import { useTranslation } from "../i18n/useTranslation"
// Alerts in handlers and effects use the non-hook t, so a language change never re-runs them.
import { t as translate } from "../i18n/t"
import type { TranslationKey } from "../i18n/options"

type ExportInterval = "daily" | "weekly" | "monthly"
type ExportMode = "all" | "incremental"

type ExportFile = {
  name: string
  size: number
  lastModified: number
  uri: string
}

const INTERVALS: readonly ExportInterval[] = ["daily", "weekly", "monthly"]

const MODE_OPTIONS: { key: ExportMode; labelKey: TranslationKey; subKey: TranslationKey }[] = [
  { key: "all", labelKey: "autoExport.mode.all", subKey: "autoExport.mode.all.sub" },
  { key: "incremental", labelKey: "autoExport.mode.incremental", subKey: "autoExport.mode.incremental.sub" }
]

// ISO weekday Mon=1..Sun=7
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

export function AutoExportScreen(_props: ScreenProps) {
  const { colors } = useTheme()
  const { t } = useTranslation()
  const intervalOptions = INTERVALS.map((value) => ({ value, label: t(`autoExport.interval.${value}`) }))
  const weekdayOptions = WEEKDAYS.map((day) => ({ value: String(day), label: t(`autoExport.weekday.${day}`) }))
  const [enabled, setEnabled] = useState(false)
  const [formatOpen, setFormatOpen] = useState(false)
  const [format, setFormat] = useState<ExportFormat>("geojson")
  const [interval, setInterval] = useState<ExportInterval>("daily")
  const [mode, setMode] = useState<ExportMode>("all")
  const [directoryUri, setDirectoryUri] = useState<string | null>(null)
  const [lastExport, setLastExport] = useState<number>(0)
  const [nextExport, setNextExport] = useState<number>(0)
  const [fileCount, setFileCount] = useState<number>(0)
  const [retentionCount, setRetentionCount] = useState<number>(10)
  const [retentionInput, setRetentionInput] = useState<string>("10")
  const [lastFileName, setLastFileName] = useState<string | null>(null)
  const [lastRowCount, setLastRowCount] = useState<number>(0)
  const [lastError, setLastError] = useState<string | null>(null)
  const [timeOfDay, setTimeOfDay] = useState<string>("00:00")
  const [weeklyDow, setWeeklyDow] = useState<number>(1)
  const [monthlyDom, setMonthlyDom] = useState<number>(1)
  const [monthlyDomInput, setMonthlyDomInput] = useState<string>("1")
  const [filenameTemplate, setFilenameTemplate] = useState<string>(DEFAULT_FILENAME_TEMPLATE)
  const [filenameTemplateInput, setFilenameTemplateInput] = useState<string>(DEFAULT_FILENAME_TEMPLATE)
  const [deviceModel, setDeviceModel] = useState<string>("")
  const [exportFiles, setExportFiles] = useState<ExportFile[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportRunning, setExportRunning] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const status = await NativeLocationService.getAutoExportStatus()
      setEnabled(status.enabled)
      // Only ever turns it on: the worker's flag is still false between the enqueue and the run
      // starting, and a reload in that window would wipe the line the press just put up.
      if (status.running) setExportRunning(true)
      setFormat((status.format as ExportFormat) || "geojson")
      setInterval((status.interval as ExportInterval) || "daily")
      setMode((status.mode as ExportMode) || "all")
      setDirectoryUri(status.uri)
      setLastExport(status.lastExportTimestamp)
      setNextExport(status.nextExportTimestamp)
      setFileCount(status.fileCount)
      setRetentionCount(status.retentionCount ?? 10)
      setRetentionInput((status.retentionCount ?? 10).toString())
      setLastFileName(status.lastFileName || null)
      setLastRowCount(status.lastRowCount ?? 0)
      setLastError(status.lastError || null)
      setTimeOfDay(status.timeOfDay || "00:00")
      setWeeklyDow(status.weeklyDow || 1)
      setMonthlyDom(status.monthlyDom || 1)
      setMonthlyDomInput((status.monthlyDom || 1).toString())
      setFilenameTemplate(status.filenameTemplate || DEFAULT_FILENAME_TEMPLATE)
      setFilenameTemplateInput(status.filenameTemplate || DEFAULT_FILENAME_TEMPLATE)
      setDeviceModel(status.deviceModel || "")

      const permissionLost = await NativeLocationService.getSetting("autoExportPermissionLost")
      if (permissionLost === "true") {
        await NativeLocationService.saveSetting("autoExportPermissionLost", "false")
        showAlert(translate("autoExport.accessLost.title"), translate("autoExport.accessLost.message"), "warning")
      }
    } catch (error) {
      logger.error("[AutoExportScreen] Failed to load status:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadExportFiles = useCallback(async () => {
    try {
      const files = await NativeLocationService.getExportFiles()
      setExportFiles(files)
    } catch (error) {
      logger.error("[AutoExportScreen] Failed to load export files:", error)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadStatus()
      loadExportFiles()
    }, [loadStatus, loadExportFiles])
  )

  useEffect(() => {
    const listener = DeviceEventEmitter.addListener(
      "onAutoExportComplete",
      (event: { success: boolean; fileName: string | null; rowCount: number; error: string | null }) => {
        if (!event.success) {
          setLastError(event.error)
          showAlert(translate("autoExport.failed.title"), event.error || translate("common.unknownError"), "error")
        } else if (event.fileName) {
          setLastFileName(event.fileName)
          setLastRowCount(event.rowCount)
          setLastError(null)
          showAlert(
            translate("autoExport.complete.title"),
            translate("autoExport.complete.message", {
              count: event.rowCount,
              n: event.rowCount,
              file: event.fileName
            }),
            "success"
          )
        } else {
          setLastError(null)
          showAlert(translate("autoExport.complete.title"), translate("autoExport.complete.none"), "success")
        }
        setExportRunning(false)
        loadStatus()
        loadExportFiles()
      }
    )
    return () => listener.remove()
  }, [loadStatus, loadExportFiles])

  const saveSetting = useCallback(async (key: string, value: string) => {
    setSaving(true)
    try {
      await NativeLocationService.saveSetting(key, value)
      setSaving(false)
    } catch (error) {
      setSaving(false)
      logger.error("[AutoExportScreen] Save failed:", error)
      showAlert(translate("common.error"), translate("autoExport.saveFailed"), "error")
    }
  }, [])

  const handleToggle = useCallback(
    async (value: boolean) => {
      if (value && !directoryUri) {
        showAlert(translate("autoExport.noDirectory.title"), translate("autoExport.noDirectory.message"), "info")
        return
      }

      try {
        await NativeLocationService.saveSetting("autoExportEnabled", value.toString())

        if (value) {
          await NativeLocationService.scheduleAutoExport()
        } else {
          await NativeLocationService.cancelAutoExport()
        }

        setEnabled(value)
        await loadStatus()
      } catch (error) {
        logger.error("[AutoExportScreen] Toggle failed:", error)
        await loadStatus()
        showAlert(translate("common.error"), translate("autoExport.scheduleFailed"), "error")
      }
    },
    [directoryUri, loadStatus]
  )

  const handleFormatChange = useCallback(
    async (newFormat: ExportFormat) => {
      setFormat(newFormat)
      await saveSetting("autoExportFormat", newFormat)
    },
    [saveSetting]
  )

  const reschedule = useCallback(async () => {
    if (!enabled) return
    try {
      await NativeLocationService.rescheduleAutoExport()
    } catch (error) {
      logger.error("[AutoExportScreen] Reschedule failed:", error)
      showAlert(translate("common.error"), translate("autoExport.rescheduleFailed"), "error")
    }
  }, [enabled])

  const handleIntervalChange = useCallback(
    async (newInterval: ExportInterval) => {
      setInterval(newInterval)
      await saveSetting("autoExportInterval", newInterval)
      await reschedule()
      await loadStatus()
    },
    [saveSetting, loadStatus, reschedule]
  )

  const handleModeChange = useCallback(
    async (newMode: ExportMode) => {
      setMode(newMode)
      await saveSetting("autoExportMode", newMode)
    },
    [saveSetting]
  )

  const handleTimeChange = useCallback(
    async (newTime: string) => {
      setTimeOfDay(newTime)
      await saveSetting("autoExportTimeOfDay", newTime)
      await reschedule()
      await loadStatus()
    },
    [saveSetting, loadStatus, reschedule]
  )

  const handleWeeklyDowChange = useCallback(
    async (newDow: string) => {
      const dow = parseInt(newDow, 10)
      setWeeklyDow(dow)
      await saveSetting("autoExportWeeklyDow", newDow)
      await reschedule()
      await loadStatus()
    },
    [saveSetting, loadStatus, reschedule]
  )

  const handleMonthlyDomChange = useCallback((text: string) => {
    setMonthlyDomInput(text.replace(/\D/g, ""))
  }, [])

  const handleMonthlyDomBlur = useCallback(async () => {
    const parsed = parseInt(monthlyDomInput, 10)
    const dom = isNaN(parsed) ? monthlyDom : Math.max(1, Math.min(31, parsed))
    setMonthlyDom(dom)
    setMonthlyDomInput(dom.toString())
    await saveSetting("autoExportMonthlyDom", dom.toString())
    await reschedule()
    await loadStatus()
  }, [monthlyDomInput, monthlyDom, saveSetting, loadStatus, reschedule])

  const handleFilenameTemplateChange = useCallback((text: string) => {
    setFilenameTemplateInput(text)
  }, [])

  const handleFilenameTemplateBlur = useCallback(async () => {
    const next = filenameTemplateInput.trim()
    if (next === filenameTemplate) return
    if (!isValidFilenameTemplate(next)) {
      setFilenameTemplateInput(filenameTemplate)
      showAlert(
        translate("autoExport.invalidTemplate.title"),
        translate("autoExport.invalidTemplate.message"),
        "warning"
      )
      return
    }
    setFilenameTemplate(next)
    setFilenameTemplateInput(next)
    await saveSetting("autoExportFilenameTemplate", next)
    // The file list and count are matched against the template natively, so both go stale here.
    await loadStatus()
    await loadExportFiles()
  }, [filenameTemplateInput, filenameTemplate, saveSetting, loadStatus, loadExportFiles])

  const handleRetentionChange = useCallback((text: string) => {
    setRetentionInput(text.replace(/\D/g, ""))
  }, [])

  const handleRetentionBlur = useCallback(async () => {
    const parsed = parseInt(retentionInput, 10)
    const count = isNaN(parsed) ? retentionCount : Math.max(0, parsed)
    setRetentionCount(count)
    setRetentionInput(count.toString())
    await saveSetting("autoExportRetentionCount", count.toString())
  }, [retentionInput, retentionCount, saveSetting])

  const handlePickDirectory = useCallback(async () => {
    try {
      const uri = await NativeLocationService.pickExportDirectory()
      if (uri) {
        setDirectoryUri(uri)
        await saveSetting("autoExportUri", uri)
        loadExportFiles()
      }
    } catch (error) {
      logger.error("[AutoExportScreen] Directory pick failed:", error)
      showAlert(translate("common.error"), translate("autoExport.selectFailed"), "error")
    }
  }, [saveSetting, loadExportFiles])

  const handleExportNow = useCallback(async () => {
    if (!directoryUri) {
      showAlert(translate("autoExport.noDirectory.title"), translate("autoExport.noDirectory.message"), "info")
      return
    }
    setExporting(true)
    try {
      await NativeLocationService.runAutoExportNow()
      setExportRunning(true)
    } catch (error) {
      logger.error("[AutoExportScreen] Export now failed:", error)
      showAlert(translate("common.error"), translate("autoExport.startFailed"), "error")
    } finally {
      setExporting(false)
    }
  }, [directoryUri])

  const handleShareFile = useCallback(async (file: ExportFile) => {
    const ext = file.name.split(".").pop() || ""
    const formatKey = Object.keys(EXPORT_FORMATS).find(
      (k) => EXPORT_FORMATS[k as ExportFormat].extension === `.${ext}`
    ) as ExportFormat | undefined
    const mimeType = formatKey ? EXPORT_FORMATS[formatKey].mimeType : "application/octet-stream"

    try {
      await NativeLocationService.shareExportFile(file.uri, mimeType)
    } catch (error) {
      logger.error("[AutoExportScreen] Share failed:", error)
      showAlert(translate("common.error"), translate("autoExport.shareFailed"), "error")
    }
  }, [])

  if (loading)
    return (
      <Container>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Container>
    )

  const tokenValues = filenameTokenValues(deviceModel)

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t("autoExport.intro")}</Text>
        </View>

        {/* Enable Toggle */}
        <Card rows>
          <SettingRow
            label={t("autoExport.enable")}
            hint={enabled ? t("autoExport.enabled.hint") : t("autoExport.disabled.hint")}
          >
            <Toggle accessibilityLabel={t("autoExport.enable.a11y")} value={enabled} onValueChange={handleToggle} />
          </SettingRow>
        </Card>

        {/* Export Directory */}
        <View style={styles.section}>
          <SectionTitle>{t("autoExport.section.directory")}</SectionTitle>
          <Card>
            <Pressable
              accessibilityRole="button"
              android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
              style={styles.directoryRow}
              onPress={handlePickDirectory}
            >
              <FolderOpen size={size.icon.md} color={colors.primary} />
              <View style={styles.directoryContent}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>
                  {directoryUri ? t("autoExport.directorySelected") : t("autoExport.selectDirectory")}
                </Text>
                <Text style={[styles.settingDescription, { color: colors.textSecondary }]} numberOfLines={1}>
                  {directoryUri
                    ? decodeURIComponent(directoryUri.split("%3A").pop() || directoryUri)
                    : t("autoExport.directoryHint")}
                </Text>
              </View>
              {directoryUri && <CircleCheckBig size={size.icon.md} color={colors.success} />}
            </Pressable>
          </Card>
        </View>

        {/* Format */}
        <View style={styles.section}>
          <SectionTitle>{t("autoExport.section.format")}</SectionTitle>
          <Card rows>
            <ListItem
              testID="auto-export-format"
              icon={FILE_FORMATS[format].icon}
              label={t("autoExport.format")}
              sub={EXPORT_FORMATS[format].label}
              onPress={() => setFormatOpen(true)}
            />
          </Card>
        </View>

        {/* File Name */}
        <View style={styles.section}>
          <SectionTitle>{t("autoExport.section.fileName")}</SectionTitle>
          <Card>
            <TextField
              testID="filename-template-input"
              accessibilityLabel={t("autoExport.template.a11y")}
              mono
              value={filenameTemplateInput}
              onChangeText={handleFilenameTemplateChange}
              onBlur={handleFilenameTemplateBlur}
              placeholder={DEFAULT_FILENAME_TEMPLATE}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {FILENAME_TOKENS.map((token) => (
              <View key={token} style={styles.templateTokenRow}>
                <Text style={[styles.templateToken, { color: colors.text }]}>{`{${token}}`}</Text>
                <Text style={[styles.templateTokenValue, { color: colors.textSecondary }]}>{tokenValues[token]}</Text>
              </View>
            ))}
            <Text style={[styles.templateHint, { color: colors.textSecondary }]}>{t("autoExport.template.hint")}</Text>
            <Text style={[styles.templatePreview, { color: colors.textSecondary }]}>
              {t("autoExport.preview")}{" "}
              {renderFilenamePreview(
                isValidFilenameTemplate(filenameTemplateInput) ? filenameTemplateInput : filenameTemplate,
                format,
                deviceModel
              )}
            </Text>
          </Card>
        </View>

        {/* Frequency */}
        <View style={styles.section}>
          <SectionTitle>{t("autoExport.section.frequency")}</SectionTitle>
          <Card>
            <ChipGroup options={intervalOptions} selected={interval} onSelect={handleIntervalChange} colors={colors} />
            {interval === "weekly" && (
              <>
                <Divider />
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{t("autoExport.dayOfWeek")}</Text>
                <ChipGroup
                  options={weekdayOptions}
                  selected={weeklyDow.toString()}
                  onSelect={handleWeeklyDowChange}
                  colors={colors}
                />
              </>
            )}
            {interval === "monthly" && (
              <>
                <Divider />
                <NumericInput
                  label={t("autoExport.dayOfMonth")}
                  value={monthlyDomInput}
                  onChange={handleMonthlyDomChange}
                  onBlur={handleMonthlyDomBlur}
                  unit={t("unit.day")}
                  placeholder="1"
                  min={1}
                  hint={t("autoExport.dayOfMonth.hint")}
                />
              </>
            )}
            <Divider />
            <TimePicker label={t("autoExport.time")} value={timeOfDay} onChange={handleTimeChange} />
          </Card>
        </View>

        {/* Export Range */}
        <View style={styles.section}>
          <SectionTitle>{t("autoExport.section.range")}</SectionTitle>
          <Card rows>
            {MODE_OPTIONS.map((option, i) => (
              <React.Fragment key={option.key}>
                {i > 0 && <Divider tight />}
                <RadioRow
                  label={t(option.labelKey)}
                  sub={t(option.subKey)}
                  selected={mode === option.key}
                  onPress={() => handleModeChange(option.key)}
                />
              </React.Fragment>
            ))}
          </Card>
        </View>

        {/* File Retention */}
        <View style={styles.section}>
          <SectionTitle>{t("autoExport.section.retention")}</SectionTitle>
          <Card>
            <NumericInput
              label={t("autoExport.filesToKeep")}
              value={retentionInput}
              onChange={handleRetentionChange}
              onBlur={handleRetentionBlur}
              unit={t("unit.files")}
              placeholder="10"
              min={0}
              hint={
                filenameTemplate.includes("{device}") ? t("autoExport.retention.device") : t("autoExport.retention.all")
              }
            />
          </Card>
        </View>

        {/* Status */}
        <View style={styles.section}>
          <SectionTitle>{t("autoExport.section.status")}</SectionTitle>
          <Card>
            <View style={styles.statusRow}>
              <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>{t("autoExport.lastExport")}</Text>
              <Text style={[styles.statusValue, { color: colors.text }]}>{formatExportDateTime(lastExport)}</Text>
            </View>
            {lastFileName && (
              <>
                <Divider />
                <View style={styles.statusRow}>
                  <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>{t("autoExport.lastFile")}</Text>
                  <Text style={[styles.statusValue, { color: colors.text }]} numberOfLines={1}>
                    {lastFileName}
                  </Text>
                </View>
                <Divider />
                <View style={styles.statusRow}>
                  <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>
                    {t("autoExport.rowsExported")}
                  </Text>
                  <Text style={[styles.statusValue, { color: colors.text }]}>{lastRowCount}</Text>
                </View>
              </>
            )}
            {lastError ? (
              <>
                <Divider />
                <View style={styles.errorRow}>
                  <TriangleAlert size={size.icon.sm} color={colors.error} />
                  <Text style={[styles.errorText, { color: colors.error }]} numberOfLines={2}>
                    {lastError}
                  </Text>
                </View>
              </>
            ) : null}
            {enabled && nextExport > 0 && (
              <>
                <Divider />
                <View style={styles.statusRow}>
                  <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>
                    {t("autoExport.nextExport")}
                  </Text>
                  <Text style={[styles.statusValue, { color: colors.text }]}>{formatExportDateTime(nextExport)}</Text>
                </View>
              </>
            )}
            {directoryUri && (
              <>
                <Divider />
                <View style={styles.statusRow}>
                  <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>
                    {t("autoExport.exportFiles")}
                  </Text>
                  <Text style={[styles.statusValue, { color: colors.text }]}>{fileCount}</Text>
                </View>
              </>
            )}
          </Card>
        </View>

        {/* Export Now */}
        {directoryUri && (
          <View style={styles.section}>
            <Button
              title={exporting ? t("autoExport.exporting") : t("autoExport.exportNow")}
              onPress={handleExportNow}
              disabled={exporting}
              loading={exporting}
            />
            {exportRunning && (
              <View style={styles.runningRow} testID="export-running">
                <ActivityIndicator size="small" color={colors.textSecondary} />
                <Text style={[styles.runningText, { color: colors.textSecondary }]}>{t("autoExport.running")}</Text>
              </View>
            )}
          </View>
        )}

        {/* Export History */}
        {exportFiles.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>{t("autoExport.section.history")}</SectionTitle>
            <Card>
              {exportFiles.map((file, i) => (
                <View key={file.name}>
                  {i > 0 && <Divider />}
                  <View style={styles.fileRow}>
                    <View style={styles.fileInfo}>
                      <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                        {file.name}
                      </Text>
                      <Text style={[styles.fileMeta, { color: colors.textSecondary }]}>
                        {formatBytes(file.size)} - {formatExportDateTime(file.lastModified)}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t("autoExport.share", { name: file.name })}
                      android_ripple={{ color: colors.primary + STATE_LAYER_ALPHA, borderless: true }}
                      style={styles.shareButton}
                      onPress={() => handleShareFile(file)}
                    >
                      <Share2 size={size.icon.md} color={colors.primary} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        )}
      </ScrollView>
      <FloatingSaveIndicator saving={saving} />
      <ExportFormatDialog
        visible={formatOpen}
        title={t("transfer.formatTitle")}
        message={t("autoExport.formatDialog.message")}
        onSelect={(next) => {
          setFormatOpen(false)
          handleFormatChange(next)
        }}
        onRequestClose={() => setFormatOpen(false)}
      />
    </Container>
  )
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  runningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm
  },
  runningText: {
    flex: 1,
    fontSize: fontSizes.caption
  },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl
  },
  header: {
    marginTop: space.xl,
    marginBottom: space.xl
  },
  subtitle: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body
  },
  section: {
    marginTop: space.xl
  },
  settingLabel: {
    fontSize: fontSizes.label,
    ...fonts.semiBold,
    marginBottom: space.xxs
  },
  settingDescription: {
    fontSize: fontSizes.description,
    ...fonts.regular
  },
  directoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.xs
  },
  directoryContent: {
    flex: 1
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.xs
  },
  statusLabel: {
    fontSize: fontSizes.body,
    ...fonts.regular
  },
  statusValue: {
    fontSize: fontSizes.body,
    ...fonts.semiBold,
    flexShrink: 1,
    textAlign: "right",
    marginStart: space.md
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm
  },
  errorText: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    flex: 1
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.sm
  },
  fileInfo: {
    flex: 1,
    marginEnd: space.md
  },
  fileName: {
    fontSize: fontSizes.description,
    ...fonts.semiBold,
    marginBottom: space.xxs
  },
  fileMeta: {
    fontSize: fontSizes.caption,
    ...fonts.regular
  },
  shareButton: {
    padding: space.sm
  },
  fieldLabel: {
    fontSize: fontSizes.description,
    ...fonts.medium,
    marginBottom: space.sm
  },
  templateHint: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    marginTop: space.sm
  },
  templateTokenRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.sm,
    marginTop: space.sm
  },
  templateToken: {
    fontSize: fontSizes.description,
    ...fonts.semiBold,
    minWidth: 72
  },
  templateTokenValue: {
    fontSize: fontSizes.description,
    ...fonts.regular
  },
  templatePreview: {
    fontSize: fontSizes.description,
    ...fonts.semiBold,
    marginTop: space.sm
  }
})
