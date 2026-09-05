/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Pressable, ActivityIndicator, StyleSheet, StyleProp, ViewStyle } from "react-native"
import { type LucideIcon } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { size, space, HIT_SLOP_MD } from "../../constants"
import { radius } from "@colota/shared"

type IconButtonTone = "neutral" | "primary" | "danger"

type IconButtonProps = {
  icon: LucideIcon
  onPress: () => void
  /** Required: the glyph carries no text, so nothing else names this control. */
  accessibilityLabel: string
  tone?: IconButtonTone
  disabled?: boolean
  loading?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

/**
 * The disc stays at size.iconButton so it fits the rows it sits in; hitSlop takes the touch
 * target to size.touch without reflowing them.
 */
export function IconButton({
  icon: Icon,
  onPress,
  accessibilityLabel,
  tone = "neutral",
  disabled = false,
  loading = false,
  style,
  testID
}: IconButtonProps) {
  const { colors } = useTheme()
  const hue = tone === "danger" ? colors.error : tone === "primary" ? colors.primary : colors.textSecondary
  const fill = tone === "neutral" ? colors.border : hue + "15"
  const content = disabled ? colors.textDisabled : hue

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={HIT_SLOP_MD}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: fill },
        pressed && !disabled && { opacity: colors.pressedOpacity },
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={content} />
      ) : (
        <Icon size={size.icon.sm} color={content} />
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: size.iconButton,
    height: size.iconButton,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xs
  }
})
