/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useState, useEffect, useCallback, useRef } from "react"
import { Text, StyleSheet, View, ActivityIndicator, ScrollView, TouchableOpacity } from "react-native"
import { fonts } from "../styles/typography"
import { Download, MapPinOff, type LucideIcon } from "lucide-react-native"
import { Container, Card, SectionTitle, Divider, Button } from "../components"
import { useTheme } from "../hooks/useTheme"
import { ThemeColors, LocationCoords } from "../types/global"
import NativeLocationService from "../services/NativeLocationService"
import { LARGE_FILE_THRESHOLD, formatBytes, getByteSize, EXPORT_FORMATS, ExportFormat } from "../utils/exportConverters"
import { logger } from "../utils/logger"
import { showAlert, showConfirm } from "../services/modalService"

export function ExportDataScreen() {
  const { colors } = useTheme()
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<string>("")
  const [totalLocations, setTotalLocations] = useState(0)
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null)
  const [fileSize, setFileSize] = useState<string | null>(null)
  const cachedData = useRef<LocationCoords[]>([])
  const cachedContent = useRef<{ format: ExportFormat; content: string } | null>(null)

  const loadStats = useCallback(async () => {
    try {
      const data = await NativeLocationService.getExportData()

      if (data && data.length > 0) {
        cachedData.current = data.map((item) => ({
          ...item,
          timestamp: item.timestamp ? item.timestamp * 1000 : Date.now()
        }))

        setTotalLocations(data.length)
      }
    } catch (error) {
      logger.error("[ExportDataScreen] Failed to load stats:", error)
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  // Convert once on format selection, cache the result for both size preview and export
  useEffect(() => {
    if (!selectedFormat || cachedData.current.length === 0) {
      setFileSize(null)
      cachedContent.current = null
      return
    }

    const content = EXPORT_FORMATS[selectedFormat].convert(cachedData.current)
    cachedContent.current = { format: selectedFormat, content }
    setFileSize(formatBytes(getByteSize(content)))
  }, [selectedFormat, totalLocations])

  const handleExport = async (format: ExportFormat) => {
    if (totalLocations === 0) {
      showAlert("No Data", "There are no locations in the database to export.", "info")
      return
    }

    setExporting(true)
    setExportProgress("Preparing export...")

    try {
      setExportProgress(`Converting ${cachedData.current.length} locations...`)

      // Reuse cached conversion if format matches, otherwise convert fresh
      const content =
        cachedContent.current?.format === format
          ? cachedContent.current.content
          : EXPORT_FORMATS[format].convert(cachedData.current)

      const formatConfig = EXPORT_FORMATS[format]
      const exportSize = getByteSize(content)

      if (exportSize > LARGE_FILE_THRESHOLD) {
        setExporting(false)
        setExportProgress("")

        const confirmed = await showConfirm({
          title: "Large Export",
          message: `The export file is ${formatBytes(exportSize)}. This may take a moment to save and share. Continue?`,
          confirmText: "Continue"
        })

        if (!confirmed) {
          setSelectedFormat(null)
          return
        }

        setExporting(true)
      }

      const fileName = `colota_export_${Date.now()}${formatConfig.extension}`

      setExportProgress(`Saving file (${formatBytes(exportSize)})...`)

      const filePath = await NativeLocationService.writeFile(fileName, content)

      setExporting(false)
      setExportProgress("")

      try {
        await NativeLocationService.shareFile(
          filePath,
          formatConfig.mimeType,
          `Colota Export - ${totalLocations} locations`
        )
      } catch (shareError: any) {
        logger.warn("[ExportDataScreen] Share error:", shareError)
      }
    } catch (error) {
      logger.error("[ExportDataScreen] Export failed:", error)
      showAlert("Export Failed", "Unable to export your data. Please try again.", "error")
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

        {totalLocations === 0 ? (
          <Card>
            <View style={styles.emptyState}>
              <MapPinOff size={40} color={colors.textLight} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Locations</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textLight }]}>
                Start tracking to record locations that can be exported.
              </Text>
            </View>
          </Card>
        ) : (
          <>
            {/* Stats Card */}
            <View style={[styles.statsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total</Text>
                  <Text style={[styles.statValue, { color: colors.primaryDark }]}>
                    {totalLocations.toLocaleString()}
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
              <Button
                onPress={() => handleExport(selectedFormat)}
                disabled={exporting}
                title={`Export ${EXPORT_FORMATS[selectedFormat].label}`}
                icon={Download}
              />
            )}
          </>
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
  emptyState: {
    alignItems: "center",
    paddingVertical: 32
  },
  emptyTitle: {
    fontSize: 18,
    ...fonts.semiBold,
    marginTop: 12,
    marginBottom: 4
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18
  },
  statsContainer: {
    borderRadius: 16,
    borderWidth: 2,
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
  loader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
