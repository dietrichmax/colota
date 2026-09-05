/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, StyleSheet } from "react-native"
import { useTheme } from "../../hooks/useTheme"

const RING = 20
const CENTRE = 10

export function RadioDot({ selected, disabled = false }: { selected: boolean; disabled?: boolean }) {
  const { colors } = useTheme()
  const hue = disabled ? colors.textDisabled : selected ? colors.primary : colors.outline

  return (
    <View style={[styles.ring, { borderColor: hue }]} importantForAccessibility="no" accessibilityElementsHidden>
      {selected && <View style={[styles.centre, { backgroundColor: hue }]} />}
    </View>
  )
}

const styles = StyleSheet.create({
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center"
  },
  centre: {
    width: CENTRE,
    height: CENTRE,
    borderRadius: CENTRE / 2
  }
})
