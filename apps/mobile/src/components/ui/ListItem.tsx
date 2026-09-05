/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Text, StyleSheet, View, Pressable, type StyleProp, type ViewStyle } from "react-native"
import { ChevronRight } from "lucide-react-native"
import { radius } from "@colota/shared"
import { useTheme } from "../../hooks/useTheme"
import { text } from "../../styles/typography"
import { size, space, STATE_LAYER_ALPHA } from "../../constants"
import { Divider } from "./Divider"

// The status and trip dots read as part of the label line, not as a leading icon column.
const DOT_SIZE = 8

type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

type ListItemProps = {
  label: string
  dot?: string
  sub?: string
  value?: string
  icon?: IconComponent
  trailingIcon?: IconComponent | null
  trailing?: React.ReactNode
  onPress?: () => void
  divider?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
  accessibilityRole?: "button" | "link"
  accessibilityLabel?: string
  accessibilityHint?: string
}

export function ListItem({
  label,
  dot,
  sub,
  value,
  icon: Icon,
  trailingIcon,
  trailing,
  onPress,
  divider = false,
  style,
  testID,
  accessibilityRole = "button",
  accessibilityLabel,
  accessibilityHint
}: ListItemProps) {
  const { colors } = useTheme()

  const TrailingIcon = trailingIcon === undefined && onPress ? ChevronRight : trailingIcon
  const composedLabel = accessibilityLabel ?? [label, sub, value].filter(Boolean).join(", ")

  const trailingSlot =
    trailing ??
    (value ? (
      <Text style={[styles.value, { color: colors.text }]} importantForAccessibility="no">
        {value}
      </Text>
    ) : null)

  const body = (
    <>
      {Icon ? (
        <View style={styles.iconColumn} importantForAccessibility="no">
          <Icon size={size.icon.md} color={colors.textSecondary} />
        </View>
      ) : null}
      <View style={styles.content} accessible={!onPress} accessibilityLabel={onPress ? undefined : composedLabel}>
        <View style={styles.labelRow}>
          {dot ? <View style={[styles.dot, { backgroundColor: dot }]} importantForAccessibility="no" /> : null}
          <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        </View>
        {sub ? <Text style={[styles.sub, { color: colors.textSecondary }]}>{sub}</Text> : null}
      </View>
      {trailingSlot}
      {TrailingIcon ? (
        <View importantForAccessibility="no">
          <TrailingIcon size={size.icon.md} color={colors.textLight} />
        </View>
      ) : null}
    </>
  )

  const row = onPress ? (
    <Pressable
      testID={testID}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={composedLabel}
      accessibilityHint={accessibilityHint ?? `Opens ${label}`}
      android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
      onPress={onPress}
      style={[styles.row, style]}
    >
      {body}
    </Pressable>
  ) : (
    <View testID={testID} style={[styles.row, style]}>
      {body}
    </View>
  )

  if (!divider) return row

  return (
    <View>
      {row}
      <Divider tight inset={Icon ? size.iconColumn : 0} />
    </View>
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
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: radius.pill
  },
  label: {
    ...text.bodyStrong
  },
  sub: {
    ...text.label
  },
  value: {
    ...text.figureInline
  }
})
