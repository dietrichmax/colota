/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { useState, useCallback, useEffect } from "react"
import { useFocusEffect } from "@react-navigation/native"
import { Text, StyleSheet, Switch, View, ScrollView, Pressable, DeviceEventEmitter, TextInput } from "react-native"
import { FolderOpen, CircleCheckBig, Share2, TriangleAlert } from "lucide-react-native"
import {
  Container,
  Card,
  SectionTitle,
  Divider,
  FormatSelector,
  ChipGroup,
  RadioDot,
  FloatingSaveIndicator,
  SettingRow,
  Button,
  TimePicker,
  NumericInput
} from "../components"
import { useTheme } from "../hooks/useTheme"
import { useTimeout } from "../hooks/useTimeout"
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
import { fontSizes, fonts } from "../styles/typography"
import { logger } from "../utils/logger"
import { formatExportDateTime, formatBytes } from "../utils/format"
import { showAlert } from "../services/modalService"
import { SAVE_SUCCESS_DISPLAY_MS, size, space } from "../constants"
import { radius } from "@colota/shared"

type ExportInterval = "daily" | "weekly" | "monthly"
type ExportMode = "all" | "incremental"

type ExportFile = {
  name: string
  size: number
  lastModified: number
  uri: string
}

const INTERVAL_OPTIONS: readonly { value: ExportInterval; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" }
]

const MODE_OPTIONS: { key: ExportMode; label: string; description: string }[] = [
  { key: "all", label: "All data", description: "Export all stored locations each time" },
  { key: "incremental", label: "Since last export", description: "Only export new locations" }
]

// ISO weekday Mon=1..Sun=7
const WEEKDAY_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
  { value: "7", label: "Sun" }
]

export function AutoExportScreen(_props: ScreenProps) {
  const { colors } = useTheme()
  const [enabled, setEnabled] = useState(false)
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
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const successTimeout = useTimeout()

  const loadStatus = useCallback(async () => {
    try {
      const status = await NativeLocationService.getAutoExportStatus()
      setEnabled(status.enabled)
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
        showAlert(
          "Export Directory Access Lost",
          "The app lost access to the export directory. Please re-select it to resume auto-exports.",
          "warning"
        )
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
        if (event.success) {
          setLastFileName(event.fileName)
          setLastRowCount(event.rowCount)
          setLastError(null)
          showAlert("Export Complete", `Exported ${event.rowCount} locations to ${event.fileName}`, "success")
        } else {
          setLastError(event.error)
          showAlert("Export Failed", event.error || "Unknown error", "error")
        }
        loadStatus()
        loadExportFiles()
      }
    )
    return () => listener.remove()
  }, [loadStatus, loadExportFiles])

  const saveSetting = useCallback(
    async (key: string, value: string) => {
      setSaving(true)
      try {
        await NativeLocationService.saveSetting(key, value)
        setSaving(false)
        setSaveSuccess(true)
        successTimeout.set(() => setSaveSuccess(false), SAVE_SUCCESS_DISPLAY_MS)
      } catch (error) {
        setSaving(false)
        logger.error("[AutoExportScreen] Save failed:", error)
        showAlert("Error", "Failed to save setting. Please try again.", "error")
      }
    },
    [successTimeout]
  )

  const handleToggle = useCallback(
    async (value: boolean) => {
      if (value && !directoryUri) {
        showAlert("No Directory", "Please select an export directory first.", "info")
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
        showAlert("Error", "Failed to update auto-export schedule. Please check the export directory.", "error")
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
      showAlert("Error", "Failed to reschedule auto-export. Please try again.", "error")
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
        "Invalid Template",
        "The template must contain colota_export, {date} and {time}. The marker lets Colota recognise its own files during cleanup, and the date and time keep every export uniquely named and correctly ordered. Matching is case-sensitive.",
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
      showAlert("Error", "Failed to select directory.", "error")
    }
  }, [saveSetting, loadExportFiles])

  const handleExportNow = useCallback(async () => {
    if (!directoryUri) {
      showAlert("No Directory", "Please select an export directory first.", "info")
      return
    }
    setExporting(true)
    try {
      await NativeLocationService.runAutoExportNow()
      showAlert("Export Started", "Export is running in the background. The status will update when complete.", "info")
    } catch (error) {
      logger.error("[AutoExportScreen] Export now failed:", error)
      showAlert("Error", "Failed to start export.", "error")
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
      showAlert("Error", "Failed to share file.", "error")
    }
  }, [])

  if (loading)
    return (
      <Container>
        <View />
      </Container>
    )

  const tokenValues = filenameTokenValues(deviceModel)

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Automatically export your location data on a schedule
          </Text>
        </View>

        {/* Enable Toggle */}
        <Card>
          <SettingRow
            label="Enable Auto-Export"
            hint={enabled ? "Auto-Exports are scheduled" : "Auto-Exports are disabled"}
          >
            <Switch
              value={enabled}
              onValueChange={handleToggle}
              trackColor={{ false: colors.border, true: colors.primary + "80" }}
              thumbColor={enabled ? colors.primary : colors.border}
            />
          </SettingRow>
        </Card>

        {/* Export Directory */}
        <View style={styles.section}>
          <SectionTitle>Export directory</SectionTitle>
          <Card>
            <Pressable
              style={({ pressed }) => [styles.directoryRow, pressed && { opacity: colors.pressedOpacity }]}
              onPress={handlePickDirectory}
            >
              <FolderOpen size={size.icon.md} color={colors.primary} />
              <View style={styles.directoryContent}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>
                  {directoryUri ? "Directory selected" : "Select directory"}
                </Text>
                <Text style={[styles.settingDescription, { color: colors.textSecondary }]} numberOfLines={1}>
                  {directoryUri
                    ? decodeURIComponent(directoryUri.split("%3A").pop() || directoryUri)
                    : "Tap to choose where files are saved"}
                </Text>
              </View>
              {directoryUri && <CircleCheckBig size={size.icon.md} color={colors.success} />}
            </Pressable>
          </Card>
        </View>

        {/* Format */}
        <View style={styles.section}>
          <SectionTitle>Format</SectionTitle>
          <Card>
            <FormatSelector selectedFormat={format} onSelectFormat={handleFormatChange} />
          </Card>
        </View>

        {/* File Name */}
        <View style={styles.section}>
          <SectionTitle>File name</SectionTitle>
          <Card>
            <TextInput
              style={[styles.templateInput, { color: colors.text, borderColor: colors.border }]}
              value={filenameTemplateInput}
              onChangeText={handleFilenameTemplateChange}
              onBlur={handleFilenameTemplateBlur}
              placeholder={DEFAULT_FILENAME_TEMPLATE}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {FILENAME_TOKENS.map((token) => (
              <View key={token} style={styles.templateTokenRow}>
                <Text style={[styles.templateToken, { color: colors.text }]}>{`{${token}}`}</Text>
                <Text style={[styles.templateHint, { color: colors.textSecondary }]}>{tokenValues[token]}</Text>
              </View>
            ))}
            <Text style={[styles.templateHint, { color: colors.textSecondary }]}>
              Must contain colota_export, {"{date}"} and {"{time}"}. The extension is added automatically.
            </Text>
            <Text style={[styles.templatePreview, { color: colors.textSecondary }]}>
              Preview:{" "}
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
          <SectionTitle>Frequency</SectionTitle>
          <Card>
            <ChipGroup options={INTERVAL_OPTIONS} selected={interval} onSelect={handleIntervalChange} colors={colors} />
            {interval === "weekly" && (
              <>
                <Divider />
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Day of week</Text>
                <ChipGroup
                  options={WEEKDAY_OPTIONS}
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
                  label="Day of month"
                  value={monthlyDomInput}
                  onChange={handleMonthlyDomChange}
                  onBlur={handleMonthlyDomBlur}
                  unit="day"
                  placeholder="1"
                  min={1}
                  colors={colors}
                  hint="1-31. Falls back to last day in shorter months."
                />
              </>
            )}
            <Divider />
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Time (24h)</Text>
            <TimePicker value={timeOfDay} onChange={handleTimeChange} colors={colors} />
          </Card>
        </View>

        {/* Export Range */}
        <View style={styles.section}>
          <SectionTitle>Export range</SectionTitle>
          <Card>
            {MODE_OPTIONS.map((option, i) => (
              <View key={option.key}>
                {i > 0 && <Divider />}
                <Pressable
                  style={({ pressed }) => [styles.modeRow, pressed && { opacity: colors.pressedOpacity }]}
                  onPress={() => handleModeChange(option.key)}
                >
                  <View style={styles.modeContent}>
                    <Text style={[styles.settingLabel, { color: mode === option.key ? colors.primary : colors.text }]}>
                      {option.label}
                    </Text>
                    <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                      {option.description}
                    </Text>
                  </View>
                  <RadioDot selected={mode === option.key} />
                </Pressable>
              </View>
            ))}
          </Card>
        </View>

        {/* File Retention */}
        <View style={styles.section}>
          <SectionTitle>File retention</SectionTitle>
          <Card>
            <NumericInput
              label="Files to keep"
              value={retentionInput}
              onChange={handleRetentionChange}
              onBlur={handleRetentionBlur}
              unit="files"
              placeholder="10"
              min={0}
              colors={colors}
              hint={
                filenameTemplate.includes("{device}")
                  ? "Set to 0 for unlimited. Counts only exports named for this device model, so other models sharing the folder are untouched."
                  : "Set to 0 for unlimited. Counts every Colota export in the folder. Add {device} to the file name to keep files per device instead."
              }
            />
          </Card>
        </View>

        {/* Status */}
        <View style={styles.section}>
          <SectionTitle>Status</SectionTitle>
          <Card>
            <View style={styles.statusRow}>
              <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>Last export</Text>
              <Text style={[styles.statusValue, { color: colors.text }]}>{formatExportDateTime(lastExport)}</Text>
            </View>
            {lastFileName && (
              <>
                <Divider />
                <View style={styles.statusRow}>
                  <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>Last file</Text>
                  <Text style={[styles.statusValue, { color: colors.text }]} numberOfLines={1}>
                    {lastFileName}
                  </Text>
                </View>
                <Divider />
                <View style={styles.statusRow}>
                  <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>Locations exported</Text>
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
                  <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>Next export</Text>
                  <Text style={[styles.statusValue, { color: colors.text }]}>{formatExportDateTime(nextExport)}</Text>
                </View>
              </>
            )}
            {directoryUri && (
              <>
                <Divider />
                <View style={styles.statusRow}>
                  <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>Export files</Text>
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
              title={exporting ? "Exporting..." : "Export now"}
              onPress={handleExportNow}
              disabled={exporting}
              loading={exporting}
            />
          </View>
        )}

        {/* Export History */}
        {exportFiles.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>Export history</SectionTitle>
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
                      style={({ pressed }) => [styles.shareButton, pressed && { opacity: 0.5 }]}
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
      <FloatingSaveIndicator saving={saving} success={saveSuccess} colors={colors} />
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingBottom: 40
  },
  header: {
    marginTop: 20,
    marginBottom: 20
  },
  subtitle: {
    fontSize: fontSizes.body,
    lineHeight: 20
  },
  section: {
    marginTop: space.xl
  },
  settingLabel: {
    fontSize: fontSizes.label,
    ...fonts.semiBold,
    marginBottom: 2
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
    marginLeft: space.md
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: 6
  },
  errorText: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    flex: 1
  },
  modeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10
  },
  modeContent: {
    flex: 1,
    marginRight: space.lg
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.sm
  },
  fileInfo: {
    flex: 1,
    marginRight: space.md
  },
  fileName: {
    fontSize: fontSizes.description,
    ...fonts.semiBold,
    marginBottom: 2
  },
  fileMeta: {
    fontSize: fontSizes.caption,
    ...fonts.regular
  },
  shareButton: {
    padding: space.sm
  },
  fieldLabel: {
    fontSize: fontSizes.caption,
    ...fonts.semiBold,
    marginTop: space.md,
    marginBottom: space.sm
  },
  templateInput: {
    fontSize: fontSizes.input,
    ...fonts.regular,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 10
  },
  templateHint: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    marginTop: space.sm
  },
  templateTokenRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: space.sm
  },
  templateToken: {
    fontSize: fontSizes.description,
    ...fonts.semiBold,
    marginTop: space.sm,
    minWidth: 72
  },
  templatePreview: {
    fontSize: fontSizes.description,
    ...fonts.semiBold,
    marginTop: space.sm
  }
})
