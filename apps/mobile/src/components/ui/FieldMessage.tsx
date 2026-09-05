/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Text, StyleSheet, StyleProp, TextStyle } from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { text } from "../../styles/typography"
import { space } from "../../constants"

type FieldMessageVariant = "info" | "warning" | "error"

type FieldMessageProps = {
  children: React.ReactNode
  variant?: FieldMessageVariant
  style?: StyleProp<TextStyle>
}

export function FieldMessage({ children, variant = "info", style }: FieldMessageProps) {
  const { colors } = useTheme()
  const color = variant === "error" ? colors.error : variant === "warning" ? colors.warning : colors.textSecondary
  const isError = variant === "error"

  return (
    <Text
      accessibilityRole={isError ? "alert" : undefined}
      accessibilityLiveRegion={isError ? "polite" : "none"}
      style={[styles.message, { color }, style]}
    >
      {children}
    </Text>
  )
}

const styles = StyleSheet.create({
  message: {
    ...text.label,
    marginTop: space.xs
  }
})
