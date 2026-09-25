/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { StyleSheet, Text, View } from "react-native"
import { Clock, CloudUpload, Crosshair, Gauge, Mountain, NotebookPen, Split, Trash2, X } from "lucide-react-native"
import { useTheme } from "../../../hooks/useTheme"
import { showPrompt } from "../../../services/modalService"
import { fontSizes, fonts } from "../../../styles/typography"
import { size, space } from "../../../constants"
import { formatSpeed, formatTime, metersToInput, shortDistanceUnit } from "../../../utils/geo"
import type { LocationCoords } from "../../../types/global"
import { Divider } from "../../ui/Divider"
import { IconButton } from "../../ui/IconButton"
import { ListItem } from "../../ui/ListItem"
import { StatRow } from "../../ui/StatRow"
import { useTranslation } from "../../../i18n/useTranslation"

export type PointCardProps = {
  point: LocationCoords
  /** The note as the screen resolves it from noteOverrides; point.note is not read. */
  note: string | undefined
  hasEndpoint: boolean
  /** Absent where a trip is not edited, so the card offers no Split there. */
  onSplit?: () => void
  onDelete?: () => void
  onClose: () => void
  onSaveNote: (note: string | null) => void
}

export function PointCard({ point, note, hasEndpoint, onSplit, onDelete, onClose, onSaveNote }: PointCardProps) {
  const { colors } = useTheme()
  const { t } = useTranslation()

  const editNote = async () => {
    const next = await showPrompt({
      title: t("point.note"),
      placeholder: t("point.addNote"),
      initialValue: note ?? "",
      multiline: true,
      cancelText: t("common.close")
    })
    if (next !== null) onSaveNote(next ? next : null)
  }

  return (
    <View testID="point-card">
      <View style={styles.header}>
        <View style={styles.glyph}>
          <Clock size={size.icon.md} color={colors.textSecondary} />
        </View>
        <Text style={[styles.time, { color: colors.text }]} numberOfLines={1} testID="point-time">
          {formatTime(point.timestamp ?? 0, true)}
        </Text>
        {onSplit && (
          <IconButton icon={Split} accessibilityLabel={t("point.split")} onPress={onSplit} testID="point-split" />
        )}
        {onDelete && (
          <IconButton
            icon={Trash2}
            tone="danger"
            accessibilityLabel={t("point.delete")}
            onPress={onDelete}
            testID="point-delete"
          />
        )}
        <IconButton icon={X} accessibilityLabel={t("common.close")} onPress={onClose} testID="point-close" />
      </View>
      {point.speed !== undefined && (
        <>
          <Divider tight inset />
          <StatRow icon={Gauge} label={t("point.speed")} value={formatSpeed(point.speed)} testID="point-speed" />
        </>
      )}
      {point.accuracy !== undefined && (
        <>
          <Divider tight inset />
          <StatRow
            icon={Crosshair}
            label={t("point.accuracy")}
            value={`±${Math.round(metersToInput(point.accuracy))} ${shortDistanceUnit()}`}
            testID="point-accuracy"
          />
        </>
      )}
      {point.altitude !== undefined && (
        <>
          <Divider tight inset />
          <StatRow
            icon={Mountain}
            label={t("point.altitude")}
            value={`${Math.round(metersToInput(point.altitude))} ${shortDistanceUnit()}`}
            testID="point-altitude"
          />
        </>
      )}
      {hasEndpoint && (
        <>
          <Divider tight inset />
          <StatRow
            icon={CloudUpload}
            label={t("point.sync")}
            value={point.sent ? t("point.sent") : t("point.queued")}
            testID="point-sync"
          />
        </>
      )}
      <Divider tight inset />
      <ListItem
        icon={NotebookPen}
        label={t("point.note")}
        sub={note ? note : t("point.addNote")}
        onPress={editNote}
        testID="point-note"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: size.row,
    paddingVertical: space.sm,
    gap: space.lg
  },
  glyph: {
    width: size.icon.md,
    alignItems: "center"
  },
  time: {
    flex: 1,
    fontSize: fontSizes.label,
    ...fonts.semiBold,
    fontVariant: ["tabular-nums"]
  }
})
