/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, TouchableOpacity, StyleSheet, ViewStyle, StyleProp } from "react-native"
import { useTheme } from "../../hooks/useTheme"

type CardVariant = "default" | "elevated" | "outlined" | "interactive"

type CardProps = {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  danger?: boolean
  variant?: CardVariant
  onPress?: () => void
}

export function Card({ children, style, danger = false, variant = "default", onPress }: CardProps) {
  const { colors } = useTheme()

  const getVariantStyles = (): ViewStyle => {
    if (danger) {
      return {
        backgroundColor: colors.error + "10",
        borderColor: colors.error,
        borderWidth: 2
      }
    }

    switch (variant) {
      case "default":
        return {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1
        }
      case "elevated":
        return {
          backgroundColor: colors.cardElevated,
          borderColor: "transparent",
          borderWidth: 0,
          elevation: 4,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 6
        }
      case "outlined":
        return {
          backgroundColor: "transparent",
          borderColor: colors.border,
          borderWidth: 1.5
        }
      case "interactive":
        return {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderWidth: 1
        }
    }
  }

  const cardView = <View style={[styles.card, getVariantStyles(), style]}>{children}</View>

  if (variant === "interactive" && onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {cardView}
      </TouchableOpacity>
    )
  }

  return cardView
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    width: "100%"
  }
})
