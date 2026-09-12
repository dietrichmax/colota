/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import type { ThemeColors } from "../../types/global"
import React from "react"
import { View, Text, StyleSheet } from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { fontSizes, fonts, lineHeights } from "../../styles/typography"
import { space } from "../../constants"
import { TextField } from "./TextField"
import { FieldMessage } from "./FieldMessage"

interface NumericInputProps {
  colors?: ThemeColors
  label: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  unit: string
  placeholder?: string
  min?: number
  hint?: string
  /** Shown under the box while the text would not be stored; the box takes the error ring. */
  error?: string
  /** A transient note under the box, such as the value a blur clamped to. */
  message?: string
  testID?: string
}

/**
 * A validated numeric field with its own label, an optional hint and a unit beside it. The
 * label stays here rather than on the TextField because the unit sits in the same row.
 */
export function NumericInput({
  label,
  value,
  onChange,
  onBlur,
  unit,
  placeholder = "0",
  hint,
  error,
  message,
  testID
}: NumericInputProps) {
  const { colors } = useTheme()

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      {hint && <Text style={[styles.hint, { color: colors.textSecondary }]}>{hint}</Text>}

      <View style={styles.inputRow}>
        <TextField
          accessibilityLabel={label}
          testID={testID}
          figure
          style={styles.field}
          keyboardType="numeric"
          value={value}
          onChangeText={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          error={error}
        />
        <Text style={[styles.unit, { color: colors.textSecondary }]}>{unit}</Text>
      </View>
      {message ? <FieldMessage>{message}</FieldMessage> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: space.lg
  },
  label: {
    fontSize: fontSizes.description,
    ...fonts.medium,
    marginBottom: space.sm
  },
  hint: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    marginBottom: space.md,
    lineHeight: lineHeights.description
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md
  },
  field: {
    flex: 1
  },
  unit: {
    fontSize: fontSizes.input,
    ...fonts.medium,
    minWidth: 64
  }
})
