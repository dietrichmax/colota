/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useRef, useCallback } from "react"
import {
  Pressable,
  Text,
  View,
  Animated,
  ActivityIndicator,
  StyleSheet,
  GestureResponderEvent,
  StyleProp,
  ViewStyle
} from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { fonts } from "../../styles/typography"
import { type LucideIcon } from "lucide-react-native"

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
  loading = false
}: Props) {
  const { colors } = useTheme()
  const scale = useRef(new Animated.Value(1)).current

  const handlePressIn = useCallback(() => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4
    }).start()
  }, [scale])

  const handlePressOut = useCallback(() => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4
    }).start()
  }, [scale])

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
          bg: "transparent",
          text: color ?? colors.primaryDark,
          borderColor: colors.primary,
          borderWidth: 1.5
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
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: v.bg,
            borderColor: v.borderColor,
            borderWidth: v.borderWidth,
            borderRadius: colors.borderRadius,
            opacity: pressed ? (activeOpacity ?? 0.7) : 1
          }
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
      >
        <View style={styles.content}>
          {loading ? (
            <ActivityIndicator size="small" color={v.text} style={styles.icon} />
          ) : Icon ? (
            <Icon size={18} color={v.text} style={styles.icon} />
          ) : null}
          <Text style={[styles.text, { color: v.text }]}>{title}</Text>
        </View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    marginVertical: 8
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  text: {
    fontSize: 16,
    ...fonts.semiBold
  },
  icon: {
    marginRight: 0
  }
})
