/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Pressable, StyleSheet, ViewStyle, StyleProp, AccessibilityRole, AccessibilityState } from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { space, STATE_LAYER_ALPHA, elevation } from "../../constants"
import { radius } from "@colota/shared"

type CardVariant = "default" | "elevated" | "outlined" | "interactive"

type CardProps = {
  children: React.ReactNode
  /** Lands on the surface inside the Pressable, so a margin here grows the ripple box past the
   *  card it paints. Spacing between cards belongs to the list. */
  style?: StyleProp<ViewStyle>
  testID?: string
  danger?: boolean
  variant?: CardVariant
  /** A card that is nothing but rows: it gives up its vertical padding so the first and last
   *  row's state layer reaches its edge. The rows already carry the spacing. */
  rows?: boolean
  onPress?: () => void
  onLongPress?: () => void
  accessibilityRole?: AccessibilityRole
  accessibilityLabel?: string
  accessibilityHint?: string
  accessibilityState?: AccessibilityState
}

export function Card({
  children,
  style,
  danger = false,
  variant = "default",
  rows = false,
  onPress,
  onLongPress,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  testID
}: CardProps) {
  const { colors } = useTheme()

  const getVariantStyles = (): ViewStyle => {
    if (danger) {
      return {
        backgroundColor: colors.error + "12",
        borderColor: colors.error,
        borderWidth: 2
      }
    }

    switch (variant) {
      case "default":
        return {
          backgroundColor: colors.card
        }
      case "elevated":
        return {
          backgroundColor: colors.card,
          borderColor: "transparent",
          borderWidth: 0,
          elevation: elevation.raised
        }
      case "outlined":
        return {
          backgroundColor: "transparent",
          borderColor: colors.border,
          // Material's outlined card is 1dp. It was 1.5 only to stay visible while border sat at
          // 1.18:1; the token clears the outline floor now, so the weight goes back to the spec.
          borderWidth: 1
        }
      case "interactive":
        return {
          backgroundColor: colors.card
        }
    }
  }

  const cardView = (
    <View style={[styles.card, rows && styles.rowsCard, getVariantStyles(), style]} testID={testID}>
      {children}
    </View>
  )

  if (variant === "interactive" && (onPress || onLongPress)) {
    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={accessibilityState}
        android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
        style={styles.pressable}
      >
        {cardView}
      </Pressable>
    )
  }

  return cardView
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: space.lg,
    borderRadius: radius.md,
    width: "100%",
    // A row inside the card ripples to its own bounds, so the card has to clip the corners.
    overflow: "hidden"
  },
  rowsCard: {
    paddingVertical: 0
  },
  pressable: {
    borderRadius: radius.md,
    overflow: "hidden"
  }
})
