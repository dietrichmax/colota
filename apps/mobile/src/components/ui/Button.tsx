/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
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
import { useTheme } from "../../hooks/useTheme"
import { fontSizes, fonts } from "../../styles/typography"
import { type LucideIcon } from "lucide-react-native"
import { elevation, size, space, STATE_LAYER_ALPHA } from "../../constants"
import { radius } from "@colota/shared"

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"
type ButtonShape = "rounded" | "pill"

type Props = {
  activeOpacity?: number
  title: string
  onPress: (event: GestureResponderEvent) => void
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  color?: string
  variant?: ButtonVariant
  /** The corner is painted inside, so a caller cannot set it through `style`. */
  shape?: ButtonShape
  icon?: LucideIcon
  loading?: boolean
  expanded?: boolean
  /** Lifts the painted Pressable; a shadow on the wrapper draws nothing because it has no fill. */
  floating?: boolean
  testID?: string
}

export function Button({
  title,
  onPress,
  disabled = false,
  style,
  color,
  variant = "primary",
  shape = "rounded",
  icon: Icon,
  loading = false,
  expanded,
  floating = false,
  testID
}: Props) {
  const { colors } = useTheme()
  const getVariantStyles = () => {
    // Disabled recedes: the container drops to the recessed fill and the content to the disabled
    // token. Painting the fill itself disabled left a filled button wearing its enabled label.
    if (disabled) {
      return { bg: variant === "ghost" ? "transparent" : colors.well, text: colors.textDisabled }
    }
    switch (variant) {
      case "primary":
        return { bg: colors.primary, text: color ?? colors.textOnPrimary }
      case "secondary":
        return { bg: colors.primaryContainer, text: color ?? colors.onPrimaryContainer }
      case "ghost":
        return { bg: "transparent", text: color ?? colors.primaryDark }
      case "danger":
        return { bg: colors.error, text: color ?? colors.textOnPrimary }
    }
  }

  const v = getVariantStyles()

  return (
    <View style={style}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || loading, expanded }}
        android_ripple={disabled || loading ? undefined : { color: v.text + STATE_LAYER_ALPHA }}
        style={[
          styles.button,
          { backgroundColor: v.bg, borderRadius: shape === "pill" ? radius.pill : radius.sm },
          floating && { elevation: elevation.floating }
        ]}
        onPress={onPress}
        disabled={disabled || loading}
      >
        <View style={styles.content}>
          {loading ? (
            <ActivityIndicator size="small" color={v.text} style={styles.icon} />
          ) : Icon ? (
            <Icon size={size.icon.md} color={v.text} style={styles.icon} />
          ) : null}
          <Text style={[styles.text, { color: v.text }]}>{title}</Text>
        </View>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  button: {
    // Android's minimum touch target; padding alone leaves this at about 43.
    minHeight: size.touch,
    overflow: "hidden",
    justifyContent: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
    alignItems: "center",
    marginVertical: space.sm
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm
  },
  text: {
    fontSize: fontSizes.label,
    ...fonts.semiBold
  },
  icon: {
    marginEnd: 0
  }
})
