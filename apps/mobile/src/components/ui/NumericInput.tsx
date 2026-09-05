/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Text, StyleSheet } from "react-native"
import { useTheme } from "../../hooks/useTheme"
import { fontSizes, fonts } from "../../styles/typography"
import { space } from "../../constants"
import { TextField } from "./TextField"

interface NumericInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  unit: string
  placeholder?: string
  min?: number
  hint?: string
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
  testID
}: NumericInputProps) {
  const { colors } = useTheme()

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
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
        />
        <Text style={[styles.unit, { color: colors.textSecondary }]}>{unit}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: space.lg
  },
  label: {
    fontSize: fontSizes.body,
    ...fonts.semiBold,
    marginBottom: space.sm
  },
  hint: {
    fontSize: fontSizes.description,
    ...fonts.regular,
    marginBottom: space.md,
    lineHeight: 18
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
