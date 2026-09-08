/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Text, StyleSheet } from "react-native"
import { type LucideIcon } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { fontSizes, fonts, lineHeights } from "../../styles/typography"
import { size, space } from "../../constants"

type StateLineProps = {
  icon: LucideIcon | React.ReactNode
  iconColor: string
  label: string
  caption: string
  testID?: string
}

export function StateLine({ icon, iconColor, label, caption, testID }: StateLineProps) {
  const { colors } = useTheme()
  const Icon = icon as LucideIcon

  return (
    <View style={styles.row} testID={testID} accessibilityRole="text" accessibilityLabel={`${label}, ${caption}`}>
      <View style={styles.glyph}>
        {React.isValidElement(icon) ? icon : <Icon size={size.icon.md} color={iconColor} />}
      </View>
      <View style={styles.column}>
        <Text style={[styles.label, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.caption, { color: colors.textSecondary }]} numberOfLines={1}>
          {caption}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    paddingVertical: space.md,
    minHeight: size.row
  },
  glyph: {
    width: size.icon.md,
    alignItems: "center"
  },
  column: {
    flex: 1
  },
  label: {
    fontSize: fontSizes.label,
    ...fonts.semiBold
  },
  caption: {
    fontSize: fontSizes.caption,
    lineHeight: lineHeights.caption,
    ...fonts.regular,
    fontVariant: ["tabular-nums"],
    marginTop: space.xxs
  }
})
