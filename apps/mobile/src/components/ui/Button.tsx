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
import { size, space } from "../../constants"

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger"

type Props = {
  title: string
  onPress: (event: GestureResponderEvent) => void
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  activeOpacity?: number
  color?: string
  variant?: ButtonVariant
  icon?: LucideIcon
  loading?: boolean
  expanded?: boolean
  testID?: string
}

export function Button({
  title,
  onPress,
  disabled = false,
  style,
  activeOpacity,
  color,
  variant = "primary",
  icon: Icon,
  loading = false,
  expanded,
  testID
}: Props) {
  const { colors } = useTheme()
  const getVariantStyles = () => {
    switch (variant) {
      case "primary":
        return {
          bg: disabled ? colors.textDisabled : colors.primary,
          text: color ?? colors.textOnPrimary,
          borderColor: "transparent",
          borderWidth: 0
        }
      case "secondary":
        return {
          bg: disabled ? colors.textDisabled : colors.primaryContainer,
          text: color ?? colors.onPrimaryContainer,
          borderColor: "transparent",
          borderWidth: 0
        }
      case "ghost":
        return {
          bg: "transparent",
          text: color ?? colors.primaryDark,
          borderColor: "transparent",
          borderWidth: 0
        }
      case "danger":
        return {
          bg: disabled ? colors.textDisabled : colors.error,
          text: color ?? colors.textOnPrimary,
          borderColor: "transparent",
          borderWidth: 0
        }
    }
  }

  const v = getVariantStyles()

  return (
    <View style={style}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || loading, expanded }}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: v.bg,
            borderColor: v.borderColor,
            borderWidth: v.borderWidth,
            borderRadius: colors.borderRadius,
            opacity: pressed ? (activeOpacity ?? colors.pressedOpacity) : 1
          }
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
