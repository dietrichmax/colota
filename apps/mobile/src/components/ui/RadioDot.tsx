/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, StyleSheet } from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { radius } from "@colota/shared"

export function RadioDot({ selected, disabled = false }: { selected: boolean; disabled?: boolean }) {
  const { colors } = useTheme()
  const tint = disabled ? colors.textDisabled : colors.primary
  return (
    <View
      style={[styles.radio, { borderColor: selected ? tint : colors.border }]}
      importantForAccessibility="no"
      accessibilityElementsHidden
    >
      {selected && <View style={[styles.inner, { backgroundColor: tint }]} />}
    </View>
  )
}

const styles = StyleSheet.create({
  radio: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center"
  },
  inner: {
    width: 12,
    height: 12,
    borderRadius: radius.pill
  }
})
