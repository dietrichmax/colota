/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, StyleSheet } from "react-native"
import { useTheme } from "../../hooks/useTheme"

export function RadioDot({ selected }: { selected: boolean }) {
  const { colors } = useTheme()
  return (
    <View
      style={[styles.radio, { borderColor: selected ? colors.primary : colors.border }]}
      importantForAccessibility="no"
      accessibilityElementsHidden
    >
      {selected && <View style={[styles.inner, { backgroundColor: colors.primary }]} />}
    </View>
  )
}

const styles = StyleSheet.create({
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center"
  },
  inner: {
    width: 12,
    height: 12,
    borderRadius: 6
  }
})
