/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { useState, useEffect, useCallback } from "react"
import { Text, StyleSheet, View, ScrollView } from "react-native"
import { fonts } from "../styles/typography"
import { MapPinOff, Upload } from "lucide-react-native"
import { Container, Card, SectionTitle, Button, FormatSelector, LoadingOverlay } from "../components"
import { useTheme } from "../hooks/useTheme"
import NativeLocationService from "../services/NativeLocationService"
import { EXPORT_FORMATS, ExportFormat } from "../utils/exportConverters"
import { logger } from "../utils/logger"
import { showAlert } from "../services/modalService"
import { ScreenProps } from "../types/global"

export function ExportLocationsScreen({}: ScreenProps) {
  const { colors } = useTheme()
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<string>("")
  const [totalLocations, setTotalLocations] = useState(0)
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null)

  const loadStats = useCallback(async () => {
    try {
      const stats = await NativeLocationService.getStats()
      setTotalLocations(stats.total ?? 0)
    } catch (error) {
      logger.error("[ExportLocationsScreen] Failed to load stats:", error)
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const handleExport = async (format: ExportFormat) => {
    if (totalLocations === 0) {
      showAlert("No Data", "There are no locations in the database to export.", "info")
      return
    }

    setExporting(true)
    setExportProgress("Exporting locations...")

    try {
      const result = await NativeLocationService.exportToFile(format)

      if (!result) {
        showAlert("No Data", "There are no locations in the database to export.", "info")
        return
      }

      setExportProgress(`Exported ${result.rowCount.toLocaleString()} locations`)

      setExporting(false)
      setExportProgress("")

      try {
        await NativeLocationService.shareFile(
          result.filePath,
          result.mimeType,
          `Colota Export - ${result.rowCount} locations`
        )
      } catch (shareError: any) {
        logger.warn("[ExportLocationsScreen] Share error:", shareError)
      }
    } catch (error) {
      logger.error("[ExportLocationsScreen] Export failed:", error)
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
        {totalLocations === 0 ? (
          <Card style={styles.emptyCard}>
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
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total Locations</Text>
                  <Text style={[styles.statValue, { color: colors.primaryDark }]}>
                    {totalLocations.toLocaleString()}
                  </Text>
                </View>
              </View>
            </View>

            {/* Format Selection */}
            <View style={styles.section}>
              <SectionTitle>Select Format</SectionTitle>
              <Card>
                <FormatSelector selectedFormat={selectedFormat} onSelectFormat={setSelectedFormat} />
              </Card>
            </View>

            {/* Export Button */}
            {selectedFormat && (
              <View style={styles.exportButtonWrapper}>
                <Button
                  onPress={() => handleExport(selectedFormat)}
                  disabled={exporting}
                  title={`Export ${EXPORT_FORMATS[selectedFormat].label}`}
                  icon={Upload}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>

      <LoadingOverlay visible={exporting} title="Exporting Data" message={exportProgress} />
    </Container>
  )
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40
  },
  emptyCard: {
    marginBottom: 24
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
  section: {
    marginBottom: 24
  },
  exportButtonWrapper: {
    marginBottom: 16
  }
})
