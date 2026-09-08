/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Pressable, Text, View, StyleSheet } from "react-native"
import { fontSizes, fonts } from "../../styles/typography"
import { ThemeColors } from "../../types/global"
import { size, space, STATE_LAYER_ALPHA } from "../../constants"
import { radius } from "@colota/shared"

interface TabProps {
  label: string
  active: boolean
  onPress: () => void
  colors: ThemeColors
}

export function Tab({ label, active, onPress, colors }: TabProps) {
  const borderBottomColor = active ? colors.primary : "transparent"
  const textColor = active ? colors.text : colors.textSecondary
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
      style={styles.tab}
    >
      <View style={[styles.indicator, { borderBottomColor }]}>
        <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive, { color: textColor }]}>
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tab: {
    flex: 1,
    minHeight: size.touch,
    alignItems: "center",
    justifyContent: "center",
    padding: space.md
  },
  indicator: {
    paddingHorizontal: space.xs,
    borderBottomWidth: 2,
    borderTopLeftRadius: radius.xs,
    borderTopRightRadius: radius.xs
  },
  label: {
    fontSize: fontSizes.body
  },
  labelActive: {
    ...fonts.bold
  },
  labelInactive: {
    ...fonts.regular
  }
})
