/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { StyleSheet, Text, View } from "react-native"
import { TriangleAlert } from "lucide-react-native"
import { Card, Divider, SectionTitle } from "../../index"
import { useTheme } from "../../../hooks/useTheme"
import { useTranslation } from "../../../i18n/useTranslation"
import { fontSizes, fonts } from "../../../styles/typography"
import { formatExportDateTime } from "../../../utils/format"
import { size, space } from "../../../constants"

type Props = {
  lastExport: number
  lastFileName: string | null
  lastRowCount: number
  lastError: string | null
  nextExport: number | null
  fileCount: number | null
}

export function AutoExportStatus({ lastExport, lastFileName, lastRowCount, lastError, nextExport, fileCount }: Props) {
  const { colors } = useTheme()
  const { t } = useTranslation()

  return (
    <>
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
              <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>{t("autoExport.rowsExported")}</Text>
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
        {nextExport !== null && (
          <>
            <Divider />
            <View style={styles.statusRow}>
              <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>{t("autoExport.nextExport")}</Text>
              <Text style={[styles.statusValue, { color: colors.text }]}>{formatExportDateTime(nextExport)}</Text>
            </View>
          </>
        )}
        {fileCount !== null && (
          <>
            <Divider />
            <View style={styles.statusRow}>
              <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>{t("autoExport.exportFiles")}</Text>
              <Text style={[styles.statusValue, { color: colors.text }]}>{fileCount}</Text>
            </View>
          </>
        )}
      </Card>
    </>
  )
}

const styles = StyleSheet.create({
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
  }
})
