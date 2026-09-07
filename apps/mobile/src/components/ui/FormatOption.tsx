/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Text, StyleSheet, View, Pressable } from "react-native"
import type { LucideIcon } from "lucide-react-native"
import { fontSizes, fonts } from "../../styles/typography"
import { useTheme } from "../../hooks/useTheme"
import { RadioDot } from "./RadioDot"
import { size, space, STATE_LAYER_ALPHA } from "../../constants"

export const FormatOption = ({
  icon: Icon,
  title,
  subtitle,
  description,
  extension,
  selected,
  onPress
}: {
  icon: LucideIcon
  title: string
  subtitle: string
  description: string
  extension: string
  selected: boolean
  onPress: () => void
}) => {
  const { colors } = useTheme()

  return (
    <Pressable
      android_ripple={{ color: colors.text + STATE_LAYER_ALPHA }}
      style={styles.formatOption}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}, ${extension}, ${subtitle}`}
    >
      <RadioDot selected={selected} />
      <Icon size={size.icon.md} color={colors.textLight} />
      <View style={styles.textContent}>
        <Text style={[styles.formatTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.formatSubtitle, { color: colors.textSecondary }]}>
          {subtitle} · {extension}
        </Text>
        <Text style={[styles.formatDescription, { color: colors.textLight }]}>{description}</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  formatOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    marginHorizontal: -space.lg,
    paddingHorizontal: space.lg
  },
  textContent: {
    flex: 1
  },
  formatTitle: {
    fontSize: fontSizes.label,
    ...fonts.semiBold
  },
  formatSubtitle: {
    fontSize: fontSizes.description,
    marginTop: 2
  },
  formatDescription: {
    fontSize: fontSizes.caption,
    lineHeight: 16,
    marginTop: 2
  }
})
