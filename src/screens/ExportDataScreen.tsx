/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback, useRef } from "react"
import { Text, StyleSheet, View, Alert, ActivityIndicator, ScrollView, TouchableOpacity } from "react-native"
import { fonts } from "../styles/typography"
import { Download, type LucideIcon } from "lucide-react-native"
import { Container, Card, SectionTitle, Divider } from "../components"
import { useTheme } from "../hooks/useTheme"
import { ThemeColors, LocationCoords } from "../types/global"
import NativeLocationService from "../services/NativeLocationService"
import { LARGE_FILE_THRESHOLD, formatBytes, getByteSize, EXPORT_FORMATS, ExportFormat } from "../utils/exportConverters"

interface ExportStats {
  totalLocations: number
}

export function ExportDataScreen() {
  const { colors } = useTheme()
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<string>("")
  const [stats, setStats] = useState<ExportStats>({
    totalLocations: 0
  })
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null)
  const [fileSize, setFileSize] = useState<string | null>(null)
  const cachedData = useRef<LocationCoords[]>([])

  const loadStats = useCallback(async () => {
    try {
      const data = await NativeLocationService.getExportData()

      if (data && data.length > 0) {
        cachedData.current = data.map((item) => ({
          ...item,
          timestamp: item.timestamp ? item.timestamp * 1000 : Date.now()
        }))

        setStats({ totalLocations: data.length })
      }
    } catch (error) {
      console.error("[ExportDataScreen] Failed to load stats:", error)
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  useEffect(() => {
    if (!selectedFormat || cachedData.current.length === 0) {
      setFileSize(null)
      return
    }

    const content = EXPORT_FORMATS[selectedFormat].convert(cachedData.current)
    setFileSize(formatBytes(getByteSize(content)))
  }, [selectedFormat])

  const handleExport = async (format: ExportFormat) => {
    if (stats.totalLocations === 0) {
      Alert.alert("No Data", "There are no locations in the database to export.")
      return
    }

    setExporting(true)
    setExportProgress("Preparing export...")

    try {
      const normalizedData = cachedData.current

      setExportProgress(`Converting ${normalizedData.length} locations...`)

      const formatConfig = EXPORT_FORMATS[format]
      const content = formatConfig.convert(normalizedData)
      const fileExtension = formatConfig.extension
      const mimeType = formatConfig.mimeType

      const exportSize = getByteSize(content)

      if (exportSize > LARGE_FILE_THRESHOLD) {
        setExporting(false)
        setExportProgress("")

        const confirmed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Large Export",
            `The export file is ${formatBytes(exportSize)}. This may take a moment to save and share. Continue?`,
            [
              {
                text: "Cancel",
                style: "cancel",
                onPress: () => resolve(false)
              },
              { text: "Continue", onPress: () => resolve(true) }
            ],
            { cancelable: false }
          )
        })

        if (!confirmed) {
          setSelectedFormat(null)
          return
        }

        setExporting(true)
      }

      const fileName = `colota_export_${Date.now()}${fileExtension}`

      setExportProgress(`Saving file (${formatBytes(exportSize)})...`)

      const filePath = await NativeLocationService.writeFile(fileName, content)

      setExporting(false)
      setExportProgress("")

      await new Promise<void>((resolve) => setTimeout(resolve, 300))

      try {
        await NativeLocationService.shareFile(filePath, mimeType, `Colota Export - ${stats.totalLocations} locations`)
      } catch (shareError: any) {
        console.warn("[ExportDataScreen] Share error:", shareError)
      }

      setTimeout(async () => {
        try {
          await NativeLocationService.deleteFile(filePath)
        } catch (err) {
          console.warn("[ExportDataScreen] Failed to cleanup temp file:", err)
        }
      }, 2000)
    } catch (error) {
      console.error("[ExportDataScreen] Export failed:", error)
      Alert.alert("Export Failed", "Unable to export your data. Please try again.")
    } finally {
      setExporting(false)
      setExportProgress("")
      setSelectedFormat(null)
    }
  }

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Export Data</Text>
        </View>

        {/* Stats Card */}
        <View
          style={[
            styles.statsContainer,
            {
              backgroundColor: colors.card,
              borderColor: colors.border
            }
          ]}
        >
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total</Text>
              <Text style={[styles.statValue, { color: colors.primaryDark }]}>
                {stats.totalLocations.toLocaleString()}
              </Text>
            </View>

            <View style={[styles.statsDivider, { backgroundColor: colors.border }]} />

            <View style={styles.statItem}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>File Size</Text>
              <Text style={[styles.statValue, { color: colors.success }]}>{fileSize ?? "–"}</Text>
            </View>
          </View>
        </View>

        {/* Format Selection */}
        <View style={styles.section}>
          <SectionTitle>Select Format</SectionTitle>

          <Card>
            {(Object.entries(EXPORT_FORMATS) as [ExportFormat, (typeof EXPORT_FORMATS)[ExportFormat]][]).map(
              ([key, config], index, arr) => (
                <React.Fragment key={key}>
                  <FormatOption
                    icon={config.icon}
                    title={config.label}
                    subtitle={config.subtitle}
                    description={config.description}
                    extension={config.extension}
                    selected={selectedFormat === key}
                    onPress={() => setSelectedFormat(key)}
                    colors={colors}
                  />
                  {index < arr.length - 1 && <Divider />}
                </React.Fragment>
              )
            )}
          </Card>
        </View>

        {/* Export Button */}
        {selectedFormat && (
          <View style={styles.exportSection}>
            <TouchableOpacity
              style={[
                styles.exportButton,
                {
                  backgroundColor: colors.primary
                },
                exporting && styles.disabledButton
              ]}
              onPress={() => handleExport(selectedFormat)}
              disabled={exporting || stats.totalLocations === 0}
              activeOpacity={0.7}
            >
              <View style={styles.exportContent}>
                <Download size={28} color={colors.textOnPrimary} style={styles.exportIcon} />
                <View style={styles.exportText}>
                  <Text style={[styles.exportTitle, { color: colors.textOnPrimary }]}>
                    Export {EXPORT_FORMATS[selectedFormat].label}
                  </Text>
                  <Text style={[styles.exportSubtitle, { color: colors.textOnPrimary }]}>
                    {stats.totalLocations.toLocaleString()} locations
                    {fileSize ? ` • ${fileSize}` : ""}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Loading Overlay */}
      {exporting && (
        <View style={[styles.loader, { backgroundColor: colors.overlay }]}>
          <View style={[styles.loaderCard, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loaderTitle, { color: colors.text }]}>Exporting Data</Text>
            <Text style={[styles.loaderText, { color: colors.textSecondary }]}>{exportProgress}</Text>
          </View>
        </View>
      )}
    </Container>
  )
}

// --- Format Option Component ---

const FormatOption = ({
  icon: Icon,
  title,
  subtitle,
  description,
  extension,
  selected,
  onPress,
  colors
}: {
  icon: LucideIcon
  title: string
  subtitle: string
  description: string
  extension: string
  selected: boolean
  onPress: () => void
  colors: ThemeColors
}) => {
  const backgroundColor = selected ? colors.primary + "12" : "transparent"
  const radioBgColor = selected ? colors.primary + "20" : "transparent"

  return (
    <TouchableOpacity style={[styles.formatOption, { backgroundColor }]} onPress={onPress} activeOpacity={0.7}>
      {selected && <View style={[styles.selectionBar, { backgroundColor: colors.primary }]} />}

      <View style={styles.formatContent}>
        <View style={styles.leftContent}>
          <Icon size={28} color={colors.primaryDark} />
          <View style={styles.textContent}>
            <View style={styles.titleRow}>
              <Text style={[styles.formatTitle, { color: colors.text }]}>{title}</Text>
              <View
                style={[
                  styles.extensionBadge,
                  {
                    backgroundColor: selected ? colors.primary + "20" : colors.primary + "15",
                    borderColor: selected ? colors.primary + "60" : colors.primary + "30"
                  }
                ]}
              >
                <Text style={[styles.extensionText, { color: colors.primaryDark }]}>{extension}</Text>
              </View>
            </View>
            <Text style={[styles.formatSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
            <Text style={[styles.formatDescription, { color: colors.textLight }]}>{description}</Text>
          </View>
        </View>

        <View
          style={[
            styles.radio,
            {
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: radioBgColor
            }
          ]}
        >
          {selected && <View style={[styles.radioInner, { backgroundColor: colors.primary }]} />}
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40
  },
  header: {
    marginTop: 20,
    marginBottom: 20
  },
  title: {
    fontSize: 28,
    ...fonts.bold,
    letterSpacing: -0.5
  },
  statsContainer: {
    borderRadius: 16,
    borderWidth: 2,
    marginHorizontal: 0,
    marginBottom: 24,
    overflow: "hidden"
  },
  statsGrid: {
    flexDirection: "row",
    padding: 20
  },
  statItem: {
    flex: 1,
    alignItems: "center"
  },
  statLabel: {
    fontSize: 12,
    ...fonts.semiBold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8
  },
  statValue: {
    fontSize: 20,
    ...fonts.bold,
    letterSpacing: -0.5,
    textAlign: "center"
  },
  statsDivider: {
    width: 1,
    marginHorizontal: 12,
    opacity: 0.3
  },
  section: {
    marginBottom: 24
  },
  formatOption: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: -16,
    position: "relative"
  },
  selectionBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4
  },
  formatContent: {
    flexDirection: "row",
    alignItems: "center"
  },
  leftContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  textContent: {
    flex: 1
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2
  },
  formatTitle: {
    fontSize: 16,
    ...fonts.semiBold,
    letterSpacing: -0.2
  },
  extensionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1
  },
  extensionText: {
    fontSize: 10,
    ...fonts.bold,
    letterSpacing: 0.3
  },
  formatSubtitle: {
    fontSize: 13,
    marginBottom: 2
  },
  formatDescription: {
    fontSize: 12,
    lineHeight: 16
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6
  },
  exportSection: {},
  exportButton: {
    borderRadius: 14,
    padding: 18,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  exportContent: {
    flexDirection: "row",
    alignItems: "center"
  },
  exportIcon: {
    marginRight: 14
  },
  exportText: {
    flex: 1
  },
  exportTitle: {
    fontSize: 17,
    ...fonts.semiBold,
    marginBottom: 2
  },
  exportSubtitle: {
    fontSize: 13,
    opacity: 0.9
  },
  disabledButton: {
    opacity: 0.5
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    justifyContent: "center",
    alignItems: "center"
  },
  loaderCard: {
    padding: 32,
    borderRadius: 16,
    alignItems: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    minWidth: 240
  },
  loaderTitle: {
    fontSize: 16,
    ...fonts.semiBold,
    marginTop: 16,
    marginBottom: 8
  },
  loaderText: {
    fontSize: 13,
    textAlign: "center"
  }
})
