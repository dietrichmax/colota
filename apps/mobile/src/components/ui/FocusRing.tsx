/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, StyleSheet } from "react-native"

const OFFSET = 2

type FocusRingProps = {
  visible: boolean
  color: string
  radius: number
}

export function FocusRing({ visible, color, radius }: FocusRingProps) {
  if (!visible) return null

  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no"
      style={[styles.ring, { borderColor: color, borderRadius: radius + OFFSET }]}
    />
  )
}

const styles = StyleSheet.create({
  ring: {
    position: "absolute",
    top: -OFFSET,
    bottom: -OFFSET,
    start: -OFFSET,
    end: -OFFSET,
    borderWidth: 2
  }
})
