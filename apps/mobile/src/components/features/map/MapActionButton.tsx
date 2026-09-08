/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import { elevation, HIT_SLOP_SM, size, space, STATE_LAYER_ALPHA } from "../../../constants"
import React from "react"
import { Pressable, StyleSheet, View, ViewStyle, StyleProp, PressableProps } from "react-native"
import { useTheme } from "../../../hooks/useTheme"
import { radius } from "@colota/shared"

interface Props {
  onPress: () => void
  style?: StyleProp<ViewStyle>
  children: React.ReactNode
  hitSlop?: PressableProps["hitSlop"]
  accessibilityLabel?: string
  accessibilityRole?: PressableProps["accessibilityRole"]
  accessibilityState?: PressableProps["accessibilityState"]
  anchored?: boolean
}

export function MapActionButton({
  onPress,
  style,
  children,
  hitSlop = HIT_SLOP_SM,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  anchored = true
}: Props) {
  const { colors } = useTheme()

  return (
    // The wrapper paints, clips and carries the slop: a touch never extends past the parent's bounds.
    <View hitSlop={hitSlop} style={[styles.disc, anchored && styles.anchored, { backgroundColor: colors.card }, style]}>
      <Pressable
        android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
        style={styles.button}
        onPress={onPress}
        hitSlop={hitSlop}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole={accessibilityRole}
        accessibilityState={accessibilityState}
      >
        {children}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  disc: {
    overflow: "hidden",
    width: size.iconColumn,
    height: size.iconColumn,
    borderRadius: radius.md,
    elevation: elevation.floating,
    zIndex: 10
  },
  button: {
    width: size.iconColumn,
    height: size.iconColumn,
    justifyContent: "center",
    alignItems: "center"
  },
  anchored: { position: "absolute", bottom: space.xxl },
  right: { right: space.lg },
  left: { left: space.lg }
})

export { styles as mapActionStyles }
