/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Text, StyleSheet, useWindowDimensions } from "react-native"
import { ThemeColors } from "../../types/global"
import { useTheme } from "../../hooks/useTheme"
import { text } from "../../styles/typography"
import { space } from "../../constants"
import { SettingRow } from "./SettingRow"
import { TextField } from "./TextField"

const FIELD_WIDTH = 72
const CONTENT_SIZED_FROM = 1.3

interface NumericInputProps {
  label?: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  unit: string
  placeholder?: string
  min?: number
  hint?: string
  accessibilityLabel?: string
  testID?: string
  /** Ignored: every primitive reads useTheme itself. Kept so the existing JSX still compiles. */
  colors?: ThemeColors
}

export function NumericInput({
  label,
  value,
  onChange,
  onBlur,
  unit,
  placeholder = "0",
  hint,
  accessibilityLabel,
  testID
}: NumericInputProps) {
  const { colors } = useTheme()
  const { fontScale } = useWindowDimensions()

  const name = accessibilityLabel ?? label ?? unit

  const field = (
    <View style={styles.fieldRow}>
      <TextField
        testID={testID}
        accessibilityLabel={name}
        accessibilityHint={unit}
        figure
        keyboardType="numeric"
        value={value}
        onChangeText={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        containerStyle={fontScale > CONTENT_SIZED_FROM ? styles.fieldContent : styles.fieldFixed}
      />
      <Text style={[styles.unit, { color: colors.textSecondary }]} importantForAccessibility="no">
        {unit}
      </Text>
    </View>
  )

  if (!label) return field

  return (
    <SettingRow label={label} hint={hint}>
      {field}
    </SettingRow>
  )
}

const styles = StyleSheet.create({
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm
  },
  fieldFixed: {
    width: FIELD_WIDTH
  },
  fieldContent: {
    minWidth: FIELD_WIDTH
  },
  unit: {
    ...text.label
  }
})
