/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React, { useCallback, useState } from "react"
import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native"
import { radius } from "@colota/shared"
import { useTheme } from "../../hooks/useTheme"
import { fonts, text } from "../../styles/typography"
import { size, space, STATE_LAYER_ALPHA } from "../../constants"
import { FocusRing } from "./FocusRing"
import { RadioDot } from "./RadioDot"

type IconComponent = React.ComponentType<{ size?: number; color?: string }>

type RadioRowProps = {
  label: string
  caption?: string
  description?: string
  selected: boolean
  onPress: () => void
  disabled?: boolean
  icon?: IconComponent
  accessory?: React.ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
  accessibilityLabel?: string
}

export function RadioRow({
  label,
  caption,
  description,
  selected,
  onPress,
  disabled = false,
  icon: Icon,
  accessory,
  style,
  testID,
  accessibilityLabel
}: RadioRowProps) {
  const { colors } = useTheme()
  const [focused, setFocused] = useState(false)

  const onFocus = useCallback(() => setFocused(true), [])
  const onBlur = useCallback(() => setFocused(false), [])

  const ink = disabled ? colors.textDisabled : colors.text
  const composedLabel = accessibilityLabel ?? [label, caption, description].filter(Boolean).join(", ")

  return (
    // The row is the radio: the dot is decoration, so the whole 56 is the target and
    // the state TalkBack reads sits on the node the user actually presses.
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={composedLabel}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={onFocus}
      onBlur={onBlur}
      android_ripple={disabled ? undefined : { color: colors.text + STATE_LAYER_ALPHA }}
      style={[styles.row, style]}
    >
      {Icon ? (
        <View style={styles.iconColumn} importantForAccessibility="no">
          <Icon size={size.icon.md} color={disabled ? colors.textDisabled : colors.textSecondary} />
        </View>
      ) : null}
      <View style={styles.content} importantForAccessibility="no">
        <View style={styles.titleRow}>
          <Text style={[styles.label, selected && fonts.semiBold, { color: ink }]}>{label}</Text>
          {accessory}
        </View>
        {caption ? (
          <Text style={[styles.caption, { color: disabled ? colors.textDisabled : colors.textSecondary }]}>
            {caption}
          </Text>
        ) : null}
        {description ? (
          <Text style={[styles.description, { color: disabled ? colors.textDisabled : colors.textLight }]}>
            {description}
          </Text>
        ) : null}
      </View>
      <RadioDot selected={selected} disabled={disabled} />
      <FocusRing visible={focused && !disabled} color={colors.primary} radius={radius.sm} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: size.row,
    paddingVertical: space.md
  },
  iconColumn: {
    width: size.iconColumn
  },
  content: {
    flex: 1,
    paddingEnd: space.md
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space.sm
  },
  label: {
    ...text.bodyStrong
  },
  caption: {
    ...text.label
  },
  description: {
    ...text.caption
  }
})
