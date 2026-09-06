/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */
import React from "react"
import { View, Text, StyleSheet } from "react-native"
import { TriangleAlert, ChevronRight } from "lucide-react-native"
import { useTheme } from "../../../hooks/useTheme"
import { fontSizes, fonts } from "../../../styles/typography"
import { CRITICAL_QUEUE_THRESHOLD, HIGH_QUEUE_THRESHOLD, size, space } from "../../../constants"
import { Card } from "../../ui/Card"

interface QueueWarningProps {
  queueCount: number
  onPress: () => void
}

/** Renders nothing below the threshold: the queue is only worth a surface once it is backing up. */
export function QueueWarning({ queueCount, onPress }: QueueWarningProps) {
  const { colors } = useTheme()
  if (queueCount <= HIGH_QUEUE_THRESHOLD) return null

  const critical = queueCount > CRITICAL_QUEUE_THRESHOLD
  const accent = critical ? colors.error : colors.warning

  return (
    <Card
      variant="interactive"
      onPress={onPress}
      style={[styles.card, { backgroundColor: accent + "15" }]}
      accessibilityRole="button"
      accessibilityLabel={`${critical ? "Critical" : "High"} queue size, ${queueCount} waiting, open data management`}
    >
      <View style={styles.row}>
        <TriangleAlert size={size.icon.md} color={accent} />
        <View style={styles.text}>
          <Text style={[styles.title, { color: accent }]}>{critical ? "Critical queue size" : "High queue size"}</Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>Tap to manage data</Text>
        </View>
        <ChevronRight size={size.icon.md} color={accent} />
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: {
    marginBottom: space.xl
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md
  },
  text: {
    flex: 1
  },
  title: {
    fontSize: fontSizes.body,
    ...fonts.semiBold
  },
  hint: {
    fontSize: fontSizes.caption,
    ...fonts.regular
  }
})
