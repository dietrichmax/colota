/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useState } from "react"
import {
  Pressable,
  Text,
  View,
  ActivityIndicator,
  StyleSheet,
  GestureResponderEvent,
  StyleProp,
  ViewStyle
} from "react-native"
import { type LucideIcon } from "lucide-react-native"
import { radius } from "@colota/shared"
import { useTheme } from "../../hooks/useTheme"
import { text } from "../../styles/typography"
import { size, space, STATE_LAYER_ALPHA } from "../../constants"
import { FocusRing } from "./FocusRing"

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "dangerGhost"

type Props = {
  title: string
  onPress: (event: GestureResponderEvent) => void
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  variant?: ButtonVariant
  icon?: LucideIcon
  loading?: boolean
  shape?: "rounded" | "pill"
  elevation?: number
  align?: "center" | "start"
  testID?: string
  accessibilityLabel?: string
  accessibilityHint?: string
}

export function Button({
  title,
  onPress,
  disabled = false,
  style,
  variant = "primary",
  icon: Icon,
  loading = false,
  shape = "rounded",
  elevation,
  align = "center",
  testID,
  accessibilityLabel,
  accessibilityHint
}: Props) {
  const { colors } = useTheme()
  const [focused, setFocused] = useState(false)

  const onFocus = useCallback(() => setFocused(true), [])
  const onBlur = useCallback(() => setFocused(false), [])

  const inactive = disabled || loading
  const filled = variant === "primary" || variant === "secondary" || variant === "danger"

  const fill = (): string => {
    if (inactive) return filled ? colors.well : "transparent"
    switch (variant) {
      case "primary":
        return colors.primary
      case "secondary":
        return colors.primaryContainer
      case "danger":
        return colors.error
      default:
        return "transparent"
    }
  }

  const ink = (): string => {
    if (inactive) return colors.textDisabled
    switch (variant) {
      case "primary":
      case "danger":
        return colors.textOnPrimary
      case "secondary":
        return colors.onPrimaryContainer
      case "dangerGhost":
        return colors.error
      default:
        return colors.primaryDark
    }
  }

  const contentColor = ink()
  // Android draws the shadow from the node that carries the elevation, so shape and
  // elevation ride on the node that paints the fill or a pill casts a square shadow.
  const cornerRadius = shape === "pill" ? radius.pill : radius.sm
  const ringColor = variant === "primary" || variant === "danger" ? colors.textOnPrimary : colors.primary

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      android_ripple={inactive ? undefined : { color: contentColor + STATE_LAYER_ALPHA }}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      disabled={inactive}
      style={[
        styles.button,
        align === "start" && styles.alignStart,
        { backgroundColor: fill(), borderRadius: cornerRadius },
        elevation === undefined ? null : { elevation },
        style
      ]}
    >
      <View style={styles.content} importantForAccessibility="no">
        {loading ? (
          <ActivityIndicator size="small" color={contentColor} />
        ) : Icon ? (
          <Icon size={size.icon.md} color={contentColor} />
        ) : null}
        <Text style={[styles.title, { color: contentColor }]}>{title}</Text>
      </View>
      <FocusRing visible={focused && !inactive} color={ringColor} radius={cornerRadius} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    minHeight: size.touch,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center"
  },
  alignStart: {
    alignItems: "flex-start"
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm
  },
  title: {
    ...text.bodyStrong
  }
})
