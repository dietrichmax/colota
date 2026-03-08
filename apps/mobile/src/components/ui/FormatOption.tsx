/**
 * Copyright (C) 2026 Max Dietrich
 * Licensed under the GNU AGPLv3. See LICENSE in the project root for details.
 */

import React from "react"
import { Text, StyleSheet, View, Pressable } from "react-native"
import type { LucideIcon } from "lucide-react-native"
import { fonts } from "../../styles/typography"
import { useTheme } from "../../hooks/useTheme"
import { RadioDot } from "./RadioDot"

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
      style={({ pressed }) => [styles.formatOption, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <View style={styles.formatContent}>
        <View style={styles.leftContent}>
          <Icon size={28} color={colors.primaryDark} />
          <View style={styles.textContent}>
            <View style={styles.titleRow}>
              <Text
                style={[
                  styles.formatTitle,
                  selected ? { color: colors.primaryDark, ...fonts.bold } : { color: colors.text }
                ]}
              >
                {title}
              </Text>
              <View
                style={[
                  styles.extensionBadge,
                  {
                    backgroundColor: selected ? colors.primary + "20" : colors.primary + "15",
                    borderColor: selected ? colors.primary + "60" : colors.primary + "30"
                  }
                ]}
              >
                <Text style={[styles.extensionText, { color: colors.primaryDark }]}>{extension}</Text>
              </View>
            </View>
            <Text style={[styles.formatSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
            <Text style={[styles.formatDescription, { color: colors.textLight }]}>{description}</Text>
          </View>
        </View>

        <RadioDot selected={selected} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  formatOption: {
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  formatContent: {
    flexDirection: "row",
    alignItems: "center"
  },
  leftContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  textContent: {
    flex: 1
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2
  },
  formatTitle: {
    fontSize: 16,
    ...fonts.semiBold,
    letterSpacing: -0.2
  },
  extensionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1
  },
  extensionText: {
    fontSize: 10,
    ...fonts.bold,
    letterSpacing: 0.3
  },
  formatSubtitle: {
    fontSize: 13,
    marginBottom: 2
  },
  formatDescription: {
    fontSize: 12,
    lineHeight: 16
  }
})
