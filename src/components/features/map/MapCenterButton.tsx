/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { TouchableOpacity, View, StyleSheet, ViewStyle, StyleProp } from "react-native"
import { useTheme } from "../../../hooks/useTheme"

interface Props {
  onPress: () => void
  visible: boolean
  style?: StyleProp<ViewStyle>
}

export const MapCenterButton: React.FC<Props> = ({ onPress, visible, style }) => {
  const { colors } = useTheme()

  if (!visible) return null

  return (
    <TouchableOpacity
      style={[styles.centerButton, { backgroundColor: colors.card, borderColor: colors.border }, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.crosshairOuter, { borderColor: colors.text }]}>
        <View style={[styles.crosshairInner, { backgroundColor: colors.text }]} />
        {/* The four notches */}
        <View style={[styles.notch, styles.notchTop, { backgroundColor: colors.text }]} />
        <View style={[styles.notch, styles.notchBottom, { backgroundColor: colors.text }]} />
        <View style={[styles.notch, styles.notchLeft, { backgroundColor: colors.text }]} />
        <View style={[styles.notch, styles.notchRight, { backgroundColor: colors.text }]} />
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  centerButton: {
    position: "absolute",
    bottom: 30,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    borderWidth: 1,
    zIndex: 10
  },
  crosshairOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    position: "relative"
  },
  crosshairInner: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  notch: {
    position: "absolute"
  },
  notchTop: {
    top: -6,
    width: 2,
    height: 5,
    left: 7
  },
  notchBottom: {
    bottom: -6,
    width: 2,
    height: 5,
    left: 7
  },
  notchLeft: {
    left: -6,
    width: 5,
    height: 2,
    top: 7
  },
  notchRight: {
    right: -6,
    width: 5,
    height: 2,
    top: 7
  }
})
