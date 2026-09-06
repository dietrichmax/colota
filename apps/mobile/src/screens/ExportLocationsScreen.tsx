/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { useState, useEffect, useCallback } from "react"
import { Text, StyleSheet, View, ScrollView } from "react-native"
import { fontSizes, fonts } from "../styles/typography"
import { MapPinOff, Upload } from "lucide-react-native"
import { Button, Card, Container, EmptyState, FormatSelector, LoadingOverlay, SectionTitle } from "../components"
import { useTheme } from "../hooks/useTheme"
import NativeLocationService from "../services/NativeLocationService"
import { EXPORT_FORMATS, ExportFormat } from "../utils/exportConverters"
import { logger } from "../utils/logger"
import { showAlert } from "../services/modalService"
import { ScreenProps } from "../types/global"
import { space } from "../constants"

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

      // Dismissed here rather than in the finally, which would not run until the share
      // sheet is closed and would leave the overlay sitting behind it.
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
      <ScrollView contentContainerStyle={[styles.scrollContent, totalLocations === 0 && styles.scrollEmpty]} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>
          {totalLocations.toLocaleString()} locations. Save them to a file, once
        </Text>
        {totalLocations === 0 ? (
          <EmptyState
            style={styles.emptyInset}
            icon={MapPinOff}
            title="No locations"
            hint="Start tracking to record locations that can be exported"
          />
        ) : (
          <>

            {/* Format Selection */}
            <View style={styles.section}>
              <SectionTitle>Select format</SectionTitle>
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

      <LoadingOverlay visible={exporting} title="Exporting data" message={exportProgress} />
    </Container>
  )
}

const styles = StyleSheet.create({
  // the list around it already insets its rows
  emptyInset: { paddingHorizontal: 0 },
  intro: {
    fontSize: fontSizes.body,
    ...fonts.regular,
    lineHeight: 20,
    marginBottom: space.lg
  },
  scrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: 20,
    paddingBottom: 40
  },
  // so an empty state has room to centre in
  scrollEmpty: { flexGrow: 1 },
  section: {
    marginBottom: space.xl
  },
  exportButtonWrapper: {
    marginBottom: space.lg
  }
})
