/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Text, StyleSheet, View, Pressable } from "react-native"
import { ChevronRight } from "lucide-react-native"
import { useTheme } from "../../hooks/useTheme"
import { fontSizes, fonts } from "../../styles/typography"
import { size, space, STATE_LAYER_ALPHA } from "../../constants"

type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

type ListItemProps = {
  label: string
  sub?: string
  icon?: IconComponent
  /** Tints the leading icon; the default is `textLight`, or `textDisabled` while disabled. */
  iconColor?: string
  trailingIcon?: IconComponent
  /** A control of its own beside the body, behind a hairline: the row opens, the control allows. Replaces the chevron. */
  trailing?: React.ReactNode
  /** The sub wraps once when 2, for a row that must carry a full sentence beside a control. */
  subLines?: 1 | 2
  onPress: () => void
  testID?: string
  accessibilityRole?: "button" | "link"
  accessibilityHint?: string
  disabled?: boolean
  expanded?: boolean
}

export function ListItem({
  label,
  sub,
  icon: Icon,
  iconColor,
  trailingIcon: TrailingIcon = ChevronRight,
  trailing,
  subLines = 1,
  onPress,
  testID,
  accessibilityRole = "button",
  accessibilityHint,
  disabled = false,
  expanded
}: ListItemProps) {
  const { colors } = useTheme()
  const body = (
    <Pressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
      accessibilityHint={accessibilityHint ?? `Opens ${label}`}
      accessibilityState={{ disabled, expanded }}
      android_ripple={disabled ? undefined : { color: colors.text + STATE_LAYER_ALPHA }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.row, trailing !== undefined && styles.body]}
    >
      {Icon && (
        <View style={styles.icon}>
          <Icon size={size.icon.md} color={disabled ? colors.textDisabled : (iconColor ?? colors.textLight)} />
        </View>
      )}
      <View style={styles.content}>
        <Text style={[styles.label, { color: disabled ? colors.textDisabled : colors.text }]}>{label}</Text>
        {sub ? (
          <Text
            style={[styles.sub, { color: disabled ? colors.textDisabled : colors.textSecondary }]}
            numberOfLines={subLines}
          >
            {sub}
          </Text>
        ) : null}
      </View>
      {trailing === undefined && (
        <TrailingIcon size={size.icon.md} color={disabled ? colors.textDisabled : colors.textLight} />
      )}
    </Pressable>
  )
  if (trailing === undefined) return body
  return (
    <View style={styles.split}>
      {body}
      <View style={[styles.rule, { backgroundColor: colors.divider }]} />
      {trailing}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: size.row,
    paddingVertical: space.lg,
    marginHorizontal: -space.lg,
    paddingHorizontal: space.lg
  },
  // The body keeps the row's inset on its start edge only; the control after the rule sits at the card's own inset.
  split: {
    flexDirection: "row",
    alignItems: "center",
    marginEnd: -space.lg,
    paddingEnd: space.lg
  },
  body: {
    flex: 1,
    marginEnd: 0,
    paddingEnd: 0
  },
  rule: {
    width: StyleSheet.hairlineWidth,
    height: size.iconButton,
    marginHorizontal: space.md
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
    marginBottom: space.xxs
  },
  sub: {
    fontSize: fontSizes.description,
    ...fonts.regular
  }
})
