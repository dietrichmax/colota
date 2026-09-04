/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { StyleSheet, Text, View } from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { text } from "../../styles/typography"
import { space } from "../../constants"
import { Divider } from "./Divider"

type StatRowProps = {
  label: string
  value: string
  divider?: boolean
  testID?: string
}

/** A ledger line: the label at the start, the figure at the end, a hairline between rows. */
export function StatRow({ label, value, divider = false, testID }: StatRowProps) {
  const { colors } = useTheme()

  const row = (
    <View testID={testID} style={styles.row} accessible accessibilityLabel={`${label}, ${value}`}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.text }]}>{value}</Text>
    </View>
  )

  if (!divider) return row

  return (
    <View>
      {row}
      <Divider tight testID="stat-row-divider" />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingVertical: space.md
  },
  label: {
    ...text.label,
    flexShrink: 1
  },
  value: {
    ...text.figureInline
  }
})
