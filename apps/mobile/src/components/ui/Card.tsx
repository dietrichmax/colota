/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Pressable, StyleSheet, ViewStyle, StyleProp, AccessibilityRole, AccessibilityState } from "react-native"
import { radius } from "@colota/shared"
import { useTheme } from "../../hooks/useTheme"
import { elevation, space, STATE_LAYER_ALPHA } from "../../constants"

type CardVariant = "sheet" | "floating" | "default" | "elevated" | "outlined" | "interactive" | "danger"

type CardProps = {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  variant?: CardVariant
  onPress?: () => void
  onLongPress?: () => void
  testID?: string
  accessibilityRole?: AccessibilityRole
  accessibilityLabel?: string
  accessibilityHint?: string
  accessibilityState?: AccessibilityState
}

export function Card({
  children,
  style,
  variant = "default",
  onPress,
  onLongPress,
  testID,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState
}: CardProps) {
  const { colors, mode } = useTheme()

  const surfaceStyle = (): ViewStyle => {
    switch (variant) {
      case "floating":
        return {
          backgroundColor: colors.cardElevated,
          borderRadius: radius.lg,
          elevation: mode === "dark" ? 0 : elevation.floating
        }
      // The bordered legacy surface, kept until the screens that group with it compose
      // headed lists: dropping the stroke here strips it from screens this PR does not touch.
      case "default":
        return {
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border
        }
      case "sheet":
      case "elevated":
      case "outlined":
      case "interactive":
      case "danger":
        return { backgroundColor: colors.card, borderRadius: 0 }
    }
  }

  const surface = [styles.card, surfaceStyle(), style]

  if (onPress || onLongPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={accessibilityState}
        android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
      >
        <View style={surface}>{children}</View>
      </Pressable>
    )
  }

  return (
    <View testID={testID} style={surface}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: space.lg,
    width: "100%"
  }
})
