/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, TouchableOpacity, Text, StyleSheet } from "react-native"
import { ThemeColors } from "../../types/global"
import { fonts } from "../../styles/typography"

interface ChipGroupProps<T extends string> {
  options: readonly { value: T; label: string }[]
  selected: T
  onSelect: (value: T) => void
  colors: ThemeColors
}

export function ChipGroup<T extends string>({ options, selected, onSelect, colors }: ChipGroupProps<T>) {
  return (
    <View style={styles.row}>
      {options.map(({ value, label }) => {
        const isSelected = selected === value
        return (
          <TouchableOpacity
            key={value}
            style={[
              styles.chip,
              { borderColor: colors.border, backgroundColor: colors.background },
              isSelected && { borderColor: colors.primary, backgroundColor: colors.primary + "20" }
            ]}
            onPress={() => onSelect(value)}
            activeOpacity={0.7}
          >
            <Text style={[styles.label, { color: isSelected ? colors.primary : colors.text }]}>{label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center"
  },
  label: {
    fontSize: 12,
    ...fonts.bold
  }
})
