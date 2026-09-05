/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Pressable, Text, StyleSheet } from "react-native"
import { fontSizes, fonts } from "../../styles/typography"
import { ThemeColors } from "../../types/global"
import { space, STATE_LAYER_ALPHA } from "../../constants"
import { radius } from "@colota/shared"

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
      android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
      style={[styles.tab, { borderBottomColor }]}
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
    padding: space.md,
    borderBottomWidth: 2,
    // Top corners only: the bottom rule is the active indicator and must stay square.
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    overflow: "hidden"
  },
  tabText: {
    fontSize: fontSizes.body
  },
  tabTextActive: {
    ...fonts.bold
  },
  tabTextInactive: {
    ...fonts.regular
  }
})
