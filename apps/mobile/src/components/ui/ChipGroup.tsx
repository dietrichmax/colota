/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useState } from "react"
import { View, Pressable, Text, StyleSheet } from "react-native"
import { Check } from "lucide-react-native"
import { radius } from "@colota/shared"
import { ThemeColors } from "../../types/global"
import { useTheme } from "../../hooks/useTheme"
import { fonts, text } from "../../styles/typography"
import { size, space, STATE_LAYER_ALPHA } from "../../constants"
import { FocusRing } from "./FocusRing"

type ChipOption<T extends string> = { value: T; label: string; testID?: string }

type NamedProps = { label: string; accessibilityLabel?: string } | { label?: undefined; accessibilityLabel: string }

type CommonProps<T extends string> = {
  options: readonly ChipOption<T>[]
  disabled?: ReadonlySet<T>
  testID?: string
  /** Ignored: every primitive reads useTheme itself. Kept so the existing JSX still compiles. */
  colors?: ThemeColors
} & NamedProps

type SingleProps<T extends string> = {
  multiple?: false
  selected: T
  onSelect: (value: T) => void
}

type MultipleProps<T extends string> = {
  multiple: true
  selected: ReadonlySet<T>
  onToggle: (value: T) => void
}

export type ChipGroupProps<T extends string> = CommonProps<T> & (SingleProps<T> | MultipleProps<T>)

export function ChipGroup<T extends string>(props: ChipGroupProps<T>) {
  const { options, disabled, label, accessibilityLabel, testID } = props
  const { colors } = useTheme()

  const groupName = accessibilityLabel ?? label

  return (
    <View testID={testID}>
      {label ? <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{label}</Text> : null}
      <View
        style={styles.row}
        accessibilityRole={props.multiple ? undefined : "radiogroup"}
        accessibilityLabel={groupName}
      >
        {options.map((option) => (
          <Chip
            key={option.value}
            option={option}
            checked={props.multiple ? props.selected.has(option.value) : props.selected === option.value}
            disabled={disabled?.has(option.value) ?? false}
            multiple={props.multiple === true}
            onPress={props.multiple ? props.onToggle : props.onSelect}
          />
        ))}
      </View>
    </View>
  )
}

type ChipProps<T extends string> = {
  option: ChipOption<T>
  checked: boolean
  disabled: boolean
  multiple: boolean
  onPress: (value: T) => void
}

function Chip<T extends string>({ option, checked, disabled, multiple, onPress }: ChipProps<T>) {
  const { colors } = useTheme()
  const [focused, setFocused] = useState(false)

  const onFocus = useCallback(() => setFocused(true), [])
  const onBlur = useCallback(() => setFocused(false), [])

  const ink = disabled ? colors.textDisabled : checked ? colors.onPrimaryContainer : colors.text
  const fill = checked && !disabled ? colors.primaryContainer : colors.well

  return (
    // The 36 chip is painted inside a 48 Pressable rather than given hitSlop, because
    // hitSlop widens touch dispatch only and leaves the accessibility node at 36.
    <Pressable
      testID={option.testID}
      accessibilityRole={multiple ? "checkbox" : "radio"}
      accessibilityLabel={option.label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onPress(option.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      android_ripple={disabled ? undefined : { color: ink + STATE_LAYER_ALPHA }}
      style={styles.target}
    >
      <View style={[styles.chip, { backgroundColor: fill }]}>
        {checked ? (
          <View importantForAccessibility="no">
            <Check size={size.icon.sm} color={ink} />
          </View>
        ) : null}
        <Text style={[styles.label, checked && fonts.semiBold, { color: ink }]}>{option.label}</Text>
      </View>
      <FocusRing visible={focused && !disabled} color={colors.primary} radius={radius.sm} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  groupLabel: {
    ...text.label,
    marginBottom: space.sm
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.md
  },
  target: {
    minHeight: size.touch,
    justifyContent: "center"
  },
  chip: {
    minHeight: size.chip,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs
  },
  label: {
    ...text.label
  }
})
