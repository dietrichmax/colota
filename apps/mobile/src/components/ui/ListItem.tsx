/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Text, StyleSheet, View, Pressable } from "react-native"
import { ChevronRight } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { fonts } from "../../styles/typography"

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
}

export function ListItem({
  label,
  sub,
  icon: Icon,
  trailingIcon: TrailingIcon = ChevronRight,
  onPress,
  testID,
  accessibilityRole = "button",
  accessibilityHint
}: ListItemProps) {
  const { colors } = useTheme()
  return (
    <Pressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint ?? `Opens ${label}`}
      android_ripple={{ color: colors.border }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: colors.pressedOpacity }]}
    >
      {Icon && (
        <View style={styles.icon}>
          <Icon size={22} color={colors.textLight} />
        </View>
      )}
      <View style={styles.content}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        {sub ? (
          <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <TrailingIcon size={20} color={colors.textLight} />
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
    marginRight: 16
  },
  content: {
    flex: 1,
    paddingRight: 8
  },
  label: {
    fontSize: 16,
    ...fonts.semiBold,
    marginBottom: 2
  },
  sub: {
    fontSize: 13,
    ...fonts.regular
  }
})
