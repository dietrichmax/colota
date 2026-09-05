/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native"
import { fontSizes, fonts } from "../../styles/typography"
import { useTheme } from "../../hooks/useTheme"
import { space } from "../../constants"

interface SettingRowProps {
  label: string
  hint?: string
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}

export function SettingRow({ label, hint, children, style }: SettingRowProps) {
  const { colors } = useTheme()
  return (
    <View style={[styles.settingRow, style]}>
      <View style={styles.settingContent}>
        <Text style={[styles.settingLabel, { color: colors.text }]}>{label}</Text>
        {hint && <Text style={[styles.settingHint, { color: colors.textSecondary }]}>{hint}</Text>}
      </View>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.xs
  },
  settingContent: {
    flex: 1,
    marginEnd: space.lg
  },
  settingLabel: {
    fontSize: fontSizes.label,
    ...fonts.semiBold,
    marginBottom: 2
  },
  settingHint: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    lineHeight: 18
  }
})
