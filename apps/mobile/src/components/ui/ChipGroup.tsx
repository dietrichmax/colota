/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Pressable, Text, StyleSheet } from "react-native"
import { ThemeColors } from "../../types/global"
import { useTheme } from "../../hooks/useTheme"
import { fontSizes, fonts } from "../../styles/typography"
import { space } from "../../constants"

interface ChipGroupProps<T extends string> {
  options: readonly { value: T; label: string; testID?: string }[]
  selected: T
  onSelect: (value: T) => void
  disabled?: ReadonlySet<T>
  /** Ignored: the group reads the theme itself. Kept so existing callers still compile. */
  colors?: ThemeColors
}

export function ChipGroup<T extends string>({ options, selected, onSelect, disabled }: ChipGroupProps<T>) {
  const { colors } = useTheme()

  return (
    <View style={styles.row}>
      {options.map(({ value, label, testID }) => {
        const isSelected = selected === value
        const isDisabled = disabled?.has(value) ?? false
        return (
          <Pressable
            key={value}
            testID={testID}
            disabled={isDisabled}
            style={({ pressed }) => [
              styles.chip,
              { borderColor: colors.border, backgroundColor: colors.background },
              isSelected && { borderColor: colors.primary, backgroundColor: colors.primary + "20" },
              isDisabled && { opacity: 0.4 },
              pressed && !isDisabled && { opacity: colors.pressedOpacity }
            ]}
            onPress={() => onSelect(value)}
          >
            <Text style={[styles.label, { color: isSelected ? colors.primary : colors.text }]}>{label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm
  },
  chip: {
    borderWidth: 2,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center"
  },
  label: {
    fontSize: fontSizes.caption,
    ...fonts.bold
  }
})
