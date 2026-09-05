/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Pressable, Text, StyleSheet } from "react-native"
import { fonts } from "../../styles/typography"
import { ThemeColors } from "../../types/global"

interface TabProps {
  label: string
  active: boolean
  onPress: () => void
  colors: ThemeColors
}

export function Tab({ label, active, onPress, colors }: TabProps) {
  const borderBottomColor = active ? colors.primary : "transparent"
  const textColor = active ? colors.primary : colors.textSecondary
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tab, { borderBottomColor }, pressed && { opacity: colors.pressedOpacity }]}
    >
      <Text style={[styles.tabText, active ? styles.tabTextActive : styles.tabTextInactive, { color: textColor }]}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tab: {
    flex: 1,
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 2
  },
  tabText: {
    fontSize: 14
  },
  tabTextActive: {
    ...fonts.bold
  },
  tabTextInactive: {
    ...fonts.regular
  }
})
