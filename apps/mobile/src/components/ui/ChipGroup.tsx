/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { View, Pressable, Text, StyleSheet } from "react-native"
import { Check } from "lucide-react-native"
import { ThemeColors } from "../../types/global"
import { useTheme } from "../../hooks/useTheme"
import { fontSizes, fonts } from "../../styles/typography"
import { size, space, STATE_LAYER_ALPHA } from "../../constants"
import { radius } from "@colota/shared"

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
        // Disabled recolours the content rather than fading the chip, so the fill still reads
        // as a chip and the selected one still says which it is.
        const content = isDisabled ? colors.textDisabled : isSelected ? colors.onPrimaryContainer : colors.text
        return (
          <Pressable
            key={value}
            testID={testID}
            disabled={isDisabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected, disabled: isDisabled }}
            android_ripple={isDisabled ? undefined : { color: content + STATE_LAYER_ALPHA }}
            style={[styles.chip, { backgroundColor: isSelected ? colors.primaryContainer : colors.well }]}
            onPress={() => onSelect(value)}
          >
            {isSelected ? <Check size={size.icon.sm} color={content} strokeWidth={2} /> : null}
            <Text style={[styles.label, isSelected && styles.labelSelected, { color: content }]}>{label}</Text>
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
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    minHeight: size.chip,
    borderRadius: radius.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md
  },
  label: {
    fontSize: fontSizes.caption,
    ...fonts.medium
  },
  // Selection is a check and a weight step as well as the fill, so it does not rest on colour alone.
  labelSelected: {
    ...fonts.semiBold
  }
})
