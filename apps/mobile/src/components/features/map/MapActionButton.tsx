/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { elevation, STATE_LAYER_ALPHA } from "../../../constants"
import React from "react"
import { Pressable, StyleSheet, ViewStyle, StyleProp, PressableProps } from "react-native"
import { useTheme } from "../../../hooks/useTheme"
import { radius } from "@colota/shared"

interface Props {
  onPress: () => void
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
  hitSlop?: PressableProps["hitSlop"]
  accessibilityLabel?: string
  accessibilityRole?: PressableProps["accessibilityRole"]
}

export function MapActionButton({ onPress, style, children, hitSlop, accessibilityLabel, accessibilityRole }: Props) {
  const { colors } = useTheme()

  return (
    <Pressable
      android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
      style={[styles.button, { backgroundColor: colors.card }, style]}
      onPress={onPress}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
    >
      {children}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    // Bounded ripple, so the disc has to clip it to its own corner.
    overflow: "hidden",
    position: "absolute",
    bottom: 30,
    width: 40,
    height: 40,
    borderRadius: radius.md,
    justifyContent: "center",
    alignItems: "center",
    elevation: elevation.floating,
    zIndex: 10
  },
  right: { right: 16 },
  left: { left: 16 }
})

export { styles as mapActionStyles }
