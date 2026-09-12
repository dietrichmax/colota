/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Text, StyleSheet } from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { type LucideIcon } from "lucide-react-native"
import { fontSizes, fonts } from "../../styles/typography"
import { size, space } from "../../constants"

type StatRowProps = {
  /** A glyph is recognised before the label is read, which is what a column of numbers loses. */
  icon?: LucideIcon
  label: string
  value: string
  /** A trailing glyph or control. The value keeps its own place to the left of it. */
  children?: React.ReactNode
  testID?: string
}

/**
 * A label and the number it names, on one line. Four screens drew this by hand with four
 * different type steps; the value is tabular so a figure that updates does not jitter.
 */
export function StatRow({ icon: Icon, label, value, children, testID }: StatRowProps) {
  const { colors } = useTheme()

  return (
    <View style={styles.row} testID={testID} accessibilityRole="text" accessibilityLabel={`${label}, ${value}`}>
      <View style={styles.leading}>
        {Icon && (
          <View style={styles.icon}>
            <Icon size={size.icon.sm} color={colors.textLight} />
          </View>
        )}
        <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      </View>
      <View style={styles.trailing}>
        <Text numberOfLines={1} style={[styles.value, { color: colors.text }]}>
          {value}
        </Text>
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.sm
  },
  leading: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg
  },
  icon: {
    width: size.icon.md,
    alignItems: "center"
  },
  label: {
    fontSize: fontSizes.body,
    ...fonts.regular
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    flexShrink: 1,
    minWidth: 0
  },
  value: {
    fontSize: fontSizes.label,
    ...fonts.medium,
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
    textAlign: "right"
  }
})
