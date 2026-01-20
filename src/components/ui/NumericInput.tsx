/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react";
import { View, Text, StyleSheet, TextInput } from "react-native";
import { ThemeColors } from "../../types/global";

interface NumericInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  unit: string;
  placeholder?: string;
  min?: number;
  colors: ThemeColors;
  hint?: string;
}

/**
 * NumericInput Component
 *
 * A validated numeric input field with:
 * - Label and optional hint text
 * - Unit display (e.g., "seconds", "meters")
 * - Numeric keyboard
 * - Change and blur handlers for validation
 * - Themed styling
 *
 * Used for interval, distance, and threshold inputs.
 */
export function NumericInput({
  label,
  value,
  onChange,
  onBlur,
  unit,
  placeholder = "0",
  colors,
  hint,
}: NumericInputProps) {
  return (
    <View style={styles.container}>
      {/* Label */}
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>

      {/* Hint (optional) */}
      {hint && (
        <Text style={[styles.hint, { color: colors.textLight }]}>{hint}</Text>
      )}

      {/* Input Row */}
      <View style={styles.inputRow}>
        <TextInput
          style={[
            styles.input,
            {
              borderColor: colors.border,
              color: colors.text,
              backgroundColor: colors.backgroundElevated,
            },
          ]}
          keyboardType="numeric"
          value={value}
          onChangeText={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
          placeholderTextColor={colors.placeholder}
        />
        <Text style={[styles.unit, { color: colors.textSecondary }]}>
          {unit}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    fontStyle: "italic",
    marginBottom: 12,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    padding: 14,
    borderRadius: 12,
    fontSize: 15,
    textAlign: "center",
  },
  unit: {
    fontSize: 15,
    fontWeight: "500",
  },
});
