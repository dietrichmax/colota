/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Share2 } from "lucide-react-native"
import { Card, Divider, SectionTitle } from "../../index"
import { useTheme } from "../../../hooks/useTheme"
import { useTranslation } from "../../../i18n/useTranslation"
import { fontSizes, fonts } from "../../../styles/typography"
import { formatBytes, formatExportDateTime } from "../../../utils/format"
import { size, space, STATE_LAYER_ALPHA } from "../../../constants"

export type ExportFile = {
  name: string
  size: number
  lastModified: number
  uri: string
}

type Props = {
  files: ExportFile[]
  onShare: (file: ExportFile) => void
}

export function AutoExportHistory({ files, onShare }: Props) {
  const { colors } = useTheme()
  const { t } = useTranslation()

  return (
    <>
      <SectionTitle>{t("autoExport.section.history")}</SectionTitle>
      <Card>
        {files.map((file, i) => (
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
                onPress={() => onShare(file)}
              >
                <Share2 size={size.icon.md} color={colors.primary} />
              </Pressable>
            </View>
          </View>
        ))}
      </Card>
    </>
  )
}

const styles = StyleSheet.create({
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
  }
})
