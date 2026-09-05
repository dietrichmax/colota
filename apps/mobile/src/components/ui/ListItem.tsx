/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Text, StyleSheet, View, Pressable } from "react-native"
import { ChevronRight } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { fontSizes, fonts } from "../../styles/typography"
import { size, space } from "../../constants"

type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

type ListItemProps = {
  label: string
  sub?: string
  icon?: IconComponent
  trailingIcon?: IconComponent
  onPress: () => void
  testID?: string
  accessibilityRole?: "button" | "link"
  accessibilityHint?: string
  disabled?: boolean
}

export function ListItem({
  label,
  sub,
  icon: Icon,
  trailingIcon: TrailingIcon = ChevronRight,
  onPress,
  testID,
  accessibilityRole = "button",
  accessibilityHint,
  disabled = false
}: ListItemProps) {
  const { colors } = useTheme()
  return (
    <Pressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint ?? `Opens ${label}`}
      accessibilityState={{ disabled }}
      android_ripple={disabled ? undefined : { color: colors.border }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && !disabled && { opacity: colors.pressedOpacity }]}
    >
      {Icon && (
        <View style={styles.icon}>
          <Icon size={size.icon.md} color={disabled ? colors.textDisabled : colors.textLight} />
        </View>
      )}
      <View style={styles.content}>
        <Text style={[styles.label, { color: disabled ? colors.textDisabled : colors.text }]}>{label}</Text>
        {sub ? (
          <Text style={[styles.sub, { color: disabled ? colors.textDisabled : colors.textSecondary }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <TrailingIcon size={size.icon.md} color={disabled ? colors.textDisabled : colors.textLight} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    paddingVertical: 10
  },
  icon: {
    marginEnd: space.lg
  },
  content: {
    flex: 1,
    paddingEnd: space.sm
  },
  label: {
    fontSize: fontSizes.label,
    ...fonts.semiBold,
    marginBottom: 2
  },
  sub: {
    fontSize: fontSizes.description,
    ...fonts.regular
  }
})
